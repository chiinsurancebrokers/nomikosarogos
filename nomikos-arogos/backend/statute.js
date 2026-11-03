// statute.js — decide whether a ΦΕΚ is a civil/criminal law we should index, and chunk it.
// Pure (no DB, no embeddings) so it can be unit-tested offline. The Anthropic client is passed in.


const CLASSIFY_MODEL =
  process.env.CLAUDE_AGENT_MODEL || process.env.CLAUDE_QUICK_MODEL || "claude-sonnet-4-6";

// Cheap pre-filter so we do not spend a model call on every decree and appointment.
// A law opens with "ΝΟΜΟΣ ΥΠ' ΑΡΙΘ." (letter-spaced in some PDFs) and, to be relevant, mentions
// the civil/criminal vocabulary several times.
const LAW_HEAD_RE = /Ν\s*Ο\s*Μ\s*Ο\s*Σ\s+Υ\s*Π|ΝΟΜΟΣ\s+ΥΠ|ΝΟΜΟΣ\s+ΥΠ[’'΄]/u;
const SCOPE_RE = /Αστικ[οό]\w*\s+Κ[ωώ]δικ|Ποινικ[οό]\w*\s+Κ[ωώ]δικ|Πολιτικ\w+\s+Δικονομ|Ποινικ\w+\s+Δικονομ|φυλάκιση|κάθειρξη|ποινικ|αστικ/giu;

export function looksLikeRelevantLaw(text) {
  const head = (text || "").slice(0, 6000).normalize("NFC");
  if (!LAW_HEAD_RE.test(head)) return false;
  const hits = (text || "").normalize("NFC").match(SCOPE_RE) || [];
  return hits.length >= 3;
}

export function parseJson(text) {
  const m = (text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

const CODES = ["Αστικός Κώδικας", "Κώδικας Πολιτικής Δικονομίας", "Ποινικός Κώδικας", "Κώδικας Ποινικής Δικονομίας"];

// Validates/normalises the classifier output. Anything unexpected → not ingested.
export function normaliseClassification(out) {
  if (!out || out.isLaw !== true) return null;
  const area = out.area === "civil" || out.area === "criminal" ? out.area : null;
  const lawRef = typeof out.lawRef === "string" ? out.lawRef.trim().slice(0, 40) : "";
  if (!area || !/^ν\.\s*\d{1,5}\/\d{4}$/u.test(lawRef)) return null;
  const amends = (Array.isArray(out.amends) ? out.amends : [])
    .filter((a) => a && CODES.includes(a.code) && /^\d+[Α-Ωα-ω]?$/u.test(String(a.article || "")))
    .slice(0, 40)
    .map((a) => ({ code: a.code, article: String(a.article) }));
  return {
    lawRef,
    area,
    title: String(out.title || "").slice(0, 300),
    publishedAt: /^\d{4}-\d{2}-\d{2}$/.test(out.publishedAt || "") ? out.publishedAt : null,
    amends,
  };
}

export async function classifyStatute(anthropic, text) {
  const r = await anthropic.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 700,
    system:
      "You classify a Greek Government Gazette (ΦΕΚ Α) issue for a legal-information database. " +
      "Decide if it is a LAW (νόμος) whose provisions concern Greek CIVIL or CRIMINAL law (substance or procedure) " +
      "or amend the Αστικός Κώδικας, Κώδικας Πολιτικής Δικονομίας, Ποινικός Κώδικας or Κώδικας Ποινικής Δικονομίας. " +
      "Presidential decrees, ratifications of unrelated treaties, appointments and purely administrative/tax/budget laws are NOT relevant " +
      "unless they materially change civil or criminal rules. If a law covers both, choose the dominant area. " +
      'Respond with strict JSON: {"isLaw": boolean, "lawRef": "ν. NNNN/YYYY", "title": string, "area": "civil"|"criminal"|null, ' +
      '"publishedAt": "YYYY-MM-DD"|null, "amends": [{"code": one of the four Codes above, "article": "110Α"}]}. ' +
      "List in amends only articles of those four Codes that the law explicitly replaces, adds or repeals. Do not guess.",
    messages: [{ role: "user", content: text.slice(0, 9000) }],
  });
  const raw = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return normaliseClassification(parseJson(raw));
}

// Chunks the statute by article. Statutes differ from the Codes: the heading is followed by a title
// line ("Άρθρο 1 / Τροποποίηση …"), so the Codes chunker would read "1 Τ" as article "1Τ". Here a
// suffix letter counts only when attached to the number ("110Α"). Falls back to size chunks.
const MAX_CHARS = 2200;
const STATUTE_ARTICLE_RE = /(^|[\s.;·])(?:[ΆΑ]ρθρο[νΝ]?|ΑΡΘΡΟΝ?)\s*[:.]?\s*(\d+[Α-Ω]?)(?![0-9Α-Ωα-ω])/gu;

function capSize(body, header) {
  if (body.length <= MAX_CHARS) return [body];
  const step = MAX_CHARS - 80;
  const parts = [];
  for (let i = 0; i < body.length; i += step) parts.push(body.slice(i, i + step));
  return parts.map((p, i) => (i === 0 ? p : `${header} (συνέχεια)\n${p}`));
}

// Prepare the text of a ΦΕΚ (Government Gazette) PDF for chunking:
//  - legacy lookalike glyphs (∆ U+2206, µ U+00B5) → real Greek letters;
//  - words broken across lines with a hyphen ("άρ-\nθρου", "λει−\nτούργημα") are rejoined;
//  - the gazette's table of contents ("Άρθρο 15: Τίτλος …") is dropped, otherwise each TOC
//    entry would be indexed as if it were an article.
export function prepareGazetteText(text) {
  let t = (text || "").replace(/\u0000/g, "").replace(/\u2206/g, "Δ").replace(/\u00b5/g, "μ").normalize("NFC");
  t = t.replace(/([α-ωά-ώ])[-\u2010\u2212\u00ad]\n[ \t]*([α-ωά-ώ])/gu, "$1$2");
  const tocEntries = (t.match(/^[ \t]*Άρθρο\s+\d+[Α-Ω]?\s*:/gmu) || []).length;
  if (tocEntries >= 10) {
    const body = t.match(/^[ \t]*Άρθρο\s+1[ \t]*$/mu);
    if (body) t = t.slice(body.index);
  }
  return t;
}

export function chunkStatute(text) {
  const full = (text || "").replace(/\u0000/g, "").normalize("NFC");
  const matches = [...full.matchAll(STATUTE_ARTICLE_RE)];
  const out = [];
  if (!matches.length) {
    for (let i = 0; i < full.length; i += MAX_CHARS) out.push({ article: null, text: full.slice(i, i + MAX_CHARS).trim() });
  } else {
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + (matches[i][1] ? matches[i][1].length : 0);
      const end = i + 1 < matches.length ? matches[i + 1].index : full.length;
      const article = matches[i][2];
      for (const piece of capSize(full.slice(start, end).trim(), `Άρθρο ${article}`)) out.push({ article, text: piece });
    }
  }
  return out.filter((c) => c.text && c.text.length > 40);
}

// Laws whose text is already inside a consolidated Code we index (so indexing the bare
// amending law as well would show the same provisions twice). Extend via
// FEEDER_CONSOLIDATED_LAWS="5303/2026,5336/2026,..." (with or without the "ν. " prefix).
export const DEFAULT_CONSOLIDATED = ["5303/2026", "5336/2026", "5344/2026"];
export function isConsolidated(lawRef, list = DEFAULT_CONSOLIDATED) {
  const n = String(lawRef || "").replace(/^ν\.\s*/u, "").trim();
  return list.map((x) => String(x).replace(/^ν\.\s*/u, "").trim()).includes(n);
}
