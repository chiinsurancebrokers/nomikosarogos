import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  approvedDecisionCandidates, validatedExcerpt,
  verifyCaseLawFindings, emptyCaseLawResult,
} from "../caseLawEvidence.js";

const url = "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=SAMPLE&apof=1497_2023";
const url2 = "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=SAMPLE&apof=1496_2023";
const decisionText = "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως και την αναγκαιότητα προσδιορισμού των περιστατικών που στηρίζουν την αγωγή.";
const objectionText = "Το δικαστήριο επισημαίνει τις ουσιώδεις ελλείψεις των προσκομισθέντων στοιχείων και την ανάγκη προσεκτικής αξιολόγησης κάθε αντίθετου ισχυρισμού.";
const meta = (u, date, body) => "Πηγή: " + u + "\nΗμερομηνία δημοσίευσης απόφασης: " + date + "\n" + body;

function candidates() {
  return approvedDecisionCandidates([
    { ref: "ΑΠ 1497/2023", text: meta(url, "2023-10-04", decisionText) },
    { ref: "ΑΠ 1496/2023", text: meta(url2, "2023-10-05", objectionText) },
  ]);
}

function item(ref, quote, position) {
  return {
    ref, quote, position,
    holding: "Πιθανή ερμηνεία με βάση τη ρητή διατύπωση του αποσπάσματος.",
    comparison: "Σύγκριση του νομικού επιχειρήματος με τα πραγματικά περιστατικά της ερώτησης.",
    limitation: "Δεν έχουν ελεγχθεί ολόκληρη η απόφαση και η χρονική ισχύς της διάταξης.",
  };
}

test("only exact official-source decision text with publication date enters the research pool", () => {
  const result = approvedDecisionCandidates([
    { ref: "ΑΠ 1497/2023", text: meta(url, "2023-10-04", decisionText) },
    { ref: "ΑΠ 1497/2023", text: meta(url, "2023-10-04", decisionText) },
    { ref: "ΑΠ 1497/2023", text: meta(url, "2024-10-04", objectionText) },
    { ref: "ΑΠ 333/2020", text: "Πηγή: https://evil.test/path\n" + decisionText },
    { ref: "ΑΠ 1496/2023", text: "Πηγή: " + url2 + "\n" + objectionText },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].ref, "ΑΠ 1497/2023");
  assert.equal(result[0].snippets.length, 1);
  assert.equal(result[0].publishedAt, "2023-10-04");
  assert.ok(!result[0].snippets[0].includes("Πηγή:"));
});

test("quotes must match original recovered text, not invented paraphrases", () => {
  const c = candidates();
  assert.equal(c.length, 2);
  assert.equal(validatedExcerpt(c[0].snippets, "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως"), "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως");
  assert.equal(validatedExcerpt(c[0].snippets, "Το δικαστήριο διέταξε την ακύρωση της δήλωσης"), null);
  assert.equal(validatedExcerpt(c[0].snippets, "Το δικαστήριο"), null);
});

test("both supporting and contrary cases are compared when the evidence exists", () => {
  const r = verifyCaseLawFindings({ thesis: "Εξετάζεται ισχυρισμός περί πλάνης", items: [
    item("ΑΠ 1497/2023", "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως", "supports"),
    item("ΑΠ 1496/2023", "Το δικαστήριο επισημαίνει τις ουσιώδεις ελλείψεις των προσκομισθέντων στοιχείων", "opposes"),
  ] }, candidates());
  assert.equal(r.status, "review_required");
  assert.deepEqual(r.findings.map((f) => f.position), ["supports", "opposes"]);
  assert.deepEqual(r.findings.map((f) => f.publishedAt), ["2023-10-04", "2023-10-05"]);
  assert.equal(r.informativeOnly, true);
});

test("unknown court references and second-hand paraphrases are rejected", () => {
  const r = verifyCaseLawFindings({ thesis: "ερώτημα", items: [
    item("ΑΠ 999/2020", "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως", "supports"),
    item("ΑΠ 1497/2023", "Μια άλλη απόφαση βεβαιώνει ότι όλοι οι κληρονόμοι δικαιώνονται", "supports"),
    item("ΑΠ 1497/2023", "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως", "fabricated"),
  ] }, candidates());
  assert.equal(r.status, "no_verified_findings");
  assert.deepEqual(r.findings, []);
});

test("duplicated references cannot create a misleading count of precedent", () => {
  const quote = "Το δικαστήριο εξετάζει τις προϋποθέσεις ακύρωσης δήλωσης βουλήσεως";
  const r = verifyCaseLawFindings({ items: [
    item("ΑΠ 1497/2023", quote, "supports"),
    item("ΑΠ 1497/2023", quote, "opposes"),
  ] }, candidates());
  assert.equal(r.findings.length, 1);
});

test("absence of case law is explicitly disclosed instead of inferred from general model knowledge", () => {
  assert.equal(verifyCaseLawFindings({ items: [item("ΑΠ 1497/2023", decisionText, "supports")] }, []).status, "no_approved_decisions");
  assert.equal(verifyCaseLawFindings(null, candidates()).status, "unavailable");
  assert.equal(emptyCaseLawResult("el").findings.length, 0);
});

test("research SQL filters by human approval and stays separate from site taxonomy", () => {
  const research = readFileSync(new URL("../caseLawResearch.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(research, /review_status = 'approved'/);
  assert.match(research, /source = 'decisions'/);
  assert.match(research, /verifyCaseLawFindings\(/);
  assert.match(server, /caseLawRequested/);
  assert.match(server, /caseLawTask/);
  assert.doesNotMatch(research, /fetch\s*\(\s*["']https?:/);
});
