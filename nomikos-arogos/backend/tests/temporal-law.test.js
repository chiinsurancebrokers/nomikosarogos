import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INHERITANCE_REFORM, parseGreekDate, extractDeathDates, determineInheritanceLaw,
  guardInheritanceSources, assessTemporalDraft, temporalNotice,
} from "../temporalLaw.js";

const oldText = [
  "Άρθρο 1857. Αμετάκλητο της αποποίησης.",
  "Η αποδοχή ή η αποποίηση της κληρονομίας είναι αμετάκλητη.",
  "Η αποδοχή ή η αποποίηση που οφείλεται σε πλάνη ή απειλή ή απάτη κρίνεται",
  "σύμφωνα με τις διατάξεις για τις δικαιοπραξίες· η αγωγή για την ακύρωσή τους παραγράφεται μετά ένα εξάμηνο.",
].join(" ");
const newerText = [
  "Άρθρο 1855 Αμετάκλητο της αποδοχής ή αποποίησης.",
  "Η αποδοχή ή η αποποίηση που οφείλεται σε πλάνη ή απειλή ή απάτη κρίνεται σύμφωνα με τις διατάξεις για τις δικαιοπραξίες.",
].join(" ");
const oldSource = { ref: "Αστικός Κώδικας άρθρο 1857", text: oldText };
const newerSource = { ref: "Αστικός Κώδικας άρθρο 1855", text: newerText };
const newReformLaw = { ref: "ν. 5303/2026 άρθρο 3", text: newerText };

test("verified Article 41 cutoff and official source are recorded", () => {
  assert.equal(INHERITANCE_REFORM.cutoff, "2026-09-16");
  assert.match(INHERITANCE_REFORM.officialUrl, /aade\.gr/);
});

test("Greek, English, numeric and ISO dates parse; impossible date fails", () => {
  assert.equal(parseGreekDate("7 Οκτωβρίου 2025"), "2025-10-07");
  assert.equal(parseGreekDate("2026-09-16"), "2026-09-16");
  assert.equal(parseGreekDate("15/09/2026"), "2026-09-15");
  assert.equal(parseGreekDate("16 September 2026"), "2026-09-16");
  assert.equal(parseGreekDate("31/02/2026"), null);
});

test("real case pattern: death 2025, disclaimers and pleadings 2026 => old AK1857", () => {
  const result = determineInheritanceLaw({
    question: "Θάνατος 7.10.2025. Αποποίηση 15.1.2026. Αγωγή ακύρωσης κατατέθηκε στις 13.7.2026 και επιδόθηκε στις 28.7.2026.",
  });
  assert.equal(result.status, "legacy");
  assert.equal(result.deathDate, "2025-10-07");
  assert.equal(result.applicableArticle, "Αστικός Κώδικας άρθρο 1857");
  assert.equal(result.dates.length, 1);
});

test("reform applies to death ON 16 Sept 2026, not 15 Sept", () => {
  const old = determineInheritanceLaw({ question: "Ο θάνατος 15/09/2026 και η αποποίηση 18/09/2026." });
  const newer = determineInheritanceLaw({ question: "Ο θάνατος 16/09/2026 και η αποποίηση 18/09/2026." });
  assert.equal(old.applicableArticle, "Αστικός Κώδικας άρθρο 1857");
  assert.equal(newer.applicableArticle, "Αστικός Κώδικας άρθρο 1855");
});

test("death date from structured neutral document facts supersedes later procedural dates", () => {
  const result = determineInheritanceLaw({
    question: "Ακύρωση αποποίησης κληρονομιάς, αγωγή 2026.",
    docFacts: {
      dates: [
        { label: "Ημερομηνία θανάτου", date: "7 Οκτωβρίου 2025" },
        { label: "Ημερομηνία αποποίησης", date: "15 Ιανουαρίου 2026" },
        { label: "Επίδοση", date: "28 Ιουλίου 2026" },
      ],
      summary: "Αμφισβητείται αποποίηση κληρονομιάς.",
      searchTerms: ["ακύρωση αποποίησης"],
    },
  });
  assert.equal(result.status, "legacy");
  assert.equal(result.deathDate, "2025-10-07");
  assert.ok(result.evidence.some((e) => e.source === "document_facts"));
});

