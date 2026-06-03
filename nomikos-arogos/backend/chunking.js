// chunking.js — split Greek legal texts into citable chunks.
//
// Codes are organised by "Άρθρο N" (Article N). We split on those boundaries so each
// chunk is a whole article carrying its number as metadata — that's what lets the
// model cite "Αστικός Κώδικας άρθρο 197" and what the verifier checks against.

const MAX_CHARS = 2200; // sub-split very long articles to keep embeddings focused

// Matches "Άρθρο 197", "Άρθρον 5", "ΑΡΘΡΟ 1226Α", at a line start.
const ARTICLE_RE = /(^|\n)\s*(Άρθρο[ν]?|ΑΡΘΡΟ[Ν]?)\s+([0-9]+[Α-Ωα-ωA-Z]?)/g;

function splitLongArticle(article, header) {
  if (article.length <= MAX_CHARS) return [article];
  const parts = [];
  const paras = article.split(/\n{2,}/);
  let buf = "";
  for (const p of paras) {
    if ((buf + "\n\n" + p).length > MAX_CHARS && buf) {
      parts.push(buf.trim());
      buf = header + " (συνέχεια)\n" + p; // repeat header so each piece stays self-identifying
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

// Returns [{ article, text }] for a code document.
export function chunkCode(fullText) {
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
    const article = matches[i][3];
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
  const sample = text.slice(0, 4000);
  const greek = (sample.match(/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊϋ]/g) || []).length;
  const letters = (sample.match(/[A-Za-zΑ-Ωα-ω]/g) || []).length;
  if (letters < 200) return true;            // almost no letters extracted
  return greek / letters < 0.2;              // Greek code text should be mostly Greek
}
