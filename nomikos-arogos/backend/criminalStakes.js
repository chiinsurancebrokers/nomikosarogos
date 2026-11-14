// criminalStakes.js — deterministic criteria for HIGH-STAKES criminal questions.
//
// Categories: sentence (ποινή, αναστολή, μετατροπή, απόλυση υπό όρο), remedy (ένδικα μέσα,
// ανακοπές/ενστάσεις, προθεσμίες), detention (σύλληψη, προφυλάκιση), limitation (παραγραφή).
// The criteria do not decide law; they (1) tell the model what it must show and (2) reject drafts
// that state numbers not found in the sources or ignore the Code-era problem. The knowledge base holds
// the CURRENT Ποινικός Κώδικας / ΚΠΔ (ν. 4619/2019 & 4620/2019, in force 1.7.2019, as amended), so acts
// and decisions before that date may be governed by the previous text, which the sources do not contain.

import { parseGreekDate } from "./temporalLaw.js";

export const NEW_CODES_EFFECTIVE = "2019-07-01";

const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CRIMINAL_CONTEXT = /ποινικ|κατηγορ|καταδικ|εφετει|πλημμελ|κακουργ|πταισμ|φυλακ|προφυλακ|ποινη|ποινης|αναιρεσ|συλληψ|συνελ[αη]β|αυτοφωρ|\b(?:criminal|penal|prison|sentence|sentenced|arrest(?:ed)?|detain(?:ed)?|detention|custody|bail|parole|convict(?:ed|ion)?)\b/;
const CATEGORY_PATTERNS = {
  sentence: /ποιν(η|ης|ες|ων)(?![α-ω])|φυλακισ|καθειρξ|χρηματικη ποιν|αναστολη (εκτελεσης|της ποινης)|μετατροπη|απολυση υπο ορο|εκτιση|εκτελεση (της )?ποινης|ποινικο μητρωο|καταδικ|\b(?:sentence|sentenced|imprisonment|prison|penalty|parole|conviction)\b/,
  remedy: /εφεση|αναιρεσ|ανακοπ|ενσταση|ενδικ(ο|α) μεσ|προσφυγη|αιτηση (ανακλησης|αναστολης)|προθεσμι|εκπροθεσμ|επιδοση|κοινοποιηση|\b(?:appeal|cassation|objection|remedy|remedies|deadline|time limit|service)\b/,
  detention: /προφυλακι|προσωρινη κρατηση|περιοριστικ[α-ω]* ορο|συλληψ|συνελ[αη]β|αυτοφωρ|κρατητηρι|\b(?:arrest|arrested|detention|detained|custody|bail)\b/,
  limitation: /παραγραφ|\b(?:limitation|time.barred)\b/,
};
const OFFENCE_WORD = /τελεσ|διεπραξ|διαπραξ|πραξη|αδικημα|κατηγορι|εγκλημα|περιστατικ|\b(?:act|offen[cs]e|committed|crime)\b/;
const DATE_TOKEN = /(?<!\d)(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{1,2}\s+[α-ωa-z]+\s+\d{4})(?!\d)/gu;

// A year alone is a range, not 31 December: 2019 may precede the cut-off.
// Never rescue an impossible full date by silently using its year instead.
export function offenceDatesBefore(text, cutoff = NEW_CODES_EFFECTIVE) {
  const t = plain(text);
  const found = [];
  for (const m of t.matchAll(new RegExp(OFFENCE_WORD.source, "gu"))) {
    const following = t.slice(m.index, m.index + 90).split(/[!?;\n]|\.(?=\s+[^\d])/u)[0];
    const preceding = t.slice(Math.max(0, m.index - 55), m.index);
    const leading = [...preceding.matchAll(DATE_TOKEN)].findLast(d =>
      /^[\s,]*$/u.test(preceding.slice(d.index + d[0].length)));
    const dates = [...following.matchAll(DATE_TOKEN)];
    const candidate = leading?.[0] || dates[0]?.[0];
    if (candidate) {
      const iso = parseGreekDate(candidate);
      if (iso && iso < cutoff) {
        const [year, month, day] = iso.split("-");
        found.push(`${Number(day)}.${Number(month)}.${year}`);
      }
      continue;
    }
    const year = /\b((?:19|20)\d{2})\b/u.exec(following)?.[1];
    if (year && `${year}-01-01` < cutoff) found.push(year);
  }
  return [...new Set(found)];
}

