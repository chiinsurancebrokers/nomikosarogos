import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  officialLegalUrl, eventDates, selectHistoricalVersion,
  guardHistoricalSources, assessHistoricalDraft, historyStatusMessage,
} from "../legalHistory.js";

const bodyOld = "ΥΠΟΘΕΤΙΚΟ ΚΕΙΜΕΝΟ ΕΛΕΓΧΟΥ Παλαιά διάταξη περί συμβάσεων, που χρησιμοποιείται μόνο στα τεστ. ".repeat(4);
const bodyNew = "ΥΠΟΘΕΤΙΚΟ ΚΕΙΜΕΝΟ ΕΛΕΓΧΟΥ Νεότερη διάταξη περί συμβάσεων, που χρησιμοποιείται μόνο στα τεστ. ".repeat(4);
const digest = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const rule = {
  rule_id: "synthetic_contract_rule", topic: "synthetic_contract", area: "civil",
  event_type: "contract", match_terms: ["ακύρωση σύμβασης"],
  source_ref: "Υποθετικός μεταβατικός κανόνας", source_url: "https://www.et.gr/",
  review_status: "approved", has_exceptions: false,
};
const oldVersion = {
  version_id: "contract_v1", rule_id: rule.rule_id, review_status: "approved",
  code_name: "Ενδεικτικός Κώδικας", article: "12",
  citation: "Ενδεικτικός Κώδικας άρθρο 12 (ιστορική έκδοση)",
  applicable_from: "2023-01-01", applicable_until: "2026-01-01",
  published_at: "2022-12-20", source_url: "https://www.et.gr/",
  source_ref: "Υποθετικό ΦΕΚ", body_text: bodyOld, body_sha256: digest(bodyOld),
  retroactive: false,
};
const newVersion = {
  ...oldVersion, version_id: "contract_v2",
  citation: "Ενδεικτικός Κώδικας άρθρο 12 (νεότερη έκδοση)",
  applicable_from: "2026-01-01", applicable_until: null,
  published_at: "2025-12-10", body_text: bodyNew, body_sha256: digest(bodyNew),
};

const select = (question, opts = {}) => selectHistoricalVersion({
  question, area: "civil", rules: [rule], versions: [oldVersion, newVersion], ...opts,
});

test("legal history allows HTTPS primary authorities, rejects spoofed hosts", () => {
  assert.equal(officialLegalUrl("https://www.et.gr/doc"), true);
  assert.equal(officialLegalUrl("https://www.ministryofjustice.gr/"), true);
  assert.equal(officialLegalUrl("https://www.et.gr.evil.com/doc"), false);
  assert.equal(officialLegalUrl("http://www.et.gr/"), false);
  assert.equal(officialLegalUrl("javascript:alert(1)"), false);
});

test("event date, not later filing date, chooses old contract law", () => {
  const s = select("Η κατάρτιση της σύμβασης 15.03.2025, κατάθεση αγωγής 14.04.2026, ζητείται ακύρωση σύμβασης.");
  assert.equal(s.status, "selected");
  assert.equal(s.eventDate, "2025-03-15");
  assert.equal(s.version.ref, oldVersion.citation);
});

test("new interval takes effect exactly at its first day", () => {
  assert.equal(select("Η κατάρτιση 31.12.2025, ζητείται ακύρωση σύμβασης.").version.ref, oldVersion.citation);
  assert.equal(select("Η κατάρτιση 01.01.2026, ζητείται ακύρωση σύμβασης.").version.ref, newVersion.citation);
});

test("structured documents may supply the event date", () => {
  const s = select("Ζητείται ακύρωση σύμβασης.", {
    docFacts: { dates: [
      { label: "Κατάρτιση σύμβασης", date: "1 Ιανουαρίου 2026" },
      { label: "Κατάθεση αγωγής", date: "15/07/2026" },
    ] },
  });
  assert.equal(s.status, "selected");
  assert.equal(s.eventDate, "2026-01-01");
});

