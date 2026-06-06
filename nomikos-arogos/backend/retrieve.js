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

export async function retrieveSources(searchText, area, k = Number(process.env.RETRIEVE_K) || 16) {
  if (!searchText || !searchText.trim()) return [];

  const [qvec] = await embed(searchText);
  const vecLiteral = `[${qvec.join(",")}]`;
  const useFilter = area === "civil" || area === "criminal" || area === "admin";
  const areaClause = useFilter ? "WHERE area = $3" : "";

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
      WHERE ${useFilter ? "area = $3 AND " : ""}unaccent(lower(content)) LIKE ANY($${pIdx})
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

  return scored.slice(0, k).map(({ r }) => ({
    ref: r.article
      ? `${r.code_name} άρθρο ${r.article}`
      : r.decision
      ? r.decision
      : r.code_name,
    text: r.content,
    score: r.score,
  }));
}
