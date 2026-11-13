import test from "node:test";
import assert from "node:assert/strict";
import { contextualizeDeathReplies, sanitizeSessionFacts, mergeSessionFacts, inheritancePreflight } from "./sessionContext.js";

const question = "Μπορώ να ζητήσω ακύρωση αποποίησης κληρονομιάς λόγω πλάνης;";
const deathAsk = "Ποια είναι η ημερομηνία θανάτου του κληρονομουμένου;";

test("07/10/2025 death reply after intake, 15/01/2026 renunciation does not replace death", () => {
  const history = [
    { role: "user", content: question + " Η αποποίηση έγινε 15/01/2026." },
    { role: "assistant", content: deathAsk },
    { role: "user", content: "07/10/2025" },
    { role: "assistant", content: "Κατανοητό." },
    { role: "user", content: "Τι ισχύει για την αποποίηση;" },
  ];
  const p = inheritancePreflight(history, null);
  assert.equal(p.temporal.deathDate, "2025-10-07");
  assert.equal(p.temporal.applicableArticle, "Αστικός Κώδικας άρθρο 1857");
  assert.equal(p.skipIntake, true);
});

test("Greek written death date after death question is retained", () => {
  const p = inheritancePreflight([
    { role: "user", content: question },
    { role: "assistant", content: deathAsk },
    { role: "user", content: "07 Οκτωβρίου 2025" },
  ], null);
  assert.equal(p.temporal.deathDate, "2025-10-07");
});

test("date answer to unrelated assistant question is never treated as death", () => {
  const p = inheritancePreflight([
    { role: "user", content: question },
    { role: "assistant", content: "Πότε έγινε η αποποίηση;" },
    { role: "user", content: "15/01/2026" },
  ], null);
  assert.equal(p.temporal.status, "date_required");
});

test("follow-up without PDF reuses only sanitized date facts from earlier document", () => {
  const stored = sanitizeSessionFacts({
    summary: "PRIVATE DOCUMENT TEXT MUST NOT LEAK",
    dates: [
      { label: "Ημερομηνία θανάτου", date: "07/10/2025" },
      { label: "Ημερομηνία αποποίησης", date: "15/01/2026" },
    ],
  });
  assert.deepEqual(stored, { dates: [{ label: "Ημερομηνία θανάτου κληρονομουμένου", date: "2025-10-07" }] });
  assert.equal(JSON.stringify(stored).includes("PRIVATE"), false);
  const p = inheritancePreflight([{ role: "user", content: question }], mergeSessionFacts(stored, null));
  assert.equal(p.temporal.deathDate, "2025-10-07");
  assert.equal(p.skipIntake, true);
});

test("missing death date blocks premature intake for inheritance", () => {
  const p = inheritancePreflight([{ role: "user", content: question + " Η αποποίηση έγινε 15/01/2026." }], null);
  assert.equal(p.temporal.status, "date_required");
  assert.equal(p.skipIntake, true);
});

test("conflicting document dates do not silently select a regime", () => {
  const p = inheritancePreflight([{ role: "user", content: question }], mergeSessionFacts(
    { dates: [{ label: "ημερομηνία θανάτου", date: "07/10/2025" }] },
    { dates: [{ label: "ημερομηνία θανάτου", date: "17/10/2026" }] },
  ));
  assert.equal(p.temporal.status, "conflicting_death_dates");
});

test("ordinary questions still use normal intake", () => {
  const p = inheritancePreflight([{ role: "user", content: "Ο ιδιοκτήτης δεν μου επιστρέφει την εγγύηση." }], null);
  assert.equal(p.skipIntake, false);
});
