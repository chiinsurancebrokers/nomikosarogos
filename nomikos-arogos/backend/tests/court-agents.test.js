import test from "node:test";
import assert from "node:assert/strict";
import { publicationDateAgent, decisionBodyAgent, provenanceAgent, COURT_NOTICE_EL } from "../courtAgents.js";
import { chunkDecisionDocument } from "../chunking.js";
import { buildSourceLinks } from "../sourceLinks.js";
import { readFileSync } from "node:fs";

const ref = "ΑΠ 1497/2023";
const url = "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=EXAMPLE&apof=1497_2023";

// Real structure and publication DATE of official ΑΠ 1497/2023, synthetic reasoning text.
const decision = [
  "Λήμματα και περιλήψεις σελίδας — να αποκλειστούν",
  "Αριθμός 1497/2023",
  "ΤΟ ΔΙΚΑΣΤΗΡΙΟ ΤΟΥ ΑΡΕΙΟΥ ΠΑΓΟΥ",
  "ΣΚΕΦΘΗΚΕ ΣΥΜΦΩΝΑ ΜΕ ΤΟ ΝΟΜΟ",
  "Εφαρμοστέα νομοθεσία, πραγματικά περιστατικά και δικανική κρίση",
  "ΚΡΙΘΗΚΕ, αποφασίσθηκε στην Αθήνα, στις 16 Μαΐου 2023.",
  "ΔΗΜΟΣΙΕΥΘΗΚΕ σε δημόσια συνεδρίαση στο ακροατήριό του, στην Αθήνα, στις 4 Οκτωβρίου 2023.",
].join("\n");

test("publication agent identifies decision publication, NOT deliberation", () => {
  assert.deepEqual(publicationDateAgent(decision), {
    status: "publication_date_extracted", publishedAt: "2023-10-04",
  });
});

test("publication agent supports alternate date representations and rejects invalid days", () => {
  assert.equal(publicationDateAgent("ΔΗΜΟΣΙΕΥΘΗΚΕ στην Αθήνα στις 29/02/2024").publishedAt, "2024-02-29");
  assert.equal(publicationDateAgent("ΔΗΜΟΣΙΕΥΘΗΚΕ στις 31 Φεβρουαρίου 2024").publishedAt, null);
  assert.equal(publicationDateAgent("ΚΡΙΘΗΚΕ στην Αθήνα στις 4 Οκτωβρίου 2023.").status, "missing_publication_clause");
});

test("full-text agent excludes the court website's indexes and summaries", () => {
  const body = decisionBodyAgent(decision, ref);
  assert.ok(body.startsWith("Αριθμός 1497/2023"));
  assert.ok(!body.includes("Λήμματα και περιλήψεις"));
  assert.match(body, /ΣΚΕΦΘΗΚΕ/);
});

test("does not accept another case's decision body", () => {
  assert.throws(() => decisionBodyAgent(decision, "ΑΠ 1496/2023"));
  assert.throws(() => decisionBodyAgent("Αριθμός 1497/2023\nΆσχετο περιεχόμενο", ref));
});

test("provenance agent requires official source and publication date", () => {
  const meta = provenanceAgent({ decisionRef: ref, url, publishedAt: "2023-10-04" });
  assert.equal(meta.publishedAt, "2023-10-04");
  assert.match(meta.notice, /πληροφοριακό χαρακτήρα/);
  assert.match(COURT_NOTICE_EL, /Δεν αναδημοσιεύονται/);
  assert.throws(() => provenanceAgent({ decisionRef: ref, url, publishedAt: null }));
  assert.throws(() => provenanceAgent({ decisionRef: ref, url: "https://evil.test/case", publishedAt: "2023-10-04" }));
});

test("every decision chunk is attributable by publisher URL and date", () => {
  const chunks = chunkDecisionDocument(decision, ref, url, "2023-10-04");
  assert.ok(chunks.every((c) => c.text.includes("Πηγή: " + url)));
  assert.ok(chunks.every((c) => c.text.includes("Ημερομηνία δημοσίευσης απόφασης: 2023-10-04")));
  const links = buildSourceLinks([{ ref, text: chunks[0].text }]);
  assert.equal(links[0]?.publishedAt, "2023-10-04");
});

test("decision indexer uses proper SQL bind markers and all three agents", () => {
  const code = readFileSync(new URL("../decisions.js", import.meta.url), "utf8");
  assert.match(code, /publicationDateAgent\(body\)/);
  assert.match(code, /decisionBodyAgent\(text, entry\.ref\)/);
  assert.match(code, /provenanceAgent\(\{ url: entry\.url/);
  assert.ok(code.includes('Array.from({ length: 8 }'));
  assert.ok(code.includes('"$" + (b + j + 1)'));
});