test("filing and disclaimer alone are not a substitute for date of death", () => {
  const result = determineInheritanceLaw({
    question: "Αποποίηση κληρονομιάς 15.1.2026 και αγωγή 13.7.2026.",
  });
  assert.equal(result.status, "date_required");
  assert.match(temporalNotice(result), /ημερομηνία θανάτου/);
});

test("conflicting death dates cannot silently select a law version", () => {
  const result = determineInheritanceLaw({
    question: "Αποποίηση κληρονομιάς, θάνατος 7.10.2025 και ο θάνατος 3.10.2026 άλλου προσώπου.",
  });
  assert.equal(result.status, "conflicting_death_dates");
  assert.equal(result.dates.length, 2);
});

test("special Article 33 questions must not use the general rule as a blanket answer", () => {
  const result = determineInheritanceLaw({
    question: "Ποια διανομή κληρονομίας ισχύει αν ο θάνατος ήταν 7.10.2025;",
  });
  assert.equal(result.status, "special_rule_review");
  assert.equal(result.applicableArticle, null);
});

test("old estate never retrieves modern substantive reform or wrong-number article", () => {
  const temporal = determineInheritanceLaw({
    question: "Θάνατος 07/10/2025 και αίτηση ακύρωσης αποποίησης.",
  });
  const result = guardInheritanceSources([oldSource, newerSource, newReformLaw], temporal);
  assert.equal(result.foundApplicableArticle, true);
  assert.ok(result.sources.some((s) => s.ref === oldSource.ref));
  assert.ok(!result.sources.some((s) => s.ref === newerSource.ref));
  assert.ok(!result.sources.some((s) => s.ref === newReformLaw.ref));
  assert.ok(result.sources.some((s) => s.ref === INHERITANCE_REFORM.sourceRef));
});

test("old estate with only modern sources FAILS CLOSED rather than answering", () => {
  const temporal = determineInheritanceLaw({ question: "Αποποίηση κληρονομιάς· θάνατος 7.10.2025." });
  const result = guardInheritanceSources([newerSource, newReformLaw], temporal);
  assert.equal(result.foundApplicableArticle, false);
});

test("a new AK1857 on inheritance incapacity is NOT misread as historical renunciation", () => {
  const temporal = determineInheritanceLaw({ question: "Αποποίηση κληρονομιάς θάνατος 7.10.2025." });
  const r = guardInheritanceSources([{ ref: oldSource.ref, text: "Άρθρο 1857 Κληρονομική ανικανότητα." }], temporal);
  assert.equal(r.foundApplicableArticle, false);
});

test("new estate requires modern AK1855 and excludes old AK1857", () => {
  const temporal = determineInheritanceLaw({ question: "Αποποίηση κληρονομιάς θάνατος 17.09.2026." });
  const result = guardInheritanceSources([oldSource, newerSource], temporal);
  assert.equal(result.foundApplicableArticle, true);
  assert.ok(result.sources.some((s) => s.ref === newerSource.ref));
  assert.ok(!result.sources.some((s) => s.ref === oldSource.ref));
});

test("a generated analysis using the wrong article is rejected regardless of model's confidence", () => {
  const old = determineInheritanceLaw({ question: "Θάνατος 7.10.2025, ακύρωση αποποίησης." });
  assert.equal(assessTemporalDraft("Εφαρμόζεται το νέο άρθρο 1855 ΑΚ.", old).publishDraft, false);
  assert.equal(assessTemporalDraft("Εφαρμόζεται το 1857 και όχι το 1855.", old).publishDraft, false);
  assert.equal(assessTemporalDraft("Ο 1857 ΑΚ διέπει την ακύρωση αποποίησης.", old), null);
});

test("server uses the actual hard source gate before producing legal answer", () => {
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(server, /determineInheritanceLaw\(\{ question: userText, docFacts \}\)/);
  assert.match(server, /fetchInheritanceArticle\(temporal\)/);
  assert.match(server, /guardInheritanceSources\(rawSources, temporal\)/);
  assert.match(server, /missing_temporally_applicable_statute/);
  assert.match(server, /assessTemporalDraft\(analysis, temporal\)/);
});
