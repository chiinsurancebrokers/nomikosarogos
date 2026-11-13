// retrieve.js — hybrid retrieval over pgvector.
//
// Pure vector search confuses lay wording with the wrong legal sense (e.g. a rental-deposit
// question pulls loan-guarantor articles because "εγγύηση" ≈ "εγγυητής" in embedding space).
// So we combine TWO signals:
//   • semantic: cosine nearest-neighbours on the (expanded) query embedding
//   • lexical: chunks whose text actually contains the query's legal terms (accent-insensitive)
// then merge and re-rank. The lexical leg surfaces the right articles even when the embedding
// ranks them low, and the semantic leg keeps recall for paraphrases.

import { embed } from "./embeddings.js";
import { pool } from "./db.js";
import { ANCHORS } from "./anchors.js";

// Strip Greek accents/diacritics so "μίσθωση" and "μισθωτής" share the stem "μισθ".
const deaccent = (s) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const STOP = new Set([
  "νομικες", "εννοιες", "σχετικα", "δηλαδη", "οποιος", "οποια", "οποιο", "πρεπει",
  "μπορει", "επισης", "ωστοσο", "καθως", "αλλα", "οταν", "ειναι", "εχει", "θεμα",
  "θεματα", "ορους", "ορος", "ζητημα", "ζητηματα", "περιπτωση", "γενικα",
  "σχετικες", "σχετικη", "σχετικο", "εφαρμοζονται", "ταιριαζουν",
]);

// Pull distinctive long terms from the (expanded) query for the lexical leg.
function keyTerms(text) {
  const seen = new Set();
  const out = [];
  for (const raw of deaccent(text).split(/[^a-zα-ω0-9]+/)) {
    if (raw.length < 5 || STOP.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= 12) break;
  }
  return out;
}

