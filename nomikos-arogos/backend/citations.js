// citations.js — catch case-law citations in an answer that are NOT in the retrieved sources.
// The model is told never to cite a decision that is not in its sources; this is the safety net.
// Only court-decision numbers are checked (ΑΠ 1497/2023, ΟλΑΠ 3/1989, ΣτΕ 123/2020, ΕφΠειρ 613/2024…):
// they are the citations that can be silently invented.

const COURT = "(?:ΟλΑΠ|Ολ\\.?\\s?ΑΠ|ΑΠ|Α\\.Π\\.|ΣτΕ|ΕφΑθ|ΕφΠειρ|ΕφΘεσ|ΕφΠατρ|ΠΠρΑθ|ΠΠρΘεσ|ΠΠρΠειρ|ΜΠρΑθ|ΜΠρΘεσ|ΠολΠρωτ\\.?\\s?\\p{L}+)";
const CITE_RE = new RegExp(`(${COURT})\\s*\\.?\\s*(\\d{1,5})\\s*\\/\\s*(\\d{4})`, "gu");

const norm = (court) => court.replace(/[.\s]/g, "").replace(/^Ολ?ΑΠ$/, "ΟλΑΠ");
const key = (court, num, year) => `${norm(court)} ${Number(num)}/${year}`;

export function extractDecisionCitations(text) {
  const out = new Set();
  for (const m of (text || "").normalize("NFC").matchAll(CITE_RE)) out.add(key(m[1], m[2], m[3]));
  return [...out];
}

// Classifies every decision cited in the answer:
//   direct     – a retrieved source IS that decision (its text was available to the model)
//   secondhand – it appears only inside the text of another retrieved decision (cited by it, not read)
//   missing    – it is in no source at all: treat as possibly invented
export function classifyCitations(answer, sources) {
  const direct = new Set();
  const inText = new Set();
  for (const s of sources || []) {
    for (const k of extractDecisionCitations(s.ref || "")) direct.add(k);
    for (const k of extractDecisionCitations(s.text || "")) inText.add(k);
  }
  const out = { direct: [], secondhand: [], missing: [] };
  for (const k of extractDecisionCitations(answer)) {
    if (direct.has(k)) out.direct.push(k);
    else if (inText.has(k)) out.secondhand.push(k);
    else out.missing.push(k);
  }
  return out;
}

export const unsupportedCitations = (answer, sources) => classifyCitations(answer, sources).missing;
