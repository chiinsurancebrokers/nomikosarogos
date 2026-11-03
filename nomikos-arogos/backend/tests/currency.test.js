import test from "node:test";
import assert from "node:assert/strict";
import { splitByCurrency, currencyAgent } from "../agents.js";

test("splitByCurrency separates dated Codes from everything else", () => {
  const r = splitByCurrency(["Κώδικας Ποινικής Δικονομίας άρθρο 98", "Ποινικός Κώδικας άρθρο 105Β", "Αστικός Κώδικας άρθρο 281"]);
  assert.deepEqual(r.current.map((c) => c.code).sort(), ["Κώδικας Ποινικής Δικονομίας", "Ποινικός Κώδικας"]);
  assert.deepEqual(r.unknown, ["Αστικός Κώδικας άρθρο 281"]);
});

test("criminal-only answers never call the model and raise no notice", async () => {
  const anthropic = { messages: { create: () => { throw new Error("must not be called"); } } };
  const r = await currencyAgent(anthropic, { answer: "x", sources: [{ ref: "Κώδικας Ποινικής Δικονομίας άρθρο 98" }], lang: "el" });
  assert.equal(r.notice, null);
  assert.equal(r.current.length, 1);
});

test("a civil source still goes to the model, which only sees the civil refs", async () => {
  let seen;
  const anthropic = { messages: { create: async (o) => { seen = o.messages[0].content; return { content: [{ type: "text", text: '{"notice":"hedged"}' }] }; } } };
  const r = await currencyAgent(anthropic, { answer: "x", sources: [{ ref: "Αστικός Κώδικας άρθρο 281" }, { ref: "Ποινικός Κώδικας άρθρο 1" }], lang: "el" });
  assert.equal(r.notice, "hedged");
  assert.ok(seen.includes("Αστικός Κώδικας άρθρο 281") && !seen.includes("Ποινικός Κώδικας άρθρο 1"));
});
