import test from "node:test";
import assert from "node:assert/strict";
import { splitByCurrency, currencyAgent } from "../agents.js";

test("no Code receives a current-through badge without provenance", () => {
  const refs = ["Κώδικας Ποινικής Δικονομίας άρθρο 98", "Ποινικός Κώδικας άρθρο 105Β", "Αστικός Κώδικας άρθρο 281"];
  const r = splitByCurrency(refs);
  assert.deepEqual(r.current, []);
  assert.deepEqual(r.unknown, refs);
});

test("currency disclosure never asks a model to invent new laws", async () => {
  const anthropic = { messages: { create: () => { throw new Error("should never call a model"); } } };
  const r = await currencyAgent(anthropic, { answer: "x", sources: [{ ref: "Κώδικας Ποινικής Δικονομίας άρθρο 98" }], lang: "el" });
  assert.deepEqual(r.current, []);
  assert.match(r.notice, /μεταβατικές διατάξεις/);
});

test("empty retrieval has no current-law claim", async () => {
  const r = await currencyAgent(null, { sources: [], lang: "en" });
  assert.equal(r.notice, null);
  assert.deepEqual(r.current, []);
});
