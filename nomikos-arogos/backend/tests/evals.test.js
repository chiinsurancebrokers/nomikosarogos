import test from "node:test";
import assert from "node:assert/strict";
import { gradeCase, gradeSuite } from "../evals/rubric.js";

test("rubric checks required concepts accent-insensitively", () => {
  const r = gradeCase({ id: "x", must_mention: ["αποποίηση"], must_not: ["είναι εκπρόθεσμη"] },
    { analysis: "Η ΑΠΟΠΟΙΗΣΗ εξετάζεται ανάλογα με τον κρίσιμο χρόνο." });
  assert.equal(r.pass, true);
});

test("rubric fails on missing facts or unjustified certainty", () => {
  const r = gradeCase({ id: "x", must_mention: ["1857"], must_not: ["είναι εκπρόθεσμη"] },
    { analysis: "Η αγωγή είναι εκπρόθεσμη." });
  assert.equal(r.pass, false);
  assert.equal(r.failures.length, 2);
});

test("case-law citations must have their own full retrieved decision", () => {
  const t = { id: "x", must_not_cite_outside_sources: true };
  const response = { analysis: "ΑΠ 1497/2023 και ΟλΑΠ 3/1989", retrievedSources: [
    { ref: "ΑΠ 1497/2023", text: "κατά ΟλΑΠ 3/1989" },
  ] };
  assert.equal(gradeCase(t, response).pass, false);
  assert.equal(gradeCase(t, { analysis: "ΑΠ 1497/2023", retrievedSources: response.retrievedSources }).pass, true);
});

test("suite reports unanswered cases rather than inventing a pass", () => {
  const s = gradeSuite({ cases: [{ id: "a", must_mention: ["154"] }, { id: "b" }] },
    { a: { analysis: "άρθρο 154" } });
  assert.deepEqual([s.passed, s.total], [1, 2]);
  assert.equal(s.results[1].pass, false);
});