export function classifyCriminalStakes(text, area = "") {
  const t = plain(text);
  const criminal = area === "criminal" || CRIMINAL_CONTEXT.test(t);
  if (!criminal || area === "civil") return { high: false, categories: [], oldCodePossible: false, offenceDates: [] };
  const categories = Object.entries(CATEGORY_PATTERNS).filter(([, re]) => re.test(t)).map(([k]) => k);
  const offenceDates = offenceDatesBefore(text);
  return { high: categories.length > 0, categories, oldCodePossible: offenceDates.length > 0, offenceDates };
}

export function criminalCriteriaBlock(stakes) {
  if (!stakes?.high) return "";
  const lines = [
    `HIGH-STAKES CRIMINAL QUESTION (${stakes.categories.join(", ")}) — these criteria are mandatory:`,
    "1. CODE ERA. The sources contain the CURRENT Ποινικός Κώδικας and ΚΠΔ (ν. 4619/2019 and 4620/2019, in force 1.7.2019, as amended). For an act committed before 1.7.2019, or when the date is unknown, say that the previous text and the more favourable provision (ευμενέστερος νόμος, άρθρο 2 ΠΚ) may govern, that the sources do not contain the older text, and do not present today's penalty or limitation figures as certain for that person.",
    "2. FIGURES. Every number of days, months, years, hours, every penalty range and fraction must appear in the RETRIEVED SOURCES or in the user's own facts. Otherwise write that the figure is not in the available sources — never fill it from memory.",
    "3. REMEDIES, OBJECTIONS AND DEADLINES. Identify (a) which proceeding the remedy belongs to — a criminal proceeding or a civil enforcement procedure; «ανακοπή» in particular is mainly a civil-procedure remedy, so never transplant a civil deadline or rule into a criminal case (b) the stage and the decision challenged (c) the start event (publication, service or notification date). If any of these is missing, ask for it. Never say a filing is late or on time unless a source says so; mark every computed date «to be verified against the file».",
    "4. SENTENCE. Separate the sentence imposed from time served, show every arithmetic step, list ALL conditions of a measure (suspension, conversion, conditional release), and never predict the sentence or the outcome: that is for the court.",
    "5. LIBERTY AT STAKE. If the person is arrested, detained or about to be, tell them to contact a lawyer immediately; give no phone numbers or addresses that are not in the sources.",
  ];
  if (stakes.oldCodePossible) lines.push(`NOTE: the question mentions an act dated before 1.7.2019 (${stakes.offenceDates.join(", ")}). Item 1 applies.`);
  return lines.join("\n");
}

// Presence is not legal attribution. Keep each retrieved excerpt separate so a
// number at the end of one cannot borrow a unit from the next (or from user facts).
// A short forward window tolerates interleaved PDF columns after a bracketed figure.
const UNIT = "ημερ[α-ω]*|μην[α-ω]*|ετ(?:ος|ους|η|ων)|χρον(?:ος|ου|ια|ων)|ωρ[α-ω]*|days?|months?|years?|hours?";
const NUMBER_WORDS = new Map([
  ["ενα", 1], ["ενας", 1], ["μια", 1], ["ενος", 1], ["μιας", 1],
  ["δυο", 2], ["τρεις", 3], ["τρια", 3], ["τριων", 3], ["τεσσερις", 4], ["τεσσερα", 4], ["τεσσαρων", 4],
  ["πεντε", 5], ["εξι", 6], ["επτα", 7], ["εφτα", 7], ["οκτω", 8], ["οχτω", 8], ["εννεα", 9], ["εννια", 9],
  ["δεκα", 10], ["εντεκα", 11], ["δωδεκα", 12], ["δεκατρεις", 13], ["δεκατρια", 13], ["δεκατεσσερις", 14], ["δεκατεσσερα", 14],
  ["δεκαπεντε", 15], ["δεκαεξι", 16], ["δεκαεπτα", 17], ["δεκαοκτω", 18], ["δεκαεννεα", 19],
  ["εικοσι", 20], ["τριαντα", 30], ["σαραντα", 40], ["πενηντα", 50], ["εξηντα", 60], ["εβδομηντα", 70], ["ογδοντα", 80], ["ενενηντα", 90],
  ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9],
  ["ten", 10], ["eleven", 11], ["twelve", 12], ["thirteen", 13], ["fourteen", 14], ["fifteen", 15], ["sixteen", 16],
  ["seventeen", 17], ["eighteen", 18], ["nineteen", 19], ["twenty", 20], ["thirty", 30], ["forty", 40],
  ["fifty", 50], ["sixty", 60], ["seventy", 70], ["eighty", 80], ["ninety", 90],
]);
const wordPattern = [...NUMBER_WORDS.keys()].join("|");
const compoundNumber = new RegExp(`(?<!\\p{L})(${wordPattern})[ -](${wordPattern})(?!\\p{L})`, "gu");
function numericText(value) {
  return plain(value)
    .replace(compoundNumber, (whole, a, b) => {
      const tens = NUMBER_WORDS.get(a), ones = NUMBER_WORDS.get(b);
      return tens >= 20 && tens % 10 === 0 && ones < 10 ? String(tens + ones) : whole;
    })
    .replace(/[α-ωa-z]+/gu, word => String(NUMBER_WORDS.get(word) ?? word))
    .replace(/\*\*|__/gu, "");
}

