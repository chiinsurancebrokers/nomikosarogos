// Deterministic event-time choice for inheritance renunciation / annulment.
// Primary transition: ν. 5303/2026, άρθρο 41§1 (ΦΕΚ Α'81/22.05.2026).
// Official AADE circular O.3024/2026:
// https://www.aade.gr/egkyklioi-kai-apofaseis/o-3024-28-05-2026
// Art. 33 contains EXCEPTIONS for other succession issues; this module must not
// proclaim the general rule applies to wills, distribution, certificates, etc.

export const INHERITANCE_REFORM = Object.freeze({
  law: "ν. 5303/2026",
  sourceRef: "ν. 5303/2026 άρθρο 41 παρ. 1",
  officialUrl: "https://www.aade.gr/egkyklioi-kai-apofaseis/o-3024-28-05-2026",
  cutoff: "2026-09-16",
  formerArticle: "Αστικός Κώδικας άρθρο 1857",
  newerArticle: "Αστικός Κώδικας άρθρο 1855",
});

const months = Object.freeze({
  ιανουαριου: 1, φεβρουαριου: 2, μαρτιου: 3, απριλιου: 4,
  μαιου: 5, ιουνιου: 6, ιουλιου: 7, αυγουστου: 8,
  σεπτεμβριου: 9, οκτωβριου: 10, νοεμβριου: 11, δεκεμβριου: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});

