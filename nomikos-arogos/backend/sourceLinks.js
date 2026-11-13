// Canonical links to court documents for citations actually retrieved from the DB.
// Never trust URLs appearing in generated answers or user-uploaded documents.
import { validateDecisionManifestEntry } from "./decisionValidation.js";

export function buildSourceLinks(sources = []) {
  const links = new Map();
  for (const s of sources) {
    const m = /^Πηγή:\s*(https:\/\/[^\s]+)/u.exec(String(s?.text || ""));
    if (!m || links.has(s.ref)) continue;
    try {
      const checked = validateDecisionManifestEntry({ ref: s.ref, url: m[1], area: "civil" });
      links.set(s.ref, { ref: s.ref, url: checked.url, publisher: "Άρειος Πάγος" });
    } catch { /* suppress invalid or untrusted links */ }
  }
  return [...links.values()];
}
