import test from "node:test";
import assert from "node:assert/strict";
import { classifyCriminalStakes, criminalCriteriaBlock, assessCriminalDraft, offenceDatesBefore, criminalDecisionLimit } from "../criminalStakes.js";
import { verifyCaseLawFindings } from "../caseLawEvidence.js";

test("detects sentence, remedy, detention and limitation categories in criminal context", () => {
  const s = classifyCriminalStakes("Καταδικάστηκα σε φυλάκιση 2 ετών. Μπορώ να ασκήσω έφεση και ποια η προθεσμία;", "criminal");
  assert.ok(s.high && s.categories.includes("sentence") && s.categories.includes("remedy"));
  assert.ok(classifyCriminalStakes("Με συνέλαβαν αυτόφωρα, θα με προφυλακίσουν;", "").categories.includes("detention"));
  assert.ok(classifyCriminalStakes("Πότε παραγράφεται η πλημμελειοδικία;", "criminal").categories.includes("limitation"));
});
test("civil deadlines and civil area are not treated as criminal", () => {
  assert.equal(classifyCriminalStakes("Ποια η προθεσμία της ανακοπής κατά διαταγής πληρωμής;", "civil").high, false);
  assert.equal(classifyCriminalStakes("Ποια η προθεσμία για την αγωγή αποζημίωσης;", "").high, false);
});
test("acts before 1.7.2019 are flagged, later ones are not", () => {
  assert.deepEqual(offenceDatesBefore("Το αδίκημα τελέστηκε στις 12/3/2018"), ["12.3.2018"]);
  assert.deepEqual(offenceDatesBefore("Η πράξη έγινε το 2017"), ["2017"]);
  assert.deepEqual(offenceDatesBefore("Η πράξη έγινε στις 5.9.2021"), []);
  assert.equal(classifyCriminalStakes("Κατηγορούμαι για πράξη του 2016 με ποινή φυλάκισης", "criminal").oldCodePossible, true);
});
test("criteria block is empty for low-stakes and lists the five criteria otherwise", () => {
  assert.equal(criminalCriteriaBlock({ high: false }), "");
  const b = criminalCriteriaBlock(classifyCriminalStakes("φυλάκιση 2 ετών, έφεση", "criminal"));
  for (const k of ["CODE ERA", "FIGURES", "REMEDIES", "SENTENCE", "LIBERTY"]) assert.match(b, new RegExp(k));
});
test("draft with a deadline figure absent from sources is rejected; sourced figure passes", () => {
  const stakes = classifyCriminalStakes("Καταδικάστηκα, ποια η προθεσμία για έφεση;", "criminal");
  const sources = [{ ref: "ΚΠΔ άρθρο 473", text: "Η προθεσμία για την έφεση είναι δέκα (10) ημέρες από..." }];
  const bad = assessCriminalDraft("Η προθεσμία για έφεση είναι 20 ημέρες.", { stakes, sources, userText: "" });
  assert.equal(bad.status, "unsourced_criminal_figure"); assert.equal(bad.publishDraft, false);
  assert.equal(assessCriminalDraft("Η προθεσμία για έφεση είναι 10 ημέρες από το ΚΠΔ άρθρο 473.", { stakes, sources, userText: "" }), null);
});
test("pre-2019 act requires the code-era caveat", () => {
  const stakes = classifyCriminalStakes("Το αδίκημα τελέστηκε το 2017 και ρωτώ για την ποινή", "criminal");
  assert.equal(assessCriminalDraft("Η ποινή είναι όσο λέει ο ΠΚ.", { stakes }).status, "criminal_code_era_unaddressed");
  assert.equal(assessCriminalDraft("Για πράξη πριν την 1.7.2019 μπορεί να ισχύει το ευμενέστερο παλαιό κείμενο, που δεν υπάρχει στις πηγές.", { stakes }), null);
});
test("ανακοπή must name its procedure", () => {
  const userText = "Μετά την καταδίκη μου ποια η προθεσμία ανακοπής;";
  const stakes = classifyCriminalStakes(userText, "criminal");
  assert.equal(assessCriminalDraft("Μπορείτε να ασκήσετε ανακοπή.", { stakes, userText }).status, "remedy_procedure_unspecified");
  assert.equal(assessCriminalDraft("Η ανακοπή ανήκει στην πολιτική εκτέλεση του ΚΠολΔ, όχι στην ποινική δίκη.", { stakes, userText }), null);
});
test("non-criminal or low-stakes requests are never gated", () => {
  assert.equal(assessCriminalDraft("20 ημέρες", { stakes: { high: false } }), null);
});

