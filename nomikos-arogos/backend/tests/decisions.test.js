import test from "node:test";
import assert from "node:assert/strict";
// decisions.js pulls in the DB pool and the OpenAI client at import time; dummy env keeps the test offline.
process.env.DATABASE_URL ||= "postgres://x:x@localhost:5432/x";
process.env.OPENAI_API_KEY ||= "test";
const { chunkDecisionDocument } = await import("../chunking.js");
const { htmlToText, decodeBody } = await import("../decisions.js");

test("a decision is never split on citations inside its own text", () => {
  const text = "Αριθμός 1497/2023\n\nΣύμφωνα με την ΑΠ 1211/2008 και την ΟλΑΠ 3/1989, η πλάνη…\n\nΑΠ 572/2016 έκρινε ότι…";
  const rows = chunkDecisionDocument(text, "ΑΠ 1497/2023", "https://example.test/x");
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((r) => r.decision === "ΑΠ 1497/2023"));
  assert.match(rows[0].text, /^Πηγή: https:\/\/example\.test\/x/);
});

test("long decisions are size-capped and keep their own reference", () => {
  const para = "Λέξη ".repeat(300);
  const rows = chunkDecisionDocument(Array(20).fill(para).join("\n\n"), "ΑΠ 1/2020");
  assert.ok(rows.length > 3);
  assert.ok(rows.every((r) => r.text.length <= 2300 && r.decision === "ΑΠ 1/2020"));
});

test("htmlToText strips markup and decodes entities", () => {
  const t = htmlToText("<html><script>x()</script><p>Άρθρο&nbsp;1857 &amp; 140</p><p>Δεύτερη</p></html>");
  assert.equal(t, "Άρθρο 1857 & 140\n\nΔεύτερη");
});

test("decodeBody falls back to windows-1253 for legacy pages", () => {
  const buf = Buffer.from([0xc1, 0xd1, 0xc5, 0xc9, 0xcf, 0xd3]); // "ΑΡΕΙΟΣ" in windows-1253
  assert.equal(decodeBody(buf, "text/html"), "ΑΡΕΙΟΣ");
});