test("no event date and conflicting dates block source selection", () => {
  const missing = select("Ακύρωση σύμβασης χωρίς ημερομηνία.");
  assert.equal(missing.status, "date_required");
  assert.match(historyStatusMessage(missing), /κρίσιμου γεγονότος/);
  const conflicting = select("Η κατάρτιση 1/1/2025 και άλλη κατάρτιση 1/2/2026, ακύρωση σύμβασης.");
  assert.equal(conflicting.status, "date_conflict");
});

test("unapproved rules cannot silently change law", () => {
  const s = select("Η κατάρτιση 1/1/2025, ακύρωση σύμβασης.", {
    rules: [{ ...rule, review_status: "pending" }],
  });
  assert.equal(s.status, "not_covered");
});

test("unreviewed and modified legal texts never pass the gate", () => {
  const question = "Η κατάρτιση 1/1/2025, ακύρωση σύμβασης.";
  assert.equal(select(question, { versions: [{ ...oldVersion, review_status: "pending" }] }).status, "version_missing");
  assert.equal(select(question, { versions: [{ ...oldVersion, body_text: "CHANGED!" }] }).status, "version_missing");
});

test("unproven retroactivity is not applied", () => {
  const retro = { ...oldVersion, applicable_from: "2022-01-01", published_at: "2023-01-01" };
  const question = "Η κατάρτιση 1/2/2022, ακύρωση σύμβασης.";
  assert.equal(select(question, { versions: [retro] }).status, "version_missing");
  const approvedRetro = { ...retro, retroactive: true, retroactivity_source_url: "https://www.et.gr/" };
  assert.equal(select(question, { versions: [approvedRetro] }).status, "selected");
});

test("overlapping versions and explicit exceptions stop the model", () => {
  const question = "Η κατάρτιση 1/2/2025, ακύρωση σύμβασης.";
  const overlap = { ...newVersion, applicable_from: "2025-01-01", published_at: "2024-12-15" };
  assert.equal(select(question, { versions: [oldVersion, overlap] }).status, "overlapping_versions");
  assert.equal(select(question, { rules: [{ ...rule, has_exceptions: true }] }).status, "exception_review");
});

test("unrelated legal questions are not forced into the registry's contract rule", () => {
  const s = select("Θάνατος 7.10.2025, αποποίηση κληρονομίας.");
  assert.equal(s.status, "not_covered");
});

test("selected text replaces confusing Code article chunks and is not duplicated", () => {
  const selection = select("Η κατάρτιση 15.03.2025, ακύρωση σύμβασης.");
  const sources = [
    { ref: "Ενδεικτικός Κώδικας άρθρο 12", text: bodyNew },
    { ref: "Ενδεικτικός Κώδικας άρθρο 12", text: bodyOld },
    { ref: "Άλλη διάταξη άρθρο 88", text: "Άσχετο" },
  ];
  const guarded = guardHistoricalSources(sources, selection);
  assert.equal(guarded.excluded, 2);
  assert.equal(guarded.sources[0].ref, oldVersion.citation);
  assert.equal(guarded.sources.length, 2);
  assert.equal(guardHistoricalSources(guarded.sources, selection).sources.length, 2);
});

test("draft requires explicit approved historical source reference", () => {
  const selection = select("Η κατάρτιση 15.03.2025, ακύρωση σύμβασης.");
  assert.equal(assessHistoricalDraft("Εφαρμόζεται το άρθρο 12.", selection).publishDraft, false);
  assert.equal(assessHistoricalDraft("Εφαρμόζεται ο " + oldVersion.citation + ".", selection), null);
});

test("source registry and server enforce pending state and temporal gating", () => {
  const store = readFileSync(new URL("../legalHistoryStore.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(store, /legal_transition_rules/);
  assert.match(store, /legal_text_versions/);
  assert.match(store, /review_status='approved'/);
  assert.match(server, /selectHistoricalVersion/);
  assert.match(server, /guardHistoricalSources/);
  assert.match(server, /assessHistoricalDraft/);
});