const text = (d) => `Πηγή: https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=X&apof=1_2018\nΗμερομηνία δημοσίευσης απόφασης: ${d}\n` + "Ο λόγος αναίρεσης απορρίπτεται. ".repeat(10);
const cand = (d) => [{ ref: "ΑΠ 1/2018", url: "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=X&apof=1_2018", publishedAt: d, snippets: [text(d)] }];
const item = { ref: "ΑΠ 1/2018", position: "supports", quote: "Ο λόγος αναίρεσης απορρίπτεται. Ο λόγος αναίρεσης", holding: "Απορρίπτεται ο λόγος αναίρεσης.", comparison: "Παρόμοιο στάδιο αναίρεσης.", limitation: "Όριο της κρίσης." };
test("criminal pre-2019 decision cannot directly support; limits are appended", () => {
  const r = verifyCaseLawFindings({ items: [item] }, cand("2018-05-10"), "el", "ποινή", "criminal");
  assert.equal(r.findings[0].position, "distinguishable");
  assert.match(r.findings[0].limitation, /1\.7\.2019/);
});
test("criminal post-2019 decision keeps position but still carries the cassation limit", () => {
  const r = verifyCaseLawFindings({ items: [item] }, cand("2021-05-10"), "el", "ποινή", "criminal");
  assert.equal(r.findings[0].position, "supports");
  assert.match(r.findings[0].limitation, /αναίρεση ελέγχει/);
  assert.equal(criminalDecisionLimit("2021-05-10").old, false);
});

import fs from "node:fs";
test("server wires the criminal criteria into prompt, review requirement and draft gate", () => {
  const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(server, /criminalCriteriaBlock\(criminal\)/);
  assert.match(server, /criminal\.high \|\|/);
  assert.match(server, /assessCriminalDraft\(analysis, \{ stakes: criminal/);
  assert.match(fs.readFileSync(new URL("../caseLawResearch.js", import.meta.url), "utf8"), /candidates, lang, query, area\)/);
});
test("criminal eval suite is well-formed", () => {
  const suite = JSON.parse(fs.readFileSync(new URL("../evals/criminal.json", import.meta.url), "utf8"));
  assert.ok(suite.cases.length >= 4 && suite.cases.every((c) => c.id && c.question && c.why));
});

test("figure check tolerates column-interleaved PDF text but still rejects a number that is absent", () => {
  const stakes = classifyCriminalStakes("Καταδικάστηκα, ποια η προθεσμία για έφεση;", "criminal");
  const garbled = [{ ref: "ΚΠΔ 473", text: "Όπου ειδική διάταξη νόμου δεν ορίζει διαφορετικά, η\nχειρότερη η θέση του ούτε να ανακληθούν τα προθεσμία για την άσκηση ενδίκων μέσων είναι δέκα (10)\nευεργετήματα που δόθηκαν με την απόφαση που ημέρες από τη δημοσίευση της απόφασης." }];
  assert.equal(assessCriminalDraft("Η προθεσμία για έφεση είναι 10 ημέρες.", { stakes, sources: garbled }), null);
  assert.equal(assessCriminalDraft("Η προθεσμία για έφεση είναι 5 ημέρες.", { stakes, sources: garbled }).status, "unsourced_criminal_figure");
});

test("citing the ΚΠΔ for another remedy does not satisfy the ανακοπή procedure check", () => {
  const userText = "Μετά την καταδίκη ποια η προθεσμία έφεσης και ανακοπής;";
  const stakes = classifyCriminalStakes(userText, "criminal");
  assert.equal(assessCriminalDraft("Η έφεση ασκείται κατά το ΚΠΔ. Μπορείτε επίσης να ασκήσετε ανακοπή.", { stakes, userText }).status, "remedy_procedure_unspecified");
  assert.equal(assessCriminalDraft("Η έφεση ασκείται κατά το ΚΠΔ. Η ανακοπή ανήκει στην πολιτική εκτέλεση του ΚΠολΔ.", { stakes, userText }), null);
});
