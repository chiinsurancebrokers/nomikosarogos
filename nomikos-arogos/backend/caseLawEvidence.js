// Pure, deterministic verification of a proposed case-law comparison.
// A model cannot provide a case-law citation or evidence quote unless the exact
// published decision text was independently retrieved from approved DB rows.
import { buildSourceLinks } from "./sourceLinks.js";
import { criminalDecisionLimit } from "./criminalStakes.js";

const POSITIONS = new Set(["supports", "opposes", "distinguishable", "uncertain"]);
const plain = (s, max = 320) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const sameWhitespace = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();

export function approvedDecisionCandidates(rows, maxDecisions = 5, maxChunks = 2) {
  const groups = new Map();
  for (const r of rows || []) {
    const ref = String(r?.ref || "");
    if (!/^ΑΠ \d{1,5}\/\d{4}$/.test(ref)) continue;
    const meta = buildSourceLinks([{ ref, text: r.text }])[0];
    // Approved SQL rows also need verifiable first-party provenance and date.
    if (!meta) continue;
    if (!groups.has(ref)) {
      if (groups.size >= maxDecisions) continue;
      groups.set(ref, {
        ref, url: meta.url, publishedAt: meta.publishedAt, snippets: [],
      });
    }
    const group = groups.get(ref);
    if (group.url !== meta.url || group.publishedAt !== meta.publishedAt) continue;
    if (group.snippets.length >= maxChunks) continue;
    const body = String(r.text).replace(/^Πηγή:\s*https:\/\/[^\n]+\n/u, "")
      .replace(/^Ημερομηνία δημοσίευσης απόφασης:[^\n]+\n/u, "").trim();
    const visible = body.slice(0, 2000);
    if (visible.length >= 120 && !group.snippets.includes(visible)) group.snippets.push(visible);
  }
  return [...groups.values()].filter((g) => g.snippets.length);
}

export function validatedExcerpt(snippets, proposed) {
  // Exact contiguous wording after whitespace normalisation. No fuzzy matches:
  // a plausible-looking paraphrase is NOT a court quotation.
  const quote = sameWhitespace(proposed);
  if (quote.length < 25 || quote.length > 350) return null;
  for (const source of snippets || []) {
    const text = sameWhitespace(source);
    const idx = text.indexOf(quote);
    if (idx >= 0) return text.slice(idx, idx + quote.length);
  }
  return null;
}

export function emptyCaseLawResult(lang = "el", status = "no_approved_decisions") {
  const en = lang === "en";
  const message = status === "unavailable"
    ? en ? "Case-law research could not be completed or verified. No decisions are being presented."
      : "Η έρευνα νομολογίας δεν ολοκληρώθηκε ή δεν επαληθεύτηκε. Δεν παρουσιάζονται αποφάσεις."
    : status === "no_verified_findings"
    ? en ? "No relevant holding with an exact source quotation could be verified in the retrieved decisions."
      : "Δεν επαληθεύτηκε σχετική κρίση με ακριβές απόσπασμα από τις ανακτηθείσες αποφάσεις."
    : en ? "No approved and attributable court decisions were found in the available local index."
      : "Δεν βρέθηκαν εγκεκριμένες και τεκμηριωμένες αποφάσεις στο διαθέσιμο τοπικό ευρετήριο.";
  return { status, thesis: "", findings: [], message, informativeOnly: true };
}

// Conservative subject-matter gate: evidence of an employment/cassation
// dispute cannot become direct support for a renunciation-annulment merits
// claim merely because both texts mention courts, lawsuits or evidence.
const issueNorm = (s) => String(s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function issueRelevanceGuard(position, question, courtText) {
  const q = issueNorm(question), d = issueNorm(courtText);
  if (!/αποποι|renunciat|inheritance disclaimer/.test(q)) return position;
  if (/δεδικασμεν|εννομο συμφερον|αναιρεσ|αποδεικτικ.{0,20}μεσ|res judicata|cassation standing/.test(q))
    return position; // A specific procedural question may legitimately use it.
  if (/αποποι|κληρονομ|1857|1855|inheritance disclaimer/.test(d)) return position;
  return position === "supports" || position === "opposes" ? "distinguishable" : position;
}

export function verifyCaseLawFindings(proposed, candidates, lang = "el", question = "", area = "") {
  if (!Array.isArray(candidates) || !candidates.length) return emptyCaseLawResult(lang);
  if (!proposed || !Array.isArray(proposed.items)) return emptyCaseLawResult(lang, "unavailable");
  const byRef = new Map(candidates.map((d) => [d.ref, d]));
  const found = [];
  const used = new Set();
  for (const f of proposed.items.slice(0, 12)) {
    if (!f || typeof f.ref !== "string" || !POSITIONS.has(f.position)) continue;
    const source = byRef.get(f.ref);
    if (!source || used.has(source.ref)) continue;
    const excerpt = validatedExcerpt(source.snippets, f.quote);
    if (!excerpt) continue;
    // A model's interpretation is not a judicial finding; display it as assessment.
    const holding = plain(f.holding, 320);
    const comparison = plain(f.comparison, 330);
    let screenedPosition = issueRelevanceGuard(f.position, question, source.snippets.join(" "));
    const crim = area === "criminal" ? criminalDecisionLimit(source.publishedAt, lang) : null;
    // A pre-2019 decision cannot directly support/oppose a point under the current Codes.
    if (crim?.old && (screenedPosition === "supports" || screenedPosition === "opposes")) screenedPosition = "distinguishable";
    const limitation = plain(
      crim ? crim.text + f.limitation :
      screenedPosition !== f.position
        ? (lang === "en" ? "This decision does not directly concern inheritance renunciation. " :
          "Η απόφαση δεν αφορά άμεσα αποποίηση κληρονομιάς. ") + f.limitation
        : f.limitation, 230);
    if (holding.length < 12 || comparison.length < 12 || String(f.limitation || "").length < 10) continue;
    used.add(source.ref);
    found.push({
      ref: source.ref, position: screenedPosition, quote: excerpt,
      holding, comparison, limitation, url: source.url,
      publishedAt: source.publishedAt,
    });
  }
  if (!found.length) return emptyCaseLawResult(lang, "no_verified_findings");
  return {
    status: "review_required",
    thesis: plain(proposed.thesis, 240),
    findings: found,
    informativeOnly: true,
    message: lang === "en"
      ? "Comparisons are tentative interpretations of retrieved excerpts, not verified holdings or certified court copies. Check the full official decision, relevant dates and contrary cases with a lawyer."
      : "Οι συγκρίσεις αποτελούν προκαταρκτική ερμηνεία των ανακτηθέντων αποσπασμάτων, όχι πιστοποίηση δικαστικού σκεπτικού ή γνήσιο αντίγραφο. Ελέγξτε ολόκληρη την επίσημη απόφαση, τις κρίσιμες ημερομηνίες και την αντίθετη νομολογία με δικηγόρο.",
  };
}
