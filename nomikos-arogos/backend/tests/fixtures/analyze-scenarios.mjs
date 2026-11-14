import assert from "node:assert/strict";
import { once } from "node:events";
import { state } from "./analyze-services.mjs";
const { server } = await import("../../server.js");
if (!server.listening) await once(server, "listening");
const url = `http://127.0.0.1:${server.address().port}/api/analyze`;
const source = { ref: "Ποινικός Κώδικας άρθρο 1", text: "Synthetic source: The sentence is 2 years." };
const post = async (body, authenticated = true) => {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { Authorization: "Bearer synthetic-test-session" } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const request = { question: "What prison sentence applies?", area: "criminal", lang: "en", mode: "quick" };
try {
  assert.equal((await post(request, false)).status, 401);
  state.sources = [source]; state.analysis = "The sentence is 20 years.";
  let result = await post(request);
  assert.equal(result.status, 200);
  assert.equal(result.body.verification.verdict, "supported");
  assert.equal(result.body.quality.status, "unsourced_criminal_figure");
  assert.equal(result.body.quality.publishDraft, false);
  assert.notEqual(result.body.analysis, state.analysis);
  assert.match(result.body.analysis, /unsupported/);
  assert.equal(state.reviewCalls, 1); // quick English criminal requests still get independent review

  state.analysis = "The sentence is 2 years.";
  result = await post(request);
  assert.equal(result.body.quality.status, "checked_against_retrieved_sources");
  assert.equal(result.body.analysis, state.analysis);

  state.verdict = "partially_supported";
  result = await post(request);
  assert.equal(result.body.quality.status, "review_failed");
  assert.notEqual(result.body.analysis, state.analysis);

  state.sources = []; const calls = state.analysisCalls;
  result = await post(request);
  assert.equal(result.body.quality.status, "no_sources");
  assert.equal(state.analysisCalls, calls);

  result = await post({ question: "Θέλω ακύρωση αποποίησης κληρονομιάς.", area: "civil" });
  assert.equal(result.body.quality.status, "temporal_date_required");

  state.docFacts = { dates: [{ label: "Ημερομηνία θανάτου", date: "07/10/2025" }] };
  result = await post({ question: "Θέλω ακύρωση αποποίησης κληρονομιάς.", area: "civil",
    document: { mediaType: "application/pdf", data: "synthetic-placeholder-not-a-case-file" } });
  assert.equal(result.body.temporal.deathDate, "2025-10-07");
  const sessionFacts = result.body.sessionFacts;
  assert.deepEqual(sessionFacts.dates.map(d => d.date), ["2025-10-07"]);
  result = await post({ area: "civil", sessionFacts, messages: [
    { role: "user", content: "Θέλω ακύρωση αποποίησης κληρονομιάς." },
    { role: "assistant", content: "Ποια είναι η ημερομηνία θανάτου;" },
    { role: "user", content: "07/10/2025" },
    { role: "assistant", content: "Πότε έγινε η αποποίηση;" },
    { role: "user", content: "15/01/2026" },
  ] });
  assert.equal(result.body.temporal.deathDate, "2025-10-07");
  assert.notEqual(result.body.quality.status, "temporal_date_required");
  assert.equal(state.analysisCalls, calls);
  console.log("HTTP regressions passed: auth boundary, criminal numeric gate, independent review, no sources, PDF date/session continuity");
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
