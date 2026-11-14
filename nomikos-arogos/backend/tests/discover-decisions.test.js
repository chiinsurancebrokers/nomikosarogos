import test from "node:test";
import assert from "node:assert/strict";
import { mergeDiscovered, hitsFrom } from "../discoverDecisions.js";

const u = (n, y) => `https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=ABC&apof=${n}_${y}`;
test("adds new official AP decisions, dedupes, rejects foreign/mismatched links", () => {
  const existing = [{ ref: "ΑΠ 1/2020", court: "Άρειος Πάγος", area: "civil", url: u(1, 2020) }];
  const hits = [
    { url: u(1, 2020), court: "Άρειος Πάγος" },
    { url: u(50, 2022), court: "Άρειος Πάγος", date: "2022-02-01" },
    { url: "https://evil.example/nomologia/apofaseis_DISPLAY.asp?apof=9_2022" },
    { url: u(7, 1999), court: "Άρειος Πάγος", date: "1999-01-01" },
    { url: u(8, 2022), court: "Συμβούλιο της Επικρατείας" },
  ];
  const r = mergeDiscovered(existing, hits, { area: "civil", since: 2010, topic: "t" });
  assert.deepEqual(r.added.map((d) => d.ref), ["ΑΠ 50/2022"]);
  assert.equal(r.rejected.length, 3);
  assert.equal(r.merged.length, 2);
});
test("hitsFrom accepts a search response, an array, or a list of responses", () => {
  assert.equal(hitsFrom({ hits: [{}, {}] }).length, 2);
  assert.equal(hitsFrom([{ url: "x" }]).length, 1);
  assert.equal(hitsFrom([{ hits: [{}, {}] }, { hits: [{}] }]).length, 3);
});
