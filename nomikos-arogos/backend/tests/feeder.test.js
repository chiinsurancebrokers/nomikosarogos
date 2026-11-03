import { test } from "node:test";
import assert from "node:assert/strict";
import { fekId, parseFekId, fekUrl, yearsToProbe, isPdf, downloadFek } from "../fek.js";
import { looksLikeRelevantLaw, normaliseClassification, classifyStatute, chunkStatute, parseJson } from "../statute.js";

test("fekId builds the 11-digit id and parseFekId reverses it", () => {
  assert.equal(fekId(2025, 1, 48), "20250100048");
  assert.equal(fekId(2025, 2, 449), "20250200449");
  assert.deepEqual(parseFekId("20250200449"), { year: 2025, issueType: 2, number: 449 });
  assert.equal(parseFekId("123"), null);
  assert.throws(() => fekId(25, 1, 1));
});

test("fekUrl fills the template", () => {
  assert.equal(fekUrl("20260100001", "https://x.test/f?id={id}"), "https://x.test/f?id=20260100001");
});

test("yearsToProbe adds the previous year in January only", () => {
  assert.deepEqual(yearsToProbe(new Date("2026-01-10T00:00:00Z")), [2025, 2026]);
  assert.deepEqual(yearsToProbe(new Date("2026-11-03T00:00:00Z")), [2026]);
});

test("downloadFek maps 404, non-PDF bodies, errors and PDFs", async () => {
  const mk = (status, body) => async () => ({ status, ok: status >= 200 && status < 300, arrayBuffer: async () => body });
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2000, 65)]);
  assert.equal((await downloadFek("1", { fetchImpl: mk(404, new ArrayBuffer(0)) })).status, "missing");
  assert.equal((await downloadFek("1", { fetchImpl: mk(200, Buffer.from("<html>not found</html>".repeat(100))) })).status, "missing");
  assert.equal((await downloadFek("1", { fetchImpl: mk(500, new ArrayBuffer(0)) })).status, "error");
  assert.equal((await downloadFek("1", { fetchImpl: async () => { throw new Error("boom"); } })).status, "error");
  const ok = await downloadFek("1", { fetchImpl: mk(200, pdf) });
  assert.equal(ok.status, "ok");
  assert.ok(isPdf(ok.buf));
});

const LAW = `ΕΦΗΜΕΡΙΣ ΤΗΣ ΚΥΒΕΡΝΗΣΕΩΣ ΝΟΜΟΣ ΥΠ' ΑΡΙΘ. 5187
Τροποποίηση του Ποινικού Κώδικα και του Κώδικα Ποινικής Δικονομίας.
Άρθρο 1 Η παράγραφος 2 του άρθρου 110Α του Ποινικού Κώδικα αντικαθίσταται ως εξής: η φυλάκιση και η κάθειρξη εκτίονται κατά τον νόμο και οι ποινικές κυρώσεις ισχύουν όπως ορίζεται.
Άρθρο 2 Στον Κώδικα Ποινικής Δικονομίας προστίθεται άρθρο με θέμα την ηλεκτρονική επιτήρηση και τις ποινικές διαδικασίες που εφαρμόζονται.`;

test("looksLikeRelevantLaw accepts a criminal-law statute and rejects other issues", () => {
  assert.equal(looksLikeRelevantLaw(LAW), true);
  assert.equal(looksLikeRelevantLaw("ΠΡΟΕΔΡΙΚΟ ΔΙΑΤΑΓΜΑ Διορισμός υπαλλήλου στο Υπουργείο"), false);
  assert.equal(looksLikeRelevantLaw("ΝΟΜΟΣ ΥΠ' ΑΡΙΘ. 1 Κρατικός προϋπολογισμός και δασμοί."), false);
});

test("normaliseClassification validates strictly", () => {
  const good = normaliseClassification({
    isLaw: true, lawRef: "ν. 5187/2025", title: "Τροποποίηση ΠΚ", area: "criminal", publishedAt: "2025-02-24",
    amends: [{ code: "Ποινικός Κώδικας", article: "110Α" }, { code: "Άγνωστος Κώδικας", article: "1" }, { code: "Ποινικός Κώδικας", article: "abc" }],
  });
  assert.equal(good.lawRef, "ν. 5187/2025");
  assert.deepEqual(good.amends, [{ code: "Ποινικός Κώδικας", article: "110Α" }]);
  assert.equal(normaliseClassification({ isLaw: false }), null);
  assert.equal(normaliseClassification({ isLaw: true, lawRef: "5187/2025", area: "criminal" }), null);
  assert.equal(normaliseClassification({ isLaw: true, lawRef: "ν. 1/2025", area: "admin" }), null);
  assert.equal(normaliseClassification(null), null);
});

test("classifyStatute parses a model reply (stubbed client) and survives junk", async () => {
  const stub = (text) => ({ messages: { create: async () => ({ content: [{ type: "text", text }] }) } });
  const reply = 'Here: {"isLaw":true,"lawRef":"ν. 5187/2025","title":"Τ","area":"criminal","publishedAt":null,"amends":[]}';
  assert.equal((await classifyStatute(stub(reply), LAW)).area, "criminal");
  assert.equal(await classifyStatute(stub("no json here"), LAW), null);
  assert.equal(parseJson("{bad json"), null);
});

test("chunkStatute splits by article", () => {
  const chunks = chunkStatute(LAW);
  const arts = chunks.map((c) => c.article);
  assert.ok(arts.includes("1") && arts.includes("2"), JSON.stringify(arts));
});

test("chunkStatute does not glue a title letter onto the article number", () => {
  const t = "Άρθρο 1\nΤροποποίηση του άρθρου 110Α του Ποινικού Κώδικα με νέο περιεχόμενο και ορισμούς.\nΆρθρο 5Α\nΝέα διάταξη για την ηλεκτρονική επιτήρηση των καταδίκων και τις προϋποθέσεις της.";
  assert.deepEqual(chunkStatute(t).map((c) => c.article), ["1", "5Α"]);
});

import { isConsolidated } from "../statute.js";
test("isConsolidated matches laws already inside the consolidated Codes", () => {
  assert.equal(isConsolidated("ν. 5344/2026"), true);
  assert.equal(isConsolidated("5303/2026"), true);
  assert.equal(isConsolidated("ν. 5187/2025"), false);
  assert.equal(isConsolidated("ν. 5400/2026", ["5400/2026"]), true);
});

import { prepareGazetteText } from "../statute.js";
test("prepareGazetteText rejoins hyphenated words, fixes glyphs and drops the table of contents", () => {
  const toc = Array.from({ length: 12 }, (_, i) => `Άρθρο ${i + 1}: Τίτλος ${i + 1}`).join("\n");
  const raw = `${toc}\n∆ΙΑΤΑΞΕΙΣ\nΆρθρο 1\nΣκοπός\nΣτο άρ-\nθρο 5 του ν. 2776/1999 και τη λει−\nτουργία.\nΆρθρο 2\nΑντικείμενο`;
  const out = prepareGazetteText(raw);
  assert.ok(!out.includes("Τίτλος 3"), "TOC entries removed");
  assert.ok(out.startsWith("Άρθρο 1\nΣκοπός"), "body starts at the first real article");
  assert.ok(out.includes("άρθρο 5") && out.includes("λειτουργία"), "hyphens rejoined");
  const chunks = chunkStatute(out + "\n" + "κείμενο ".repeat(10));
  assert.deepEqual(chunks.map((c) => c.article), ["1", "2"]);
  assert.equal(prepareGazetteText("µ∆"), "μΔ");
});
