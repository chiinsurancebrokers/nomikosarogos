// anchors.js — "Concept anchors" for retrieval.
//
// PROBLEM THIS SOLVES: some fundamental legal institutions (e.g. αδικαιολόγητος πλουτισμός,
// αδικοπραξία) are the *correct* basis for an answer, but their article text shares almost no
// words with how a citizen phrases the question — so plain semantic + lexical search never
// surfaces them. An anchor says: "whenever this institution is mentioned, ALWAYS include these
// specific articles in the retrieved sources." It's a deterministic concept → article map.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO ADD A NEW INSTITUTION (you can extend this freely):
//   {
//     institution: "Όνομα θεσμού",              // human label (for your reference)
//     triggers:    ["λεξη κλειδι", "συνωνυμο"], // if ANY appears in the (expanded) query → fire
//     code:        "Αστικός Κώδικας",           // MUST match code_name exactly as in sources.json
//     articles:    ["904"],                      // one or more article numbers, as strings
//     area:        "civil",                      // "civil" | "criminal" (controls when it fires)
//   }
// Triggers are matched accent- and case-insensitively, so write them naturally.
// Codes must be one of: "Αστικός Κώδικας", "Κώδικας Πολιτικής Δικονομίας",
//   "Ποινικός Κώδικας", "Κώδικας Ποινικής Δικονομίας".
//
// ⚠️  VERIFY THE ARTICLE NUMBERS. The seed numbers below are canonical, stable provisions, but
//     a wrong number here becomes a wrong citation everywhere. Have a lawyer confirm each entry,
//     and check it against your own ingested text, before relying on it in production. Criminal
//     and procedure numbering in particular changed with recent reforms — double-check those.
// ─────────────────────────────────────────────────────────────────────────────

export const ANCHORS = [
  // ── ΑΣΤΙΚΟΣ ΚΩΔΙΚΑΣ — γενικοί θεσμοί ──
  { institution: "Αδικαιολόγητος πλουτισμός", triggers: ["αδικαιολογητος πλουτισμος", "πλουτισμος", "χωρις νομιμη αιτια"], code: "Αστικός Κώδικας", articles: ["904"], area: "civil" },
  { institution: "Αδικοπραξία / αποζημίωση", triggers: ["αδικοπραξια", "αδικοπρακτικη", "παρανομη πραξη"], code: "Αστικός Κώδικας", articles: ["914"], area: "civil" },
  { institution: "Χρηματική ικανοποίηση ηθικής βλάβης", triggers: ["ηθικη βλαβη", "χρηματικη ικανοποιηση", "ηθικης βλαβης"], code: "Αστικός Κώδικας", articles: ["932"], area: "civil" },
  { institution: "Καταχρηστική άσκηση δικαιώματος", triggers: ["καταχρηση δικαιωματος", "καταχρηστικη ασκηση", "καταχρηστικη"], code: "Αστικός Κώδικας", articles: ["281"], area: "civil" },
  { institution: "Καλή πίστη / συναλλακτικά ήθη", triggers: ["καλη πιστη", "συναλλακτικα ηθη"], code: "Αστικός Κώδικας", articles: ["288"], area: "civil" },
  { institution: "Υπερημερία οφειλέτη", triggers: ["υπερημερια", "καθυστερηση οφειλης"], code: "Αστικός Κώδικας", articles: ["340", "341"], area: "civil" },
  { institution: "Παραγραφή αξιώσεων", triggers: ["παραγραφη", "παραγραφης"], code: "Αστικός Κώδικας", articles: ["247", "249", "250"], area: "civil" },

  // ── ΠΟΙΝΙΚΟΣ ΚΩΔΙΚΑΣ ──
  { institution: "Κλοπή", triggers: ["κλοπη", "εκλεψε", "κλεμμενο"], code: "Ποινικός Κώδικας", articles: ["372"], area: "criminal" },
  { institution: "Υπεξαίρεση", triggers: ["υπεξαιρεση"], code: "Ποινικός Κώδικας", articles: ["375"], area: "criminal" },
  { institution: "Απάτη", triggers: ["απατη", "εξαπατηση"], code: "Ποινικός Κώδικας", articles: ["386"], area: "criminal" },
  { institution: "Σωματική βλάβη", triggers: ["σωματικη βλαβη", "τραυματισμος", "ξυλοδαρμος"], code: "Ποινικός Κώδικας", articles: ["308"], area: "criminal" },
  { institution: "Απειλή", triggers: ["απειλη", "απειλες"], code: "Ποινικός Κώδικας", articles: ["333"], area: "criminal" },
  { institution: "Εκβίαση", triggers: ["εκβιαση", "εκβιαστικα"], code: "Ποινικός Κώδικας", articles: ["385"], area: "criminal" },

  // ── ΚΩΔΙΚΑΣ ΠΟΛΙΤΙΚΗΣ ΔΙΚΟΝΟΜΙΑΣ ──
  { institution: "Διαταγή πληρωμής", triggers: ["διαταγη πληρωμης"], code: "Κώδικας Πολιτικής Δικονομίας", articles: ["623"], area: "civil" },
  { institution: "Ασφαλιστικά μέτρα", triggers: ["ασφαλιστικα μετρα"], code: "Κώδικας Πολιτικής Δικονομίας", articles: ["682"], area: "civil" },
];
