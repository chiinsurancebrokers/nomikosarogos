// criminalStakes.js — deterministic criteria for HIGH-STAKES criminal questions.
//
// Categories: sentence (ποινή, αναστολή, μετατροπή, απόλυση υπό όρο), remedy (ένδικα μέσα,
// ανακοπές/ενστάσεις, προθεσμίες), detention (σύλληψη, προφυλάκιση), limitation (παραγραφή).
// The criteria do not decide law; they (1) tell the model what it must show and (2) reject drafts
// that state numbers not found in the sources or ignore the Code-era problem. The knowledge base holds
// the CURRENT Ποινικός Κώδικας / ΚΠΔ (ν. 4619/2019 & 4620/2019, in force 1.7.2019, as amended), so acts
// and decisions before that date may be governed by the previous text, which the sources do not contain.

export const NEW_CODES_EFFECTIVE = "2019-07-01";

const plain = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const CRIMINAL_CONTEXT = /ποινικ|κατηγορ|καταδικ|εφετει|πλημμελ|κακουργ|πταισμ|φυλακ|προφυλακ|ποινη|ποινης|αναιρεσ|συλληψ|αυτοφωρ/;
const CATEGORY_PATTERNS = {
  sentence: /ποιν(η|ης|ες|ων)(?![α-ω])|φυλακισ|καθειρξ|χρηματικη ποιν|αναστολη (εκτελεσης|της ποινης)|μετατροπη|απολυση υπο ορο|εκτιση|εκτελεση (της )?ποινης|ποινικο μητρωο|καταδικ/,
  remedy: /εφεση|αναιρεσ|ανακοπ|ενσταση|ενδικ(ο|α) μεσ|προσφυγη|αιτηση (ανακλησης|αναστολης)|προθεσμι|εκπροθεσμ|επιδοση|κοινοποιηση/,
  detention: /προφυλακι|προσωρινη κρατηση|περιοριστικ\w* ορο|συλληψ|αυτοφωρ|κρατητηρι/,
  limitation: /παραγραφ/,
};
const OFFENCE_WORD = /τελεσ|διεπραξ|διαπραξ|πραξη|αδικημα|κατηγορι|εγκλημα|περιστατικ/;

// Years / dates that appear shortly after a word about the act itself.
export function offenceDatesBefore(text, cutoff = NEW_CODES_EFFECTIVE) {
  const t = plain(text);
  const found = [];
  const re = new RegExp(OFFENCE_WORD.source, "g");
  let m;
  while ((m = re.exec(t))) {
    const window = t.slice(m.index, m.index + 90);
    const d = /(\d{1,2})[./](\d{1,2})[./]((?:19|20)\d{2})/.exec(window);
    const y = /\b((?:19|20)\d{2})\b/.exec(window);
    const iso = d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : y ? `${y[1]}-12-31` : null;
    if (iso && iso < cutoff) found.push(d ? `${d[1]}.${d[2]}.${d[3]}` : y[1]);
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

const UNIT_STEM = { ημερ: "ημερ", μην: "μην", ετ: "ετ", ωρ: "ωρ" };
function unsourcedFigures(analysis, allowed) {
  const bad = [];
  const re = /(\d{1,3})\s*(ημερ|μην|ετ|ωρ)\w*/g;
  const t = plain(analysis);
  let m;
  while ((m = re.exec(t))) {
    const sentence = t.slice(Math.max(0, m.index - 140), m.index + 80);
    if (!/προθεσμ|εντος|ποιν|φυλακ|παραγραφ|αναστολ|διαστημ|καθειρξ|εφεση|αναιρεσ|χρονικ/.test(sentence)) continue;
    const check = new RegExp(`\\b${m[1]}\\)?\\s*${UNIT_STEM[m[2]]}`);
    if (!check.test(allowed)) bad.push(`${m[1]} ${m[2] === "ετ" ? "έτη" : m[2] === "μην" ? "μήνες" : m[2] === "ωρ" ? "ώρες" : "ημέρες"}`);
  }
  return [...new Set(bad)];
}

const ERA_MENTION = /ευμενεστερ|επιεικεστερ|αρθρο 2(?![0-9]).{0,6}πκ|παλαι(ο|ου|ος|α)(?![α-ω])|προηγουμεν\w* (κωδικ|κειμεν|διαταξ)|1\.? ?7\.? ?2019|1 ιουλιου 2019|4619|4620/;
const PROCEDURE_NAMED = /κπολδ|κωδικα πολιτικης δικονομιας|πολιτικη δικονομια|εκτελεστικη διαδικασια|κεδε|ποινικη δικονομια|κπδ|ποινικη δικη/;

export function assessCriminalDraft(analysis, { stakes, sources = [], userText = "" } = {}) {
  if (!stakes?.high) return null;
  const text = plain(analysis);
  const allowed = plain(sources.map((s) => s.text).join("\n") + "\n" + userText);
  const bad = unsourcedFigures(analysis, allowed);
  if (bad.length) {
    return {
      status: "unsourced_criminal_figure", publishDraft: false,
      message: `Η απάντηση απορρίφθηκε: αναφέρει αριθμούς (${bad.join(", ")}) για προθεσμίες ή ποινές που δεν υπάρχουν στις πηγές ή στα στοιχεία της ερώτησης. Σε ποινικά ζητήματα υψηλού ρίσκου δεν επιτρέπονται αριθμοί από μνήμη. Ελέγξτε το κείμενο του Κώδικα και συμβουλευτείτε δικηγόρο.`,
    };
  }
  if (stakes.oldCodePossible && !ERA_MENTION.test(text)) {
    return {
      status: "criminal_code_era_unaddressed", publishDraft: false,
      message: "Η απάντηση απορρίφθηκε: η πράξη φαίνεται να τελέστηκε πριν την 1.7.2019 και η απάντηση δεν εξηγεί ότι μπορεί να εφαρμόζεται το προηγούμενο ή το ευμενέστερο κείμενο, το οποίο δεν υπάρχει στις πηγές. Χρειάζεται έλεγχος από δικηγόρο.",
    };
  }
  if (/ανακοπ/.test(plain(userText)) && /ανακοπ/.test(text) && !PROCEDURE_NAMED.test(text)) {
    return {
      status: "remedy_procedure_unspecified", publishDraft: false,
      message: "Η απάντηση απορρίφθηκε: αναφέρεται σε ανακοπή χωρίς να διευκρινίζει σε ποια διαδικασία ανήκει (πολιτική εκτέλεση ή ποινική δίκη). Η προθεσμία και οι κανόνες διαφέρουν. Διευκρινίστε ποια πράξη προσβάλλεται.",
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
