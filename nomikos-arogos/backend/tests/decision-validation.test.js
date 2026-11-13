import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDecisionManifestEntry, validateDecisionText } from "../decisionValidation.js";
import { buildSourceLinks } from "../sourceLinks.js";
import { chunkDecisionDocument } from "../chunking.js";

const example = {
  ref: "ΑΠ 1497/2023", area: "civil",
  url: "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=EXAMPLE&apof=1497_2023",
};

test("all 22 manifest candidates match their official URL identifiers (not proof of their text)", () => {
  const files = JSON.parse(readFileSync(new URL("../decisions.json", import.meta.url)));
  assert.equal(files.length, 22);
  for (const file of files) assert.equal(validateDecisionManifestEntry(file).ref, file.ref);
});

test("rejects nonofficial hosts, malicious schemes and mismatched ids", () => {
  assert.throws(() => validateDecisionManifestEntry({ ...example, url: "https://evil.test/?apof=1497_2023" }));
  assert.throws(() => validateDecisionManifestEntry({ ...example, url: "javascript:alert(1)" }));
  assert.throws(() => validateDecisionManifestEntry({ ...example, url: example.url.replace("1497_2023", "1496_2023") }));
  assert.throws(() => validateDecisionManifestEntry({ ...example, ref: "ΑΠ 1496/2023" }));
});

test("verifies decision identity in header, not just a citation elsewhere", () => {
  assert.equal(validateDecisionText(example, "ΑΡΙΘΜΟΣ 1497/2023\nΑΡΕΙΟΣ ΠΑΓΟΣ\nΑΠ 572/2016"), true);
  assert.throws(() => validateDecisionText(example, "ΑΡΙΘΜΟΣ 1496/2023\nΑΡΕΙΟΣ ΠΑΓΟΣ\nΑΠ 1497/2023"));
  assert.throws(() => validateDecisionText(example, "ΑΡΙΘΜΟΣ 1496/2023\nΑΡΙΘΜΟΣ 1497/2023"));
  assert.throws(() => validateDecisionText(example, "Σελίδα αποτελεσμάτων με άλλες αποφάσεις"));
});

test("every decision chunk retains official provenance", () => {
  const rows = chunkDecisionDocument(("ΑΡΙΘΜΟΣ 1497/2023\n\n" + ("Νομικό κείμενο ".repeat(400) + "\n\n").repeat(3)), example.ref, example.url);
  assert.ok(rows.length > 1);
  assert.ok(rows.every((c) => c.text.startsWith(`Πηγή: ${example.url}\n`) && c.text.length <= 2200));
});

test("only a verified retrieved primary-source link becomes clickable", () => {
  const rows = chunkDecisionDocument("ΑΡΙΘΜΟΣ 1497/2023 και το πλήρες σκεπτικό.", example.ref, example.url);
  const good = buildSourceLinks([{ ref: example.ref, text: rows[0].text }]);
  assert.equal(good[0]?.url, example.url);
  const bad = buildSourceLinks([
    { ref: example.ref, text: "Πηγή: https://evil.test/nomologia/apofaseis_DISPLAY.asp?apof=1497_2023\nΚείμενο" },
  ]);
  assert.deepEqual(bad, []);
});
