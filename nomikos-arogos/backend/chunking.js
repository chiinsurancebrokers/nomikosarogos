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
// Older gazette PDFs (pre-2010 ΦΕΚ) embed Greek in a legacy 8-bit font: the PDF extractor hands us
// the windows-1253 bytes decoded as Mac Roman ("≈ÀÀ«Õ…" for "ΕΛΛΗΝΙΚΗΣ"). Reverse that mapping.
// Only applied when it clearly turns the text into Greek, so normal documents are untouched.
const greekLetters = (t) => (t.match(/[\u0386-\u03ce]/g) || []).length;
let macToByte = null;
export function repairLegacyEncoding(text) {
  const src = text || "";
  if (greekLetters(src) > src.length * 0.02) return src; // already real Greek
  if (!macToByte) {
    macToByte = new Map();
    const mac = new TextDecoder("macintosh");
    for (let b = 128; b < 256; b++) macToByte.set(mac.decode(new Uint8Array([b])), b);
  }
  const bytes = [];
  for (const ch of src) {
    if (ch.charCodeAt(0) < 128) bytes.push(ch.charCodeAt(0));
    else if (macToByte.has(ch)) bytes.push(macToByte.get(ch));
    else bytes.push(0x3f);
  }
  const fixed = new TextDecoder("windows-1253").decode(new Uint8Array(bytes));
  if (greekLetters(fixed) <= Math.max(200, src.length * 0.15)) return src;
  return restoreDroppedKappa(fixed);
}

// In these old PDFs the capital Κ glyph has no Unicode mapping and vanishes. Restore it only
// for word starts that cannot begin a Greek word without it (no Greek word starts with "ρατούμεν").
const DROPPED_KAPPA = /(?<![Α-Ωα-ωά-ώ])(?=(?:ρατούμεν|ρατηθ|ρατήσ|ρατητ|ράτηση|ατά(?![α-ωά-ώ])|άθε(?![α-ωά-ώ])|ώδικ|ανονισμ|υβέρνησ|ατηγορούμεν|ατηγορί|αταγγελ|ατάσχεσ|αταδίκ|αταχρ))/gu;
export function restoreDroppedKappa(text) {
  return text.replace(DROPPED_KAPPA, "Κ");
}

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


// One court decision = one document. Unlike chunkDecisions (which splits a bundle of decisions on
// every "ΑΠ N/YYYY" it sees), this never splits on citations INSIDE the text — a full Άρειος Πάγος
// decision cites dozens of other decisions, and splitting there would label chunks with the wrong
// number. Every chunk carries the decision's own reference; the first chunk also carries the source
// URL so the answer can link to the official text.
export function chunkDecisionDocument(fullText, decision, url = "") {
  const text = (fullText || "").normalize("NFC").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  if (!text || !decision) return [];
  // Keep the official provenance URL on EVERY chunk, including continuation chunks.
  // Otherwise a semantic hit on page 2+ has no auditable reference in the final answer.
  const source = url ? `Πηγή: ${url}\n` : "";
  if (source.length > 350) throw new Error("Court source URL too long");
  const limit = MAX_CHARS - source.length;
  const paras = text.split(/\n\n/);
  const chunks = [];
  let cur = "";
  const flush = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
  for (const para of paras) {
    if (para.length > limit) {
      flush();
      for (let j = 0; j < para.length; j += limit) chunks.push(para.slice(j, j + limit).trim());
      continue;
    }
    if (cur.length + para.length + 2 > limit) flush();
    cur += (cur ? "\n\n" : "") + para;
  }
  flush();
  return chunks.map((t) => ({
    decision,
    text: source + t,
  }));
}

// Heuristic: did text extraction produce legacy-encoding garbage instead of Greek?
export function looksGarbled(text) {
  const sample = (text || "").slice(0, 4000);
  const greek = (sample.match(/[Α-Ωα-ωΆΈΉΊΌΎΏάέήίόύώϊϋ]/g) || []).length;
  const letters = (sample.match(/[A-Za-zΑ-Ωα-ω]/g) || []).length;
  if (letters < 200) return true; // almost no letters extracted
  if (greek / letters < 0.2) return true; // Greek code text should be mostly Greek

  // Word-font mojibake keeps Greek-range letters but scrambles them ("Άρθρο" → "Άξζξν"), so the
  // letter share looks fine. Real Greek legal text is ~35–45% common function words (και, του,
  // της, των…); scrambled text is ~2%. Measure on a window from the middle of the document so a
  // cover page or table of contents doesn't skew it.
  const mid = (text || "").slice(Math.floor((text || "").length * 0.25), Math.floor((text || "").length * 0.25) + 30000);
  const toks = stripAccents(mid).match(/[α-ως]+/g) || [];
  if (toks.length >= 300) {
    const common = toks.filter((t) => COMMON_WORDS.has(t)).length / toks.length;
    if (common < 0.12) return true;
  }
  return false;
}

const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const COMMON_WORDS = new Set(
  ("και του της των το τη την τον τα τις τους να σε με για που ως από στο στη στην στον στα στις στους " +
    "ο η οι οτι αν ή ειναι δεν θα κατα μετα προς εφοσον οταν μπορει πρεπει αυτο αυτη αυτου αυτης").split(" ")
);
