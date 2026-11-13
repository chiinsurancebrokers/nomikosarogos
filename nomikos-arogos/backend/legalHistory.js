// Version-aware legal selection. Never equate publication date with effective date.
// An approved rule AND an approved, hash-matched historical text are required.
// No rule is automatically inferred by an LLM.
import { createHash } from "node:crypto";
import { parseGreekDate } from "./temporalLaw.js";

const norm = (s) => String(s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase();
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_LABELS = Object.freeze({
  death: /θανατ|απεβιω|αποβιω|πεθαν|death|deceas|died/gu,
  offence: /τελεσ[ηθ]|διαπραξ[ηι]|πραξη.{0,14}τελεσ|αδικημα.{0,14}τελεσ|offen[cs]e.{0,14}(?:committ|date)|date of offence/gu,
  contract: /καταρτισ[ηθ]|συναψ[ηθ]|υπογραφ.{0,18}συμβασ|contract.{0,16}(?:signed|concluded)/gu,
  filing: /καταθεσ[ηθ]|κατατεθ|filed|filing date/gu,
  service: /επιδοσ[ηθ]|επιδoθ|served|service of process/gu,
  act: /ημερομηνια.{0,14}πραξ|ενεργει.{0,15}στις|date of act/gu,
});
const VALID_EVENTS = new Set(Object.keys(EVENT_LABELS));
const validISO = (d) => {
  if (!DAY.test(String(d || ""))) return false;
  const dt = new Date(d + "T00:00:00Z");
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === d;
};
const verifiedHash = (text, expected) =>
  /^[a-f0-9]{64}$/.test(String(expected || "")) &&
  createHash("sha256").update(String(text || ""), "utf8").digest("hex") === expected;

export function officialLegalUrl(input) {
  let u;
  try { u = new URL(input); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  const domains = [
    "et.gr", "gov.gr", "aade.gr", "ministryofjustice.gr",
    "hellenicparliament.gr", "areiospagos.gr",
  ];
  return domains.some((d) => host === d || host.endsWith("." + d));
}

// Recovers only dates explicitly adjacent to the event; a filing date cannot
// accidentally become the date of death. Ambiguity is a first-class result.
export function eventDates(eventType, { question = "", docFacts = null } = {}) {
  const re = EVENT_LABELS[eventType];
  if (!re) return [];
  const dates = [];
  const scan = (value) => {
    const t = norm(value);
    const pattern = new RegExp(re.source, "gu");
    for (const match of t.matchAll(pattern)) {
      const fragment = t.slice(match.index + match[0].length, match.index + match[0].length + 66);
      const date = parseGreekDate(fragment);
      if (date) dates.push(date);
    }
  };
  scan(question);
  if (docFacts) {
    for (const d of docFacts.dates || []) {
      const label = norm(d.label || "");
      if (new RegExp(re.source, "u").test(label)) {
        const date = parseGreekDate(d.date);
        if (date) dates.push(date);
      }
    }
    scan(docFacts.summary);
    for (const item of docFacts.keyFacts || []) scan(item);
  }
  return [...new Set(dates)];
}

export function selectHistoricalVersion({ question = "", docFacts = null, area = "unsure",
  rules = [], versions = [] } = {}) {
  const context = norm([question, docFacts?.summary, ...(docFacts?.searchTerms || [])].join(" "));
  const matching = rules.filter((r) =>
    r.review_status === "approved" &&
    (area === "unsure" || r.area === area) &&
    VALID_EVENTS.has(r.event_type) &&
    officialLegalUrl(r.source_url) &&
    Array.isArray(r.match_terms) &&
    r.match_terms.some((term) => norm(term).length >= 5 && context.includes(norm(term)))
  );
  if (!matching.length) return { status: "not_covered" };
  if (matching.length !== 1) return { status: "ambiguous_topic", topics: matching.map((r) => r.topic) };
  const rule = matching[0];
  const found = eventDates(rule.event_type, { question, docFacts });
  if (!found.length) return { status: "date_required", topic: rule.topic, eventType: rule.event_type };
  if (found.length > 1) return { status: "date_conflict", topic: rule.topic, eventType: rule.event_type, dates: found };
  const eventDate = found[0];
  if (rule.has_exceptions) return {
    status: "exception_review", topic: rule.topic, eventType: rule.event_type,
    eventDate, reason: "The approved rule explicitly identifies a transitional-law exception.",
  };
  const candidates = versions.filter((v) =>
    v.rule_id === rule.rule_id &&
    v.review_status === "approved" &&
    officialLegalUrl(v.source_url) &&
    validISO(v.published_at) &&
    validISO(v.applicable_from) &&
    (!v.applicable_until || validISO(v.applicable_until)) &&
    (!v.applicable_until || v.applicable_from < v.applicable_until) &&
    eventDate >= v.applicable_from &&
    (!v.applicable_until || eventDate < v.applicable_until) &&
    verifiedHash(v.body_text, v.body_sha256) &&
    // A retroactive period can be valid, but only if a verified transition
    // source and explicit reviewer flag document the retroactive application.
    (v.applicable_from >= v.published_at ||
      (v.retroactive === true && officialLegalUrl(v.retroactivity_source_url)))
  );
  if (candidates.length !== 1) return {
    status: candidates.length > 1 ? "overlapping_versions" : "version_missing",
    topic: rule.topic, eventType: rule.event_type, eventDate,
  };
  const selected = candidates[0];
  return {
    status: "selected", topic: rule.topic, eventType: rule.event_type, eventDate,
    sourceRule: { ref: rule.source_ref, url: rule.source_url },
    version: {
      ref: selected.citation, codeName: selected.code_name,
      article: selected.article, sourceUrl: selected.source_url,
      sourceRef: selected.source_ref, publishedAt: selected.published_at,
      applicableFrom: selected.applicable_from, applicableUntil: selected.applicable_until || null,
      text: selected.body_text,
    },
    competingRefs: [...new Set(versions.filter((v) => v.rule_id === rule.rule_id)
      .map((v) => v.code_name + " άρθρο " + v.article))],
  };
}

export function guardHistoricalSources(sources = [], selection = {}) {
  if (selection.status !== "selected") return { sources, excluded: 0 };
  const protectedRefs = new Set(selection.competingRefs.map(norm));
  const keep = sources.filter((s) => !protectedRefs.has(norm(s.ref)));
  return {
    sources: [{
      ref: selection.version.ref, anchored: true,
      text: "Επίσημη πηγή: " + selection.version.sourceUrl +
        "\nΔημοσίευση: " + selection.version.publishedAt +
        "\nΕφαρμοστέο από: " + selection.version.applicableFrom +
        (selection.version.applicableUntil ? "\nΕφαρμοστέο έως (μη συμπεριλαμβανομένη): " + selection.version.applicableUntil : "") +
        "\n" + selection.version.text,
    }, ...keep],
    excluded: sources.length - keep.length,
  };
}

export function historyStatusMessage(state, lang = "el") {
  const en = lang === "en";
  const messages = {
    date_required: en ? "The legally relevant event date is missing. It must be established before selecting the law." :
      "Λείπει η ημερομηνία του κρίσιμου γεγονότος. Δεν μπορεί να επιλεγεί με ασφάλεια η ιστορική διάταξη.",
    date_conflict: en ? "Conflicting dates were found for the legally relevant event." :
      "Εντοπίστηκαν αντικρουόμενες ημερομηνίες για το κρίσιμο νομικό γεγονός.",
    version_missing: en ? "No individually reviewed legal text covers that date in the historical library." :
      "Δεν υπάρχει επαληθευμένη ιστορική έκδοση που να καλύπτει την ημερομηνία στη νομική βιβλιοθήκη.",
    overlapping_versions: en ? "More than one approved version claims the same applicability interval. Expert review is required." :
      "Περισσότερες από μία εγκεκριμένες εκδόσεις καλύπτουν το ίδιο διάστημα. Απαιτείται νομικός έλεγχος.",
    exception_review: en ? "A special transitional provision may override the general event-date rule." :
      "Ειδική μεταβατική διάταξη ενδέχεται να υπερισχύει του γενικού χρονικού κανόνα.",
    ambiguous_topic: en ? "Multiple potentially applicable transition rules matched. Legal review is required." :
      "Εντοπίστηκαν πολλαπλοί μεταβατικοί κανόνες. Χρειάζεται έλεγχος.",
  };
  return messages[state.status] || null;
}


export function assessHistoricalDraft(analysis, selection, lang = "el") {
  if (selection.status !== "selected") return null;
  // Reject vague drafts that do not name the exact verified historical
  // version. A source-only LLM review cannot independently prove currency.
  const text = norm(analysis);
  if (!text.includes(norm(selection.version.ref))) {
    return {
      status: "wrong_historical_version", publishDraft: false,
      message: lang === "en"
        ? "The draft omitted the verified historical legal text reference and was withheld."
        : "Το σχέδιο δεν αναφέρει ρητά την επιλεγμένη ιστορική διάταξη και αποκρύπτεται.",
    };
  }
  return null;
}
