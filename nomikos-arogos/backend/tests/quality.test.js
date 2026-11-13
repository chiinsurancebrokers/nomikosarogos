import test from "node:test";
import assert from "node:assert/strict";
import { requiresIndependentReview, assessEvidence } from "../quality.js";

const source = [{ ref: "Αστικός Κώδικας άρθρο 1857", text: "sample" }];

test("court papers, renunciation and time limits always require independent review", () => {
  assert.equal(requiresIndependentReview("Ακύρωση αποποίησης κληρονομίας"), true);
  assert.equal(requiresIndependentReview("Πότε λήγει η προθεσμία προτάσεων;"), true);
  assert.equal(requiresIndependentReview("What is the deadline for an appeal?"), true);
  assert.equal(requiresIndependentReview("Τι είναι ενοχή;"), false);
  assert.equal(requiresIndependentReview("Τι είναι ενοχή;", true), true);
});

test("no retrieved sources means no legal draft is published", () => {
  const q = assessEvidence({ sources: [], lang: "el" });
  assert.equal(q.status, "no_sources");
  assert.equal(q.publishDraft, false);
});

test("mandatory verification must be fully supported", () => {
  for (const verdict of ["unsupported", "partially_supported", "unverified", null]) {
    const q = assessEvidence({ sources: source, reviewRequested: true,
      verification: verdict ? { verdict } : null });
    assert.equal(q.publishDraft, false);
    assert.equal(q.status, "review_failed");
  }
});

test("a supported verdict is explicitly limited to retrieved sources", () => {
  const q = assessEvidence({ sources: source, reviewRequested: true, verification: { verdict: "supported" } });
  assert.equal(q.publishDraft, true);
  assert.match(q.message, /ΔΕΝ πιστοποιεί/);
});

test("non-high-risk quick answer is visibly preliminary", () => {
  const q = assessEvidence({ sources: source });
  assert.equal(q.status, "preliminary");
  assert.equal(q.publishDraft, true);
});


test("missing decision citations cannot be published even if an AI verifier says supported", () => {
  const r = assessEvidence({
    sources: source, reviewRequested: true, verification: { verdict: "supported" },
    citations: { direct: [], secondhand: [], missing: ["ΑΠ 999/2020"] },
  });
  assert.equal(r.status, "unsupported_case_law");
  assert.equal(r.publishDraft, false);
});

test("secondhand citation is not independent case law", () => {
  const r = assessEvidence({
    sources: source, reviewRequested: false,
    citations: { direct: [], secondhand: ["ΟλΑΠ 3/1989"], missing: [] },
  });
  assert.equal(r.publishDraft, false);
});

test("only directly retrieved case law may pass the court-citation gate", () => {
  const r = assessEvidence({
    sources: source, reviewRequested: true, verification: { verdict: "supported" },
    citations: { direct: ["ΑΠ 1497/2023"], secondhand: [], missing: [] },
  });
  assert.equal(r.publishDraft, true);
});
