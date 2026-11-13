// Sandbox regression from anonymised FACTS of a scanned Greek lawsuit.
// NO parties' names, identifiers, original PDF pages or sensitive attachments
// are committed or sent to model providers by these offline checks.
import test from "node:test";
import assert from "node:assert/strict";
import {
  determineInheritanceLaw, guardInheritanceSources,
  assessTemporalDraft, temporalNotice,
} from "../temporalLaw.js";
import { selectHistoricalVersion } from "../legalHistory.js";
import {
  issueRelevanceGuard, validatedExcerpt, emptyCaseLawResult,
} from "../caseLawEvidence.js";
import { classifyCitations } from "../citations.js";
import { assessEvidence } from "../quality.js";

const allegedEvents = Object.freeze({
  death: "07/10/2025", disclaimer: "15/01/2026",
  discoveryApprox: "late March 2026",
  filing: "13/07/2026", firstService: "13/07/2026", secondService: "28/07/2026",
  hearing: "19/04/2027",
});

const legalQuestion =
  "Θάνατος 7.10.2025, αποποίηση κληρονομιάς στις 15.1.2026. " +
  "Ζητείται ακύρωση της αποποίησης λόγω πλάνης/απάτης. " +
  "Η αγωγή κατατέθηκε στις 13.7.2026, επιδόθηκε το 2026 και δικάζεται τον Απρίλιο 2027.";

const previousCode = {
  ref: "Αστικός Κώδικας άρθρο 1857",
  text: "Αμετάκλητο της αποποίησης. Η αποδοχή ή η αποποίηση κληρονομίας είναι αμετάκλητη. " +
    "Η αποποίηση που οφείλεται σε πλάνη ή απάτη δύναται να εξεταστεί με βάση τους κανόνες περί δικαιοπραξιών.",
};
const reformCode = {
  ref: "Αστικός Κώδικας άρθρο 1855",
  text: "Αμετάκλητο αποδοχής ή αποποίησης. Η αποποίηση λόγω πλάνης ή απάτης εξετάζεται.",
};

test("CASE-01: death 2025 selects PRE-2026 AK 1857, not modern AK 1855", () => {
  const result = determineInheritanceLaw({ question: legalQuestion });
  assert.equal(result.status, "legacy");
  assert.equal(result.deathDate, "2025-10-07");
  assert.equal(result.applicableArticle, previousCode.ref);
  assert.deepEqual(result.dates, ["2025-10-07"]);
  console.log("SANDBOX CASE-01", JSON.stringify({
    death: result.deathDate, codeVersion: result.status, article: result.applicableArticle,
  }));
});

test("CASE-02: actual lawsuit's filing and service cannot override the DEATH trigger", () => {
  const result = determineInheritanceLaw({
    question: "Ακύρωση αποποίησης κληρονομίας",
    docFacts: {
      docType: "Αγωγή",
      dates: [
        { label: "Θάνατος κληρονομουμένης", date: allegedEvents.death },
        { label: "Αποποίηση", date: allegedEvents.disclaimer },
        { label: "Κατάθεση", date: allegedEvents.filing },
        { label: "Επίδοση", date: allegedEvents.secondService },
      ],
      summary: "Αγωγή ακύρωσης αποποίησης κληρονομιάς λόγω πλάνης.",
    },
  });
  assert.equal(result.deathDate, "2025-10-07");
  assert.equal(result.applicableArticle, previousCode.ref);
});

test("CASE-03: wrong-version law eliminated BEFORE source checker", () => {
  const temporal = determineInheritanceLaw({ question: legalQuestion });
  const input = [previousCode, reformCode, {
    ref: "ν. 5303/2026 άρθρο 3", text: "Νέο ουσιαστικό κληρονομικό άρθρο.",
  }];
  const checked = guardInheritanceSources(input, temporal);
  assert.ok(checked.sources.some((s) => s.ref === previousCode.ref));
  assert.ok(!checked.sources.some((s) => s.ref === reformCode.ref));
  assert.ok(!checked.sources.some((s) => s.ref === "ν. 5303/2026 άρθρο 3"));
  assert.equal(checked.foundApplicableArticle, true);
  console.log("SANDBOX CASE-03", JSON.stringify({
    excluded: checked.excluded, retained: checked.sources.map((s) => s.ref),
  }));
});

test("CASE-04: wrong article in generated answer is withheld", () => {
  const temporal = determineInheritanceLaw({ question: legalQuestion });
  const reject = assessTemporalDraft("Εφαρμόζεται το νέο άρθρο 1855 ΑΚ.", temporal);
  assert.equal(reject.status, "wrong_temporal_law");
  assert.equal(reject.publishDraft, false);
  assert.equal(assessTemporalDraft("Το άρθρο 1857 ΑΚ είναι εφαρμοστέο.", temporal), null);
});

