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

test("English criminal questions and unaccented Greek receive the same categories", () => {
  for (const question of ["What prison sentence applies?", "I was convicted; may I appeal?", "Με συνελαβαν. Ποιοι περιοριστικοι οροι ισχυουν;"]) {
    assert.equal(classifyCriminalStakes(question).high, true, question);
  }
  assert.ok(classifyCriminalStakes("I was arrested").categories.includes("detention"));
  assert.equal(classifyCriminalStakes("What is the rent deadline?", "civil").high, false);
});

test("offence dates support ISO, hyphens, written months and the exact cut-off", () => {
  for (const date of ["2019-06-30", "30-06-2019", "30.6.2019", "30 Ιουνίου 2019", "30 June 2019"]) {
    assert.deepEqual(offenceDatesBefore(`Η πράξη τελέστηκε στις ${date}`), ["30.6.2019"], date);
  }
  assert.deepEqual(offenceDatesBefore("On 2018-03-12, committed the offence"), ["12.3.2018"]);
  for (const date of ["2019-07-01", "01-07-2019", "31/02/2018", "2018-13-12"]) {
    assert.deepEqual(offenceDatesBefore(`Η πράξη έγινε στις ${date}`), [], date);
  }
});

test("year-only 2019 remains possibly old without borrowing dates from the next sentence", () => {
  assert.deepEqual(offenceDatesBefore("Η πράξη έγινε το 2019"), ["2019"]);
  assert.deepEqual(offenceDatesBefore("Η πράξη έγινε το 2020"), []);
  assert.deepEqual(offenceDatesBefore("Η πράξη δεν έχει ημερομηνία. Γεννήθηκα το 2017."), []);
});

const penaltyStakes = classifyCriminalStakes("What prison sentence applies?", "criminal");
test("unsupported durations cannot bypass the gate through spelling, units, ranges or markup", () => {
  for (const answer of [
    "Η ποινή είναι 20 χρόνια.", "Η ποινή είναι είκοσι έτη.", "The sentence is twenty-five years.",
    "Η προθεσμία είναι **20** ημέρες.", "The deadline is 20 days.", "The sentence is 2.5 years.",
    "Η ποινή είναι 2,5 έτη.", "Η προθεσμία είναι είκοσι πέντε ημέρες.",
    "Η ποινή είναι 1000 έτη.", "Η προθεσμία είναι τριών μηνών.", "Η ποινή είναι ενός έτους.",
  ]) assert.equal(assessCriminalDraft(answer, { stakes: penaltyStakes })?.status, "unsourced_criminal_figure", answer);
  const sources = [{ text: "Η ανώτατη ποινή είναι 10 έτη." }];
  for (const answer of ["Η ποινή είναι 5–10 έτη.", "The sentence is 5 to 10 years.", "Η ποινή είναι 20-5 έτη."]) {
    assert.equal(assessCriminalDraft(answer, { stakes: penaltyStakes, sources })?.publishDraft, false, answer);
  }
});

test("source figures match exact amounts and equivalent duration units across languages", () => {
  const sources = [{ text: "Η προθεσμία είναι δέκα (10) ημέρες. Η ποινή είναι δύο έτη. Ή είκοσι πέντε μήνες." }];
  for (const answer of ["The deadline is ten days.", "The sentence is 2 years.", "Η ποινή είναι 25 μήνες."]) {
    assert.equal(assessCriminalDraft(answer, { stakes: penaltyStakes, sources }), null, answer);
  }
  assert.equal(assessCriminalDraft("The sentence is 2.5 years.", { stakes: penaltyStakes, sources })?.publishDraft, false);
  assert.equal(assessCriminalDraft("Η ποινή είναι 2 έτη.", { stakes: penaltyStakes, sources: [{ text: "12 έτη" }] })?.publishDraft, false);
});

test("duration units cannot be borrowed from another source or user facts", () => {
  const sources = [{ text: "Άρθρο 20" }, { text: "Προθεσμία δέκα ημερών" }];
  assert.equal(assessCriminalDraft("Η προθεσμία είναι 20 ημέρες.", { stakes: penaltyStakes, sources })?.publishDraft, false);
  assert.equal(assessCriminalDraft("Η προθεσμία είναι 20 ημέρες.", {
    stakes: penaltyStakes, sources: [{ text: "Άρθρο 20" }], userText: "Η προθεσμία μετριέται σε ημέρες.",
  })?.publishDraft, false);
  assert.equal(assessCriminalDraft("Η ποινή είναι 2 έτη.", {
    stakes: penaltyStakes, userText: "Καταδικάστηκα σε δύο χρόνια.",
  }), null);
});

test("mentioning only a Code number or the cut-off does not address the old-law issue", () => {
  const stakes = classifyCriminalStakes("Η πράξη έγινε το 2017. Ποια είναι η ποινή;", "criminal");
  for (const answer of ["Εφαρμόζεται ο ν. 4619/2019.", "Ο Κώδικας ισχύει από 1.7.2019."]) {
    assert.equal(assessCriminalDraft(answer, { stakes })?.status, "criminal_code_era_unaddressed");
  }
  assert.equal(assessCriminalDraft("The previous Code and more favourable law may apply.", { stakes }), null);
});

test("an unsolicited anakopi also requires a procedure and rejection messages respect English", () => {
  const result = assessCriminalDraft("You can file an anakopi.", { stakes: penaltyStakes, lang: "en" });
  assert.equal(result.status, "remedy_procedure_unspecified");
  assert.match(result.message, /procedure/);
  assert.equal(assessCriminalDraft("An anakopi in civil enforcement requires checking the file.", { stakes: penaltyStakes }), null);
  assert.match(assessCriminalDraft("20 days", { stakes: penaltyStakes, lang: "en" }).message, /unsupported/);
});

test("criminal findings retain both mandatory limits and the specific counter-reading in both languages", () => {
  for (const lang of ["el", "en"]) for (const date of ["2018-05-10", "2021-05-10"]) {
    const result = verifyCaseLawFindings({ items: [item] }, cand(date), lang, "ποινή", "criminal");
    const limitation = result.findings[0].limitation;
    assert.ok(limitation.includes(criminalDecisionLimit(date, lang).text.trim()));
    assert.ok(limitation.endsWith(item.limitation));
  }
  assert.equal(verifyCaseLawFindings({ items: [{ ...item, limitation: "          " }] }, cand("2021-05-10"), "el", "ποινή", "criminal").findings.length, 0);
});

test("sentence fractions need exact support without treating dates as fractions", () => {
  assert.equal(assessCriminalDraft("Απόλυση αφού εκτιθούν τα 2/5 της ποινής.", { stakes: penaltyStakes })?.publishDraft, false);
  assert.equal(assessCriminalDraft("Απόλυση στα 2 / 5 της ποινής.", { stakes: penaltyStakes, sources: [{ text: "όταν εκτιθούν τα 2/5 της ποινής" }] }), null);
  assert.equal(assessCriminalDraft("Απόλυση στα 2/5 της ποινής.", { stakes: penaltyStakes, sources: [{ text: "12/5" }] })?.publishDraft, false);
  assert.equal(assessCriminalDraft("Η πράξη έγινε στις 07/10/2025.", { stakes: penaltyStakes }), null);
});
