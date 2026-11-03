// chunking.js — split Greek legal texts into citable chunks.
//
// Codes are organised by "Άρθρο N" (Article N). We split on those boundaries so each
// chunk is a whole article carrying its number as metadata — that's what lets the model
// cite "Αστικός Κώδικας άρθρο 197" and what populates the `article` column for retrieval.
//
// Robustness: PDF extraction often drops the accent ("Αρθρο"), uses all-caps ("ΑΡΘΡΟ"),
// emits a non-breaking space before the number, or decomposes the accent (Α + U+0301).
// We NFC-normalise and match all of those — but keep the heading anchored to a line start
// so in-text cross-references ("...κατά το άρθρο 914...") don't cause false splits.

const MAX_CHARS = 2200; // sub-split very long articles to keep embeddings focused

// Greek legal PDFs (esp. from the ISOKRATIS database) write headers as "Αρθρο: 197"
// — accent often dropped, a colon after the word, and embedded mid-stream rather than at
// a line start. So we match "Άρθρο/Αρθρο/ΑΡΘΡΟ(Ν)" optionally + ":" + number, anywhere,
// after a delimiter. The capital-only first letter means lowercase cross-references
// ("...κατά το άρθρο 2...") are NOT treated as headers.
// Group 1: leading delimiter (offset). Group 2: article number (e.g. 197, 1226Α).
const ARTICLE_RE = new RegExp(
  `(^|[\\s.;·])(?:[ΆΑ]ρθρο[νΝ]?|ΑΡΘΡΟΝ?)\\s*[:.]?\\s*(\\d+(?:[ \\u00a0]?[Α-Ωα-ωA-Za-z])?)(?=[\\s:.,)])`,
  "gu"
);

function splitLongArticle(article, header) {
  if (article.length <= MAX_CHARS) return [article];
  // First split on paragraph breaks for clean boundaries…
  const rough = [];
  let buf = "";
  for (const p of article.split(/\n{2,}/)) {
    if ((buf + "\n\n" + p).length > MAX_CHARS && buf) {
      rough.push(buf.trim());
      buf = p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) rough.push(buf.trim());
  // …then HARD-split anything still too long. Flattened PDF text often has no paragraph
  // breaks, so a single huge article could otherwise blow past the embedding token limit.
  const parts = [];
  for (const piece of rough) {
    if (piece.length <= MAX_CHARS) { parts.push(piece); continue; }
    const step = MAX_CHARS - 80; // leave room for the "(συνέχεια)" header added below
    for (let i = 0; i < piece.length; i += step) parts.push(piece.slice(i, i + step));
  }
  // Repeat the header on continuation pieces so each stays self-identifying.
  return parts.map((p, i) => (i === 0 ? p : `${header} (συνέχεια)\n${p}`));
}

// Latin capitals that look identical to Greek ones; PDFs mix them in letter suffixes
// ("110A" vs "110Α"), which would otherwise give one article two different labels.
const LATIN_TO_GREEK = { A: "Α", B: "Β", E: "Ε", H: "Η", I: "Ι", K: "Κ", M: "Μ", N: "Ν", O: "Ο", P: "Ρ", T: "Τ", X: "Χ", Y: "Υ", Z: "Ζ" };
export function normaliseArticleLabel(raw) {
  const m = String(raw).replace(/\s/g, "").match(/^(\d+)(.*)$/);
  if (!m) return String(raw).trim();
  return m[1] + m[2].replace(/[A-Z]/g, (c) => LATIN_TO_GREEK[c] || c);
}

// Some Greek government PDFs (e.g. the Ministry's π.δ. consolidations) encode capital delta as
// U+2206 (INCREMENT) and mu as U+00B5 (MICRO SIGN). They look right but break search and
// embeddings, so map them to the real Greek letters.
export function normaliseLegacyGlyphs(text) {
  return (text || "").replace(/\u2206/g, "Δ").replace(/\u00b5/g, "μ");
}

// Third-party consolidated PDFs (e.g. LoNinja) carry a diagonal watermark and a header and
// footer on every page. Drop those lines so "LoNinja.gr" / "Σελίδα 3 από 91" never end up
// inside an article chunk.
export function stripWatermark(text) {
  return (text || "")
    .split("\n")
    .filter((ln) => !/o?Ninja\.gr/i.test(ln) && !/^\s*Σελίδα\s+\d+\s+από\s+\d+\s*$/u.test(ln))
    .join("\n");
}

// Returns [{ article, text }] for a code document.
export function chunkCode(fullText) {
  fullText = (fullText || "").normalize("NFC");
  const matches = [...fullText.matchAll(ARTICLE_RE)];
  if (matches.length === 0) {
    // No article markers found (e.g. extraction failed) — fall back to size chunks.
    const out = [];
    for (let i = 0; i < fullText.length; i += MAX_CHARS) {
      out.push({ article: null, text: fullText.slice(i, i + MAX_CHARS).trim() });
    }
    return out.filter((c) => c.text);
  }
  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (matches[i][1] ? matches[i][1].length : 0);
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    const body = fullText.slice(start, end).trim();
    const article = normaliseArticleLabel(matches[i][2]); // e.g. "1226Α"
    const header = `Άρθρο ${article}`;
    for (const piece of splitLongArticle(body, header)) {
      chunks.push({ article, text: piece });
    }
  }
  return chunks;
}

// Court decisions: split by decision header, then size-cap. Metadata = court + number.
const DECISION_RE = /(ΣτΕ|ΑΠ|Α\.Π\.|Άρειος Πάγος)\s*\.?\s*([0-9]{1,5}\/[0-9]{4})/g;
export function chunkDecisions(fullText) {
  fullText = (fullText || "").normalize("NFC");
  const matches = [...fullText.matchAll(DECISION_RE)];
  if (matches.length === 0) return chunkCode(fullText).map((c) => ({ decision: null, text: c.text }));
  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
    const body = fullText.slice(start, end).trim();
    const decision = `${matches[i][1]} ${matches[i][2]}`;
    for (let j = 0; j < body.length; j += MAX_CHARS) {
      chunks.push({ decision, text: body.slice(j, j + MAX_CHARS).trim() });
    }
  }
  return chunks.filter((c) => c.text);
}

// Heuristic: did text extraction produce legacy-encoding garbage instead of Greek?
export function looksGarbled(text) {
  const sample = (text || "").slice(0, 4000);
  const greek = (sample.match(/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊϋ]/g) || []).length;
  const letters = (sample.match(/[A-Za-zΑ-Ωα-ω]/g) || []).length;
  if (letters < 200) return true; // almost no letters extracted
  return greek / letters < 0.2; // Greek code text should be mostly Greek
}