test("CASE-05: missing death date MUST prompt clarification, not guess from disclaimer", () => {
  const temporal = determineInheritanceLaw({
    question: "Αποποίηση κληρονομιάς στις 15.1.2026, κατάθεση αγωγής στις 13.7.2026.",
  });
  assert.equal(temporal.status, "date_required");
  assert.match(temporalNotice(temporal), /ημερομηνία θανάτου/);
});

test("CASE-06: broad historical registry does not falsely pretend to have vetted laws", () => {
  const selected = selectHistoricalVersion({
    question: legalQuestion, area: "civil", rules: [], versions: [],
  });
  assert.equal(selected.status, "not_covered");
  console.log("SANDBOX CASE-06", JSON.stringify({
    historicalLibrary: selected.status, meaning: "no approved rule supplied; not evidence of absence of law",
  }));
});

test("CASE-07: official AP 340/2025 is procedurally different, not disclaimer merits", () => {
  // TEST STATEMENT. This is NOT a quotation from the official decision.
  const proceduralContent =
    "Έννομο συμφέρον για αναίρεση, διαδικαστική κρίση και δεδικασμένο σε εργατική διαφορά.";
  assert.equal(
    issueRelevanceGuard("supports", "Ακύρωση αποποίησης κληρονομιάς λόγω πλάνης.", proceduralContent),
    "distinguishable"
  );
  assert.equal(
    issueRelevanceGuard("opposes", "Ακύρωση αποποίησης κληρονομιάς λόγω απάτης.", proceduralContent),
    "distinguishable"
  );
  assert.equal(
    issueRelevanceGuard("supports", "Δεδικασμένο από απόφαση σε κληρονομική διαφορά.", proceduralContent),
    "supports"
  );
  console.log("SANDBOX CASE-07", JSON.stringify({
    courtDecision: "ΑΠ 340/2025", classification: "distinguishable on disclaimer merits",
  }));
});

test("CASE-08: an invented court quotation cannot count as independently retrieved evidence", () => {
  const sourceSnippets = [
    "Αποφασίστηκε ότι το έννομο συμφέρον πρέπει να συνδέεται με συγκεκριμένο δικονομικό αποτέλεσμα.",
  ];
  assert.equal(
    validatedExcerpt(sourceSnippets, "Η συγκεκριμένη απόφαση ακυρώνει κάθε αποποίηση κληρονομιάς λόγω πλάνης."),
    null
  );
  assert.equal(
    validatedExcerpt(sourceSnippets, "το έννομο συμφέρον πρέπει να συνδέεται με συγκεκριμένο δικονομικό αποτέλεσμα"),
    "το έννομο συμφέρον πρέπει να συνδέεται με συγκεκριμένο δικονομικό αποτέλεσμα"
  );
});

test("CASE-09: plaintiffs' citations are not treated as judicial holdings without official retrieval", () => {
  const citations = classifyCitations(
    "Κατά ΟλΑΠ 3/1989, ΑΠ 572/2016, ΑΠ 189/2017 και ΑΠ 496/2013",
    [] // no court decisions verified from full text in this sandbox
  );
  assert.equal(citations.missing.length, 4);
  const quality = assessEvidence({
    sources: [previousCode], citations, reviewRequested: true,
    verification: { verdict: "supported" }, lang: "el",
  });
  assert.equal(quality.status, "unsupported_case_law");
  assert.equal(quality.publishDraft, false);
  console.log("SANDBOX CASE-09", JSON.stringify({ unverifiedCitations: citations.missing }));
});

test("CASE-10: absent approved case-law is NOT a finding that relevant case-law does not exist", () => {
  const result = emptyCaseLawResult("el");
  assert.equal(result.status, "no_approved_decisions");
  assert.match(result.message, /στο διαθέσιμο τοπικό ευρετήριο/);
});

test("CASE-11: file facts alone do NOT prove deception, debt amount or ownership of properties", () => {
  const plaintiffClaims = [
    { fact: "deception about debts", status: "alleged" },
    { fact: "ownership of two real properties", status: "alleged; one appears connected to a separate estate" },
    { fact: "late-March discovery", status: "alleged, approximate date" },
  ];
  assert.ok(plaintiffClaims.every((f) => !f.status.startsWith("proven")));
  console.log("SANDBOX CASE-11", JSON.stringify({
    evidentiaryStatus: "claims_not_established",
    materialIssues: plaintiffClaims.length,
  }));
});
