import test from "node:test";
import assert from "node:assert/strict";
import { sourceChecker } from "../agents.js";

// retrieve.js builds its OpenAI/pg clients at import time; dummy values keep the test offline.
process.env.OPENAI_API_KEY ||= "test";
process.env.DATABASE_URL ||= "postgres://x:x@localhost/x";
const { firedAnchors, mergeSources } = await import("../retrieve.js");

test("Tavros / μεταγωγών question fires the π.δ. 141/1991 art. 67 anchor", () => {
  const q = "Συνελήφθη ο γιος μου και κρατείται στα κρατητήρια των Μεταγωγών στον Ταύρο. Ποιες οι επισκέψεις;";
  for (const area of ["criminal", "both", undefined]) {
    const f = firedAnchors(q, area);
    assert.ok(f.some((p) => p.code === "π.δ. 141/1991" && p.article === "67"), `area=${area}`);
  }
});

test("mergeSources keeps several chunks of the same article, drops exact duplicates", () => {
  const anchors = [
    { code_name: "π.δ. 141/1991", article: "67", content: "Άρθρο 67 μέρος Α: επισκεπτήριο ..." },
    { code_name: "π.δ. 141/1991", article: "67", content: "Άρθρο 67 (συνέχεια) μέρος Β: ρούχα, τρόφιμα ..." },
  ];
  const scored = [
    { r: { code_name: "π.δ. 141/1991", article: "67", content: "Άρθρο 67 μέρος Α: επισκεπτήριο ..." }, score: 0.9 }, // dup of anchor
    { r: { code_name: "π.δ. 141/1991", article: "60", content: "Άρθρο 60 ..." }, score: 0.8 },
  ];
  const out = mergeSources(anchors, scored, 10);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((s) => s.ref), ["π.δ. 141/1991 άρθρο 67", "π.δ. 141/1991 άρθρο 67", "π.δ. 141/1991 άρθρο 60"]);
  assert.ok(out[0].anchored && out[1].anchored && !out[2].anchored);
});

test("mergeSources caps non-anchored chunks per article and total k", () => {
  const scored = Array.from({ length: 6 }, (_, i) => ({
    r: { code_name: "Ποινικός Κώδικας", article: "5", content: `chunk ${i} `.repeat(20) }, score: 1 - i / 10,
  }));
  assert.equal(mergeSources([], scored, 10).length, 3);
  const many = Array.from({ length: 12 }, (_, i) => ({ r: { code_name: "Χ", article: String(i), content: `c${i}` }, score: 1 }));
  assert.equal(mergeSources([], many, 5).length, 5);
});

test("sourceChecker never drops anchored sources", async () => {
  const sources = [
    { ref: "A 1", text: "x" }, { ref: "A 2", text: "y" }, { ref: "A 3", text: "z" },
    { ref: "π.δ. 141/1991 άρθρο 67", text: "irrelevant-looking start", anchored: true },
    { ref: "A 5", text: "w" },
  ];
  const anthropic = { messages: { create: async () => ({ content: [{ type: "text", text: '{"keep":[1,2]}' }] }) } };
  const r = await sourceChecker(anthropic, { query: "q", sources });
  assert.ok(r.sources.some((s) => s.anchored));
  assert.deepEqual(r.sources.map((s) => s.ref), ["A 1", "A 2", "π.δ. 141/1991 άρθρο 67"]);
});

test("detention questions also anchor π.δ. 254/2004 art. 3", () => {
  const f = firedAnchors("Κρατείται στα κρατητήρια, μπορώ να επικοινωνήσω με δικηγόρο;", "criminal");
  assert.ok(f.some((p) => p.code === "π.δ. 254/2004" && p.article === "3"));
});

test("sentence-execution question fires 471/105Β/παραγραφή anchors and NOT the police-cell ones", () => {
  const q = "Καταδικάστηκε σε 6ετη κάθειρξη από το εφετείο και βρίσκεται στο Τμήμα Μεταγωγών. Σχετικές έννοιες: αναστολή εκτέλεσης, αναίρεση, απόλυση υπό όρο, ευεργετικός υπολογισμός, παραγραφή";
  const f = firedAnchors(q, "criminal");
  const has = (code, art) => f.some((p) => p.code === code && p.article === art);
  assert.ok(has("Κώδικας Ποινικής Δικονομίας", "471"));
  assert.ok(has("Ποινικός Κώδικας", "105Β"));
  assert.ok(has("Ποινικός Κώδικας", "111"));
  assert.ok(!f.some((p) => p.code === "π.δ. 141/1991" || p.code === "π.δ. 254/2004"));
});