function unitKey(unit) {
  if (/^(?:ημερ|day)/u.test(unit)) return "day";
  if (/^(?:μην|month)/u.test(unit)) return "month";
  if (/^(?:ωρ|hour)/u.test(unit)) return "hour";
  return "year";
}
const NUMBER = "\\d+(?:[.,]\\d+)?";
const AMOUNT = `${NUMBER}(?:\\s*(?:–|—|-|to|εως|ως)\\s*${NUMBER})?`;
function durationFigures(value) {
  const t = numericText(value);
  const re = new RegExp(`(?<![\\p{L}\\d.,/])(${AMOUNT})\\s*\\)?\\s*(${UNIT})(?!\\p{L})`, "gu");
  return [...t.matchAll(re)].flatMap(m => [...m[1].matchAll(new RegExp(NUMBER, "gu"))]
    .map(n => ({ number: String(Number(n[0].replace(",", "."))), unit: unitKey(m[2]) })));
}
function figureInSources(figure, excerpts) {
  return excerpts.some(excerpt => {
    if (durationFigures(excerpt).some(f => f.number === figure.number && f.unit === figure.unit)) return true;
    // Only bracketed PDF figures may borrow a following unit across interleaved text.
    const text = numericText(excerpt);
    const re = new RegExp(`(?<![0-9.,])${figure.number.replace(".", "[.,]")}(?![0-9.,])`, "gu");
    return [...text.matchAll(re)].some(m => {
      const before = text.slice(Math.max(0, m.index - 2), m.index);
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 260);
      if (!/\(\s*$/u.test(before) || !/^\s*\)/u.test(after)) return false;
      const unit = new RegExp(`(${UNIT})(?!\\p{L})`, "gu");
      return [...after.matchAll(unit)].some(u => unitKey(u[1]) === figure.unit);
    });
  });
}
function fractionFigures(value) {
  // Do not mistake a component of DD/MM/YYYY for a sentence fraction.
  return [...numericText(value).matchAll(/(?<![\d/])\d+\s*\/\s*\d+(?![\d/])/gu)]
    .map(m => m[0].replace(/\s+/gu, ""))
    .filter(f => {
      const denominator = Number(f.split("/")[1]);
      return denominator < 1900 || denominator > 2100; // law identifiers such as 4619/2019
    });
}
function unsourcedFigures(analysis, excerpts, lang) {
  const labels = lang === "en" ? { day: "days", month: "months", year: "years", hour: "hours" }
    : { day: "ημέρες", month: "μήνες", year: "έτη", hour: "ώρες" };
  const durations = durationFigures(analysis).filter(f => !figureInSources(f, excerpts))
    .map(f => `${f.number} ${labels[f.unit]}`);
  const fractions = fractionFigures(analysis).filter(f => !excerpts.some(s => fractionFigures(s).includes(f)));
  return [...new Set([...durations, ...fractions])];
}

