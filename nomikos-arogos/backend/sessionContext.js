// Ephemeral per-request context. No documents or case facts are persisted server-side.
import { determineInheritanceLaw, parseGreekDate } from "./temporalLaw.js";

const DEATH_QUESTION = /ημερομηνία θανάτου|date of death|when did.{0,35}die/i;
const BARE_DATE = /^\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\s+(?:οκτωβρίου|october|σεπτεμβρίου|september)\s+\d{4})\s*[.!]?\s*$/iu;
const DEATH_LABEL = /θανάτ|απεβίω|πέθαν|αποβίω|date of death|deceased/i;

export function contextualizeDeathReplies(history = []) {
  return history.map((m, i) => {
    if (m.role !== "user") return m;
    const match = BARE_DATE.exec(String(m.content || ""));
    if (!match || !parseGreekDate(match[1])) return m;
    const previous = history[i - 1];
    if (previous?.role !== "assistant" || !DEATH_QUESTION.test(previous.content || "")) return m;
    return { ...m, content: "Ημερομηνία θανάτου του κληρονομουμένου: " + match[1] };
  });
}

export function sanitizeSessionFacts(raw) {
  if (!raw || typeof raw !== "object") return null;
  // Retain only date labels and dates; never forward full document text, names or IDs.
  const dates = Array.isArray(raw.dates) ? raw.dates.slice(0, 8).flatMap(d => {
    const label = String(d?.label || "").slice(0, 80);
    const date = parseGreekDate(String(d?.date || ""));
    return DEATH_LABEL.test(label) && date
      ? [{ label: "Ημερομηνία θανάτου κληρονομουμένου", date }] : [];
  }) : [];
  return dates.length ? { dates } : null;
}

export function mergeSessionFacts(previous, current) {
  const a = sanitizeSessionFacts(previous)?.dates || [];
  const b = sanitizeSessionFacts(current)?.dates || [];
  const dates = [...a, ...b].filter((d, i, all) =>
    all.findIndex(x => x.label === d.label && x.date === d.date) === i);
  return dates.length ? { dates } : null;
}

export function inheritancePreflight(history, facts) {
  const contextual = contextualizeDeathReplies(history);
  const userText = contextual.filter(m => m.role === "user").map(m => m.content).join("\n");
  const temporal = determineInheritanceLaw({ question: userText, docFacts: facts });
  return { history: contextual, userText, temporal, skipIntake: temporal.status !== "not_applicable" };
}
