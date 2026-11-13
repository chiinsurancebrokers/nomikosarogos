// Offline regression rubric for previously captured answers. This is NOT a legal
// accuracy score; lawyers must review the corpus, sources and expected conclusions.
import { classifyCitations } from "../citations.js";

const normalize = (text) => String(text || "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function gradeCase(testCase, response) {
  const text = normalize(response?.analysis || response?.answer || "");
  const failures = [];
  for (const term of (testCase.must_mention || []))
    if (!text.includes(normalize(term))) failures.push(`Missing required concept: ${term}`);
  for (const phrase of (testCase.must_not || []))
    if (text.includes(normalize(phrase))) failures.push(`Contains prohibited unqualified phrase: ${phrase}`);
  if (testCase.must_flag) {
    for (const term of testCase.must_flag)
      if (!text.includes(normalize(term))) failures.push(`Missing explicit legal-currency flag: ${term}`);
  }
  if (testCase.must_not_cite_outside_sources) {
    const cited = classifyCitations(response?.analysis || response?.answer, response?.retrievedSources || []);
    if (cited.missing.length || cited.secondhand.length)
      failures.push(`Unverified case law: ${[...cited.missing, ...cited.secondhand].join(", ")}`);
  }
  if (testCase.expect === "clarifying_question" && !/[;?？]/u.test(response?.analysis || response?.answer || ""))
    failures.push("Expected a clarifying question");
  return { id: testCase.id, pass: failures.length === 0, failures };
}

export function gradeSuite(suite, byId) {
  const results = suite.cases.map((c) =>
    byId[c.id] ? gradeCase(c, byId[c.id]) : { id: c.id, pass: false, failures: ["No recorded answer supplied"] });
  return { passed: results.filter((r) => r.pass).length, total: results.length, results };
}