const norm = (s) => String(s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase();

function formatDate(year, month, day) {
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return [String(y), String(m).padStart(2, "0"), String(d).padStart(2, "0")].join("-");
}

export function parseGreekDate(fragment) {
  const t = norm(fragment).trim();
  let m = /(?:^|[^\d])(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/u.exec(t);
  if (m) return formatDate(m[1], m[2], m[3]);
  m = /(?:^|[^\d])(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?!\d)/u.exec(t);
  if (m) return formatDate(m[3], m[2], m[1]);
  m = /(?:^|[^\d])(\d{1,2})\s+(ιανουαριου|φεβρουαριου|μαρτιου|απριλιου|μαιου|ιουνιου|ιουλιου|αυγουστου|σεπτεμβριου|οκτωβριου|νοεμβριου|δεκεμβριου|january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})(?!\d)/u.exec(t);
  return m ? formatDate(m[3], months[m[2]], m[1]) : null;
}

const DEATH_LABEL = /θανατ|απεβιω|αποβιω|αποθαν|αποβιωσ|deceas|died|date of death|death date/u;
const RENO = /αποποι|ακυρωσ[ηι].{0,30}(?:κληρονομ|αποποι)|renunciat|disclaim|annul.{0,30}inherit/u;
const SUCCESSION = /κληρονομ|κληρονομικ|αποποι|inherit|succession|renunciat|disclaim/u;
// The scope matters. These questions need Art.33 exceptions to the general Art.41 rule.
const SPECIAL = /διανομ|κληρονομητηρ|εκτελεστ.{0,15}διαθηκ|ιδιογραφ.{0,15}διαθηκ|απογραφ|distribution of estate|inheritance certificate/u;

export function extractDeathDates({ question = "", docFacts = null } = {}) {
  const matches = [];
  const scan = (value, source) => {
    const text = norm(value);
    const re = new RegExp(DEATH_LABEL.source, "gu");
    for (const m of text.matchAll(re)) {
      // Only a date close to a DEATH label. Do not confuse the date of disclaimer,
      // lawsuit filing, service or hearing with the date of death.
      const following = text.slice(m.index + m[0].length, m.index + m[0].length + 56);
      const leading = text.slice(Math.max(0, m.index - 40), m.index);
      const date = parseGreekDate(following) || parseGreekDate(leading);
      if (date) matches.push({ date, source });
    }
  };
  scan(question, "question");
  if (docFacts) {
    for (const d of docFacts.dates || []) {
      if (DEATH_LABEL.test(norm(d.label))) {
        const date = parseGreekDate(d.date);
        if (date) matches.push({ date, source: "document_facts" });
      }
    }
    scan(docFacts.summary, "document_summary");
    // Key facts can mention dates without a structured dates[] entry.
    for (const item of docFacts.keyFacts || []) scan(item, "document_fact");
  }
  const unique = [...new Set(matches.map((x) => x.date))];
  return { dates: unique, evidence: matches };
}

export function determineInheritanceLaw({ question = "", docFacts = null } = {}) {
  const context = norm([question, docFacts?.summary, ...(docFacts?.searchTerms || [])].join(" "));
  if (!SUCCESSION.test(context)) return { status: "not_applicable" };
  const issue = RENO.test(context) ? "renunciation_annulment" : SPECIAL.test(context) ? "special_inheritance" : "general_inheritance";
  const extracted = extractDeathDates({ question, docFacts });
  if (!extracted.dates.length) {
    return { status: "date_required", issue, message: "Δεν εντοπίστηκε αξιόπιστη ημερομηνία θανάτου.", ...extracted };
  }
  if (extracted.dates.length > 1) {
    return { status: "conflicting_death_dates", issue, message: "Εντοπίστηκαν περισσότερες από μία ημερομηνίες θανάτου.", ...extracted };
  }
  const deathDate = extracted.dates[0];
  const regime = deathDate < INHERITANCE_REFORM.cutoff ? "legacy" : "reformed";
  if (issue === "special_inheritance") {
    return { status: "special_rule_review", issue, deathDate, regime, applicableArticle: null, ...extracted };
  }
  return {
    status: regime, issue, deathDate,
    applicableArticle: issue === "renunciation_annulment"
      ? regime === "legacy" ? INHERITANCE_REFORM.formerArticle : INHERITANCE_REFORM.newerArticle
      : null,
    ...extracted,
  };
}

export const TRANSITION_SOURCE = Object.freeze({
  ref: INHERITANCE_REFORM.sourceRef,
  anchored: true,
  text: "Τα μέρη Α΄, Β΄ και Γ΄ εφαρμόζονται στις κληρονομικές σχέσεις προσώπων, των οποίων ο θάνατος επέρχεται τη 16η Σεπτεμβρίου 2026 ή μεταγενέστερα. " +
    "Πρωτογενής αναφορά: ν. 5303/2026, άρθρο 41 παρ. 1, ΦΕΚ Α΄81/22.05.2026. " +
    "Επίσημη κοινοποίηση: " + INHERITANCE_REFORM.officialUrl +
    ". Ειδικές μεταβατικές διατάξεις: άρθρο 33 ν. 5303/2026.",
});

function isRenunciationArticleSource(src, regime) {
  const content = norm(src?.text);
  const ref = norm(src?.ref);
  const number = regime === "legacy" ? "1857" : "1855";
  if (!new RegExp("(?:αστικος κωδικας|αστικου κωδικα).{0,18}αρθρο\\s+" + number + "(?!\\d)").test(ref)) return false;
  return content.includes("αμετακλητ") && content.includes("αποποι") &&
    (content.includes("πλαν") || content.includes("απατ"));
}

export function guardInheritanceSources(sources = [], temporal = {}) {
  if (!["legacy", "reformed"].includes(temporal.status)) return {
    sources, foundApplicableArticle: temporal.issue !== "renunciation_annulment", excluded: 0,
  };
  const result = [];
  let excluded = 0;
  for (const src of sources) {
    const ref = norm(src.ref);
    // The reform law must not become the substantive basis for death before cutoff.
    if (temporal.status === "legacy" && /ν\.?\s*5303\s*\/\s*2026/.test(ref) && !/αρθρο\s+(?:41|33)/.test(ref)) {
      excluded++;
      continue;
    }
    if (temporal.issue === "renunciation_annulment") {
      const wrongNumber = temporal.status === "legacy" ? "1855" : "1857";
      if (new RegExp("(?:αστικος κωδικας|αστικου κωδικα).{0,18}αρθρο\\s+" + wrongNumber + "(?!\\d)").test(ref)) {
        excluded++;
        continue;
      }
      const rightNumber = temporal.status === "legacy" ? "1857" : "1855";
      if (new RegExp("(?:αστικος κωδικας|αστικου κωδικα).{0,18}αρθρο\\s+" + rightNumber + "(?!\\d)").test(ref) &&
          !isRenunciationArticleSource(src, temporal.status)) {
        // e.g. new Article 1857 means inheritance incapacity, not renunciation.
        excluded++;
        continue;
      }
    }
    result.push(src);
  }
  if (!result.some((s) => s.ref === TRANSITION_SOURCE.ref)) result.unshift(TRANSITION_SOURCE);
  return {
    sources: result,
    foundApplicableArticle: temporal.issue !== "renunciation_annulment" ||
      result.some((s) => isRenunciationArticleSource(s, temporal.status)),
    excluded,
  };
}

export function assessTemporalDraft(analysis, temporal) {
  if (temporal.issue !== "renunciation_annulment" || !["legacy", "reformed"].includes(temporal.status)) return null;
  const text = String(analysis || "");
  const expected = temporal.status === "legacy" ? "1857" : "1855";
  const opposite = temporal.status === "legacy" ? "1855" : "1857";
  if (!new RegExp("\\b" + expected + "\\b").test(text) || new RegExp("\\b" + opposite + "\\b").test(text)) {
    return {
      status: "wrong_temporal_law", publishDraft: false,
      message: "Η απάντηση απορρίφθηκε: δεν εφάρμοσε με σαφήνεια το σωστό άρθρο ΑΚ για την ημερομηνία θανάτου.",
    };
  }
  return null;
}

export function temporalNotice(temporal, lang = "el") {
  const en = lang === "en";
  if (temporal.status === "date_required") {
    return en ? "What is the date of death of the deceased person? I need it before selecting the inheritance-law version."
      : "Ποια είναι η ημερομηνία θανάτου του κληρονομουμένου; Είναι αναγκαία πριν επιλεγεί η εφαρμοστέα εκδοχή του κληρονομικού δικαίου.";
  }
  if (temporal.status === "conflicting_death_dates") {
    return en ? "More than one death date was found. Please clarify which death the question concerns."
      : "Εντοπίστηκαν διαφορετικές ημερομηνίες θανάτου. Ποια αφορά τη συγκεκριμένη κληρονομία;";
  }
  if (temporal.status === "special_rule_review") {
    return en ? "The issue may be subject to an exception in Article 33 of Law 5303/2026. The general date-of-death rule alone is insufficient."
      : "Το ζήτημα μπορεί να υπάγεται σε ειδική μεταβατική ρύθμιση του άρθρου 33 ν. 5303/2026. Ο γενικός κανόνας ημερομηνίας θανάτου δεν επαρκεί.";
  }
  if (temporal.status === "legacy" || temporal.status === "reformed") {
    return (en ? "Death " : "Θάνατος ") + temporal.deathDate + ": " +
      (temporal.status === "legacy"
        ? (en ? "older succession regime" : "προϊσχύσαν κληρονομικό καθεστώς")
        : (en ? "reformed succession regime" : "νέο κληρονομικό καθεστώς")) +
      (temporal.applicableArticle ? " — " + temporal.applicableArticle : "") +
      ". " + INHERITANCE_REFORM.sourceRef;
  }
  return null;
}
