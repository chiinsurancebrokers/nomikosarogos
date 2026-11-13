// Court provenance agents: pure deterministic checks, independent of an LLM.
// A verified text source and date still do NOT mean certified official copies.
// The Supreme Court's online text is informative, anonymised and may contain errors.
// Respect official terms: preserve the decision's meaning, cite source + date,
// and do not reproduce the website's headnotes, indexes or submitted summaries.

const MONTHS = {
  ιανουαριου: 1, φεβρουαριου: 2, μαρτιου: 3, απριλιου: 4,
  μαιου: 5, ιουνιου: 6, ιουλιου: 7, αυγουστου: 8,
  σεπτεμβριου: 9, οκτωβριου: 10, νοεμβριου: 11, δεκεμβριου: 12,
};

export const COURT_NOTICE_EL =
  "Πηγή: Άρειος Πάγος (areiospagos.gr). Το δημοσιευμένο, ανωνυμοποιημένο κείμενο έχει πληροφοριακό χαρακτήρα και δεν αποτελεί νόμιμο και ακριβές αντίγραφο. Απαγορεύεται η αλλοίωση ή διαστρέβλωσή του. Δεν αναδημοσιεύονται η λημματογράφηση, η ευρετηρίαση ή οι περιλήψεις της ιστοσελίδας.";

const normalized = (s) => String(s || "").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase();

function validDate(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
  return [y, m, d].map((n, i) => String(n).padStart(i === 0 ? 4 : 2, "0")).join("-");
}

// Only the date AFTER the final "ΔΗΜΟΣΙΕΥΘΗΚΕ" clause is the decision publication date.
// Never use "ΚΡΙΘΗΚΕ" (deliberation) or HTTP last-modified as publication.
export function publicationDateAgent(fullText) {
  const t = normalized(fullText);
  const re = /δημοσιευθ[ηε]κε|δημοσιευτηκε/gu;
  const markers = [...t.matchAll(re)];
  if (!markers.length) return { status: "missing_publication_clause", publishedAt: null };
  const from = t.slice(markers[markers.length - 1].index).slice(0, 900);
  // Prioritize the final explicit date in the publication clause.
  const greek = [...from.matchAll(/(?:στις?|την)\s+(\d{1,2})\s+(ιανουαριου|φεβρουαριου|μαρτιου|απριλιου|μαιου|ιουνιου|ιουλιου|αυγουστου|σεπτεμβριου|οκτωβριου|νοεμβριου|δεκεμβριου)\s+(\d{4})/gu)];
  const numeric = [...from.matchAll(/(?:στις?|την)\s+(\d{1,2})[./-](\d{1,2})[./-](\d{4})/gu)];
  let date = null;
  if (greek.length) {
    const g = greek[greek.length - 1];
    date = validDate(Number(g[3]), MONTHS[g[2]], Number(g[1]));
  } else if (numeric.length) {
    const n = numeric[numeric.length - 1];
    date = validDate(Number(n[3]), Number(n[2]), Number(n[1]));
  }
  return date
    ? { status: "publication_date_extracted", publishedAt: date }
    : { status: "publication_date_not_parsed", publishedAt: null };
}

// Do not index court-created abstracts or taxonomy from the search-result page.
// The decision body starts at the document's own "Αριθμός N/YYYY" heading.
export function decisionBodyAgent(fullText, ref) {
  const t = String(fullText || "").normalize("NFC");
  const m = /^ΑΠ\s+(\d{1,5})\/(\d{4})$/u.exec(String(ref || ""));
  if (!m) throw new Error("Invalid decision reference");
  const re = /(?:^|\n)\s*Αριθμός\s+0*(\d{1,5})\s*\/\s*(\d{4})\b/giu;
  const matches = [...t.matchAll(re)];
  const start = matches.find((x) => Number(x[1]) === Number(m[1]) && x[2] === m[2]);
  if (!start) throw new Error("No matching decision-body heading; refuse indexing page abstracts");
  const text = t.slice(start.index).trim();
  if (!/σκεφθ[ηή]κε|σκεφθηκε|για\s+τους\s+λογους\s+αυτους/iu.test(text))
    throw new Error("The content does not resemble full judicial reasoning");
  return text;
}

export function provenanceAgent({ url, publishedAt, decisionRef }) {
  if (!/^https:\/\/(?:www\.)?areiospagos\.gr\/nomologia\/apofaseis_DISPLAY\.asp\?/i.test(String(url || "")))
    throw new Error("Missing official source URL");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(publishedAt || "")))
    throw new Error("No verified publication date; indexing blocked");
  if (!/^ΑΠ \d{1,5}\/\d{4}$/.test(String(decisionRef || "")))
    throw new Error("Missing case reference");
  return {
    url, publishedAt, decisionRef, publisher: "Άρειος Πάγος",
    notice: COURT_NOTICE_EL,
    sourceType: "informational_anonymised_decision_text",
  };
}