// Which concept anchors does this (expanded) query fire? Returns [{code, article}] pairs.
export function firedAnchors(searchText, area) {
  const hay = deaccent(searchText);
  const out = [];
  for (const a of ANCHORS) {
    if (area === "civil" && a.area === "criminal") continue;
    if (area === "criminal" && a.area === "civil") continue;
    if (a.unless && a.unless.some((t) => hay.includes(deaccent(t)))) continue;
    if (a.triggers.some((t) => hay.includes(deaccent(t)))) {
      for (const art of a.articles) out.push({ code: a.code, article: String(art) });
    }
  }
  // dedupe + cap so the source list never floods
  const seen = new Set();
  return out
    .filter((p) => { const k = `${p.code}|${p.article}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, 8);
}

async function fetchAnchorChunks(pairs) {
  if (!pairs.length) return [];
  const codes = pairs.map((p) => p.code);
  const arts = pairs.map((p) => p.article);
  // ALL chunks of each anchored article, in text order (long articles are split into several
  // chunks, and the rule the user needs may sit in a later one). Capped so anchors can't flood.
  const sql = `
    SELECT c.code_name, c.area, c.article, c.content
    FROM chunks c
    JOIN unnest($1::text[], $2::text[]) AS w(code, art)
      ON c.code_name = w.code AND c.article = w.art
    ORDER BY c.code_name, c.article, c.id
    LIMIT 12`;
  try {
    return (await pool.query(sql, [codes, arts])).rows;
  } catch (e) {
    console.error("anchor fetch failed (skipping anchors):", e?.message);
    return [];
  }
}

// Combine anchor chunks and ranked search hits into the final source list (≤ k).
// Several chunks of the SAME article are kept (up to perArticleCap) — they are distinct pieces of
// text that share one label. Exact duplicates are dropped. Anchor chunks are flagged `anchored`
// so later filters never remove them: the question named that institution explicitly.
export function mergeSources(anchorRows, scored, k, perArticleCap = 3) {
  const out = [];
  const seen = new Set();
  const perRef = new Map();
  const push = (ref, text, score, anchored) => {
    const key = `${ref}|${text.slice(0, 80)}`;
    if (seen.has(key)) return;
    if (!anchored && (perRef.get(ref) || 0) >= perArticleCap) return;
    seen.add(key);
    perRef.set(ref, (perRef.get(ref) || 0) + 1);
    out.push(anchored ? { ref, text, score, anchored: true } : { ref, text, score });
  };
  for (const r of anchorRows) push(`${r.code_name} άρθρο ${r.article}`, r.content, 1, true);
  for (const { r, score } of scored) {
    if (out.length >= k) break;
    const ref = r.article ? `${r.code_name} άρθρο ${r.article}` : r.decision ? r.decision : r.code_name;
    push(ref, r.content, score, false);
  }
  return out;
}

export async function retrieveSources(searchText, area, k = Number(process.env.RETRIEVE_K) || 16) {
  if (!searchText || !searchText.trim()) return [];

  const [qvec] = await embed(searchText);
  const vecLiteral = `[${qvec.join(",")}]`;
  const useFilter = area === "civil" || area === "criminal" || area === "admin";
  // Decisions require explicit approval. Older decision rows with NULL review_status
  // are not implicitly trusted. Other sources retain their existing review policy.
  const REVIEW_OK = "((source = 'decisions' AND review_status = 'approved') OR (source <> 'decisions' AND (review_status IS NULL OR review_status = 'approved')))";
  const areaClause = useFilter ? `WHERE area = $3 AND ${REVIEW_OK}` : `WHERE ${REVIEW_OK}`;

  // ── semantic leg: vector nearest neighbours (a generous candidate pool) ──
  const poolN = Math.max(k * 3, 48);
  const vecSql = `
    SELECT code_name, area, article, decision, content, 1 - (embedding <=> $1) AS vscore
    FROM chunks ${areaClause}
    ORDER BY embedding <=> $1
    LIMIT $2`;
  const vecParams = useFilter ? [vecLiteral, poolN, area] : [vecLiteral, poolN];
  const vecRows = (await pool.query(vecSql, vecParams)).rows;

  // ── lexical leg: chunks containing the query's legal terms (accent-insensitive) ──
  const terms = keyTerms(searchText);
  let lexRows = [];
  if (terms.length) {
    const patterns = terms.map((t) => `%${t}%`);
    const pIdx = useFilter ? 4 : 3; // $patterns placeholder index
    const lexSql = `
      SELECT code_name, area, article, decision, content, 1 - (embedding <=> $1) AS vscore
      FROM chunks
      WHERE ${useFilter ? "area = $3 AND " : ""}${REVIEW_OK} AND unaccent(lower(content)) LIKE ANY($${pIdx})
      ORDER BY embedding <=> $1
      LIMIT $2`;
    const lexParams = useFilter
      ? [vecLiteral, Math.ceil(k * 1.5), area, patterns]
      : [vecLiteral, Math.ceil(k * 1.5), patterns];
    try {
      lexRows = (await pool.query(lexSql, lexParams)).rows;
    } catch (e) {
      // unaccent() extension not enabled → degrade gracefully to vector-only.
      console.error("lexical leg skipped (enable the unaccent extension to use it):", e?.message);
      lexRows = [];
    }
  }

  // ── merge, score, re-rank ──
  const byKey = new Map();
  const add = (r) => {
    const key = `${r.code_name}|${r.article || r.decision || ""}|${r.content.slice(0, 40)}`;
    if (!byKey.has(key)) byKey.set(key, r);
  };
  vecRows.forEach(add);
  lexRows.forEach(add);

  const scored = [...byKey.values()].map((r) => {
    const hay = deaccent(r.content);
    const hits = terms.reduce((n, t) => n + (hay.includes(t) ? 1 : 0), 0);
    const bonus = Math.min(hits, 3) * 0.06; // lexical overlap nudges, doesn't dominate
    return { r, score: Number(r.vscore) + bonus };
  });
  scored.sort((a, b) => b.score - a.score);

  // ── concept anchors: guarantee fundamental institutions (e.g. αδικαιολόγητος πλουτισμός →
  //    Αστικός Κώδικας 904) appear whenever the query mentions them, even if search ranked them low ──
  const anchorRows = await fetchAnchorChunks(firedAnchors(searchText, area));

  return mergeSources(anchorRows, scored, k);
}