const ERA_MENTION = /ευμενεστερ|επιεικεστερ|παλαι(?:ο|ου|ος|α)(?![α-ω])|προηγουμεν[α-ω]* (?:κωδικ|κειμεν|διαταξ)|more favou?rable|(?:previous|former|old) (?:code|penal|law|text)/u;
const PROCEDURE_NAMED = /κπολδ|κωδικα πολιτικης δικονομιας|πολιτικη δικονομια|εκτελεστικη διαδικασια|κεδε|ποινικη δικονομια|κπδ|ποινικη δικη|civil (?:enforcement|procedure|proceedings)|criminal (?:procedure|proceedings|trial)|code of (?:civil|criminal) procedure/u;

export function assessCriminalDraft(analysis, { stakes, sources = [], userText = "", lang = "el" } = {}) {
  if (!stakes?.high) return null;
  const text = plain(analysis);
  const allowed = [...sources.map((s) => s.text), userText];
  const bad = unsourcedFigures(analysis, allowed, lang);
  if (bad.length) {
    return {
      status: "unsourced_criminal_figure", publishDraft: false,
      message: lang === "en"
        ? `The draft contains unsupported durations or fractions (${bad.join(", ")}). Check the retrieved sources and consult a lawyer.`
        : `Η απάντηση απορρίφθηκε: αναφέρει αριθμούς (${bad.join(", ")}) για προθεσμίες ή ποινές που δεν υπάρχουν στις πηγές ή στα στοιχεία της ερώτησης. Σε ποινικά ζητήματα υψηλού ρίσκου δεν επιτρέπονται αριθμοί από μνήμη. Ελέγξτε το κείμενο του Κώδικα και συμβουλευτείτε δικηγόρο.`,
    };
  }
  if (stakes.oldCodePossible && !ERA_MENTION.test(text)) {
    return {
      status: "criminal_code_era_unaddressed", publishDraft: false,
      message: lang === "en"
        ? "The act may predate 1 July 2019. The draft does not address the previous or more favourable Code text, which is absent from the sources. Consult a lawyer."
        : "Η απάντηση απορρίφθηκε: η πράξη φαίνεται να τελέστηκε πριν την 1.7.2019 και η απάντηση δεν εξηγεί ότι μπορεί να εφαρμόζεται το προηγούμενο ή το ευμενέστερο κείμενο, το οποίο δεν υπάρχει στις πηγές. Χρειάζεται έλεγχος από δικηγόρο.",
    };
  }
  // The procedure must be named in the same sentence as the ανακοπή (citing the ΚΠΔ for another remedy is not enough).
  const anakopiSentences = text.split(/[.;·!?\n]+/).filter((x) => /ανακοπ|anakopi/.test(x));
  if (anakopiSentences.length && !anakopiSentences.every((x) => PROCEDURE_NAMED.test(x))) {
    return {
      status: "remedy_procedure_unspecified", publishDraft: false,
      message: lang === "en"
        ? "The draft mentions anakopi without identifying the civil or criminal procedure. Clarify which decision is challenged with a lawyer."
        : "Η απάντηση απορρίφθηκε: αναφέρεται σε ανακοπή χωρίς να διευκρινίζει σε ποια διαδικασία ανήκει (πολιτική εκτέλεση ή ποινική δίκη). Η προθεσμία και οι κανόνες διαφέρουν. Διευκρινίστε ποια πράξη προσβάλλεται.",
    };
  }
  return null;
}

// Case-law side: criminal Areios Pagos decisions need extra limits on how they may be used.
export function criminalDecisionLimit(publishedAt, lang = "el") {
  const old = /^\d{4}-\d{2}-\d{2}$/.test(String(publishedAt || "")) && publishedAt < NEW_CODES_EFFECTIVE;
  const base = lang === "en"
    ? "Check which Code and stage applied (a cassation ruling reviews law and reasoning, not the facts; an inadmissible ground is not a merits holding). "
    : "Ελέγξτε ποιος Κώδικας και ποιο στάδιο εφαρμόστηκε (η αναίρεση ελέγχει το δίκαιο και την αιτιολογία, όχι τα πραγματικά περιστατικά· ο απαράδεκτος λόγος δεν συνιστά κρίση επί της ουσίας). ";
  const era = lang === "en"
    ? "Published before 1.7.2019: it interprets the previous Penal Code/CCP, not the current articles. "
    : "Δημοσιεύθηκε πριν την 1.7.2019: ερμηνεύει τον προηγούμενο ΠΚ/ΚΠΔ και όχι τα σημερινά άρθρα. ";
  return { old, text: (old ? era : "") + base };
}
