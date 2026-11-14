// Independent, deterministic quality gates for citizen-facing legal information.
// An LLM's own confidence and a second LLM's verdict do NOT establish legal currency.
// Never publish a draft without retrieved sources; with mandatory verification,
// publish only if the verifier marks it fully supported by those sources.

const HIGH_STAKES_RE = /προθεσ|παραγραφ|αποποι|κληρονομ|ακυρ|αγωγ|δικαστ|δικογραφ|δικογρα|προτασε|επιδοσ|εφεσ|αναιρεσ|ανακοπ|κατασχε|πλειστηρια|συλληψ|κρατησ|φυλακι|καταδικ|ποινη|ποινης|αναστολ|μετατροπ|προφυλακ|αυτοφωρ|περιοριστικ|απολυση υπο ορο|ποινικο μητρωο|ευμενεστερ|deadline|limitation|appeal|lawsuit|inheritance|renunciation|service of process|prison|sentence|sentenced|penalty|detention|custody|arrest|bail|parole|conviction/i;

export function requiresIndependentReview(text = "", hasDocument = false) {
  return Boolean(hasDocument || HIGH_STAKES_RE.test(String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "")));
}

export function assessEvidence({ sources = [], verification = null, reviewRequested = false, citations = null, lang = "el" } = {}) {
  const en = lang === "en";
  const count = Array.isArray(sources) ? sources.length : 0;
  if (!count) {
    return {
      status: "no_sources", publishDraft: false,
      message: en
        ? "No relevant legal provisions were retrieved. I cannot offer a source-grounded analysis of this case. A lawyer should verify the applicable law and deadlines."
        : "Δεν ανακτήθηκαν σχετικές νομικές διατάξεις. Δεν μπορώ να παρουσιάσω τεκμηριωμένη ανάλυση της υπόθεσης. Χρειάζεται έλεγχος της εφαρμοστέας νομοθεσίας και των προθεσμιών από δικηγόρο.",
    };
  }
  // A citation listed inside another decision is not independent verification.
  // Neither second-hand nor absent decisions may be used in a published legal argument.
  if ((citations?.missing?.length || 0) > 0 || (citations?.secondhand?.length || 0) > 0) {
    return {
      status: "unsupported_case_law", publishDraft: false,
      message: en
        ? "The draft cites court decisions not independently retrieved and checked. I have withheld the argument rather than presenting potentially inaccurate case law."
        : "Το σχέδιο περιέχει παραπομπές σε δικαστικές αποφάσεις που δεν ανακτήθηκαν και δεν επαληθεύτηκαν αυτοτελώς. Η ανάλυση αποκρύπτεται ώστε να μην παρουσιαστεί ενδεχομένως λανθασμένη νομολογία.",
    };
  }
  if (reviewRequested && verification?.verdict !== "supported") {
    return {
      status: "review_failed", publishDraft: false,
      message: en
        ? "The independent source check did not fully support the draft. The unverified analysis is withheld. Consult the underlying primary sources and a qualified lawyer."
        : "Ο ανεξάρτητος έλεγχος πηγών δεν επιβεβαίωσε πλήρως το σχέδιο απάντησης. Η ανεπιβεβαίωτη ανάλυση δεν εμφανίζεται. Ελέγξτε τις πρωτογενείς πηγές με δικηγόρο.",
    };
  }
  if (reviewRequested) {
    return {
      status: "checked_against_retrieved_sources", publishDraft: true,
      message: en
        ? "Claims were checked against retrieved material only. This does NOT establish that the material is up to date or applicable to the event date."
        : "Οι ισχυρισμοί ελέγχθηκαν μόνο έναντι των ανακτηθεισών πηγών. Αυτό ΔΕΝ πιστοποιεί ότι οι πηγές είναι ενημερωμένες ή εφαρμόζονται στον κρίσιμο χρόνο.",
    };
  }
  return {
    status: "preliminary", publishDraft: true,
    message: en
      ? "Preliminary source-based answer; no independent citation check was run. The legal currency and applicability of the sources have not been certified."
      : "Προκαταρκτική απάντηση βάσει ανακτηθεισών πηγών, χωρίς ανεξάρτητο έλεγχο παραπομπών. Η επικαιρότητα και η χρονική εφαρμογή τους δεν έχουν πιστοποιηθεί.",
  };
}
