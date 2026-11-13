// agents.js — small, single-purpose agents that wrap the main analysis (HAL-style).
//
//   documentAgent      reads an attached document and extracts neutral facts (no names/IDs)
//   intakeAgent        decides whether 1–3 missing facts must be asked before answering
//   sourceChecker      drops retrieved articles that are unrelated to the question
//   currencyAgent      flags when the cited provisions may have been amended by laws
//                      that are NOT in the database (only the four Codes are ingested)
//
// Every agent is best-effort: on any failure it returns a neutral result so the main
// pipeline never breaks. Agents never write to disk and never log request content.

const AGENT_MODEL =
  process.env.CLAUDE_AGENT_MODEL || process.env.CLAUDE_QUICK_MODEL || "claude-sonnet-4-6";

function parseJson(text) {
  const m = (text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function callJson(anthropic, { system, content, max_tokens = 700 }) {
  const r = await anthropic.messages.create({
    model: AGENT_MODEL,
    max_tokens,
    system,
    messages: [{ role: "user", content }],
  });
  const text = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  return parseJson(text);
}

const langName = (lang) => (lang === "en" ? "English" : "Greek");

// ── Document analyst ─────────────────────────────────────────────────────────
export async function documentAgent(anthropic, { document, lang }) {
  if (!document?.data || !document?.mediaType) return null;
  try {
    const block =
      document.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: document.data } }
        : document.mediaType.startsWith("image/")
        ? { type: "image", source: { type: "base64", media_type: document.mediaType, data: document.data } }
        : null;
    if (!block) return null;
    const out = await callJson(anthropic, {
      max_tokens: 900,
      system:
        "You read a document supplied by a citizen of Greece (court decision, summons, contract, notice, etc.) " +
        "and extract neutral facts for a legal-information tool. NEVER output personal names, ID/tax numbers, " +
        "addresses or phone numbers — refer to roles instead (e.g. 'the defendant', 'the tenant'). " +
        "Do not give legal advice. Respond with strict JSON: " +
        '{ "docType": string, "summary": string (max 3 sentences), "keyFacts": string[] (max 8), ' +
        '"dates": [{"label": string, "date": string}], "deadlines": string[], "searchTerms": string[] (Greek legal concepts, max 8) }. ' +
        `Write all values except searchTerms in ${langName(lang)}; searchTerms in Greek.`,
      content: [block, { type: "text", text: "Extract the facts." }],
    });
    if (!out) return null;
    return {
      docType: String(out.docType || "").slice(0, 120),
      summary: String(out.summary || "").slice(0, 600),
      keyFacts: Array.isArray(out.keyFacts) ? out.keyFacts.slice(0, 8).map((s) => String(s).slice(0, 240)) : [],
      dates: Array.isArray(out.dates) ? out.dates.slice(0, 8).map((d) => ({ label: String(d?.label || "").slice(0, 80), date: String(d?.date || "").slice(0, 40) })) : [],
      deadlines: Array.isArray(out.deadlines) ? out.deadlines.slice(0, 5).map((s) => String(s).slice(0, 200)) : [],
      searchTerms: Array.isArray(out.searchTerms) ? out.searchTerms.slice(0, 8).map((s) => String(s).slice(0, 60)) : [],
    };
  } catch (e) {
    console.error("documentAgent failed:", e?.message);
    return null;
  }
}

export function docFactsBlock(facts) {
  if (!facts) return "";
  const lines = [
    facts.docType && `Type: ${facts.docType}`,
    facts.summary && `Summary: ${facts.summary}`,
    ...(facts.keyFacts || []).map((f) => `- ${f}`),
    ...(facts.dates || []).map((d) => `Date — ${d.label}: ${d.date}`),
    ...(facts.deadlines || []).map((d) => `Deadline: ${d}`),
  ].filter(Boolean);
  return lines.join("\n");
}

// ── Intake agent ─────────────────────────────────────────────────────────────
// Asks only when the answer materially depends on a fact the user has not given.
export async function intakeAgent(anthropic, { history, area, lang, hasDocument }) {
  const userTurns = history.filter((m) => m.role === "user").length;
  if (hasDocument || userTurns >= 3) return { ask: false };
  try {
    const transcript = history.map((m) => `${m.role === "user" ? "USER" : "ASSISTANT"}: ${m.content}`).join("\n").slice(-6000);
    const out = await callJson(anthropic, {
      max_tokens: 400,
      system:
        "You are the intake step of a Greek legal-INFORMATION assistant (civil/criminal law). " +
        "Decide whether the answer would be materially different depending on facts the user has NOT yet given " +
        "(e.g. fixed-term vs life sentence and time already served; type of lease; whether a written contract exists). " +
        "Ask ONLY if a wrong guess would give the user wrong law; do not ask for names, ID numbers or other personal data; " +
        "never ask more than 3 questions; never ask something already answered in the conversation. " +
        "If the question is general or clear enough, do not ask. " +
        `Respond with strict JSON: {"ask": boolean, "questions": string[]} with questions written in ${langName(lang)}. ` +
        `Area hint: ${area}.`,
      content: transcript,
    });
    if (!out || !out.ask || !Array.isArray(out.questions) || !out.questions.length) return { ask: false };
    return { ask: true, questions: out.questions.slice(0, 3).map((q) => String(q).slice(0, 220)) };
  } catch (e) {
    console.error("intakeAgent failed:", e?.message);
    return { ask: false };
  }
}

export function intakeReply(questions, lang) {
  const lead =
    lang === "en"
      ? "To point you to the right provisions I need one or two details first:"
      : "Για να σας κατευθύνω στις σωστές διατάξεις χρειάζομαι πρώτα μία-δύο διευκρινίσεις:";
  return `${lead}\n\n${questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
}

// ── Source checker ───────────────────────────────────────────────────────────
// Removes retrieved articles that do not bear on the question (retrieval noise).
export async function sourceChecker(anthropic, { query, sources }) {
  if (!Array.isArray(sources) || sources.length <= 3) return { sources, dropped: 0 };
  try {
    const list = sources.map((s, i) => `[${i + 1}] ${s.ref}: ${(s.text || "").replace(/\s+/g, " ").slice(0, 280)}`).join("\n");
    const out = await callJson(anthropic, {
      max_tokens: 300,
      system:
        "You filter retrieved Greek legal provisions for relevance. Given a citizen's question and numbered provisions, " +
        "return the numbers of provisions that DIRECTLY bear on answering it (substantive rule, procedure, or remedy that applies). " +
        "Drop provisions that are only tangentially related or about a different situation. " +
        'Respond with strict JSON: {"keep": number[]}.',
      content: `QUESTION:\n${query.slice(0, 2500)}\n\nPROVISIONS:\n${list}`,
    });
    const keep = Array.isArray(out?.keep)
      ? [...new Set(out.keep.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= sources.length))]
      : [];
    // Safety net: if the filter is too aggressive, keep the original ranking.
    if (keep.length < 2) return { sources, dropped: 0 };
    // Anchored sources (the question named that institution) are never dropped: a source is
    // judged on its first 280 characters, which can look unrelated for a long article.
    sources.forEach((s, i) => { if (s.anchored && !keep.includes(i + 1)) keep.push(i + 1); });
    const kept = keep.sort((a, b) => a - b).map((n) => sources[n - 1]);
    return { sources: kept, dropped: sources.length - kept.length };
  } catch (e) {
    console.error("sourceChecker failed:", e?.message);
    return { sources, dropped: 0 };
  }
}

// ── Currency agent ───────────────────────────────────────────────────────────
// Codes whose indexed text is a consolidated version with a known date. Update this map
// whenever a Code is re-indexed from a newer consolidation. Laws passed up to that date are
// already inside the text, so the agent must not warn about them.
// Until every Code chunk carries a verified official publication/version and
// applicability date, NO Code can honestly be stamped "current through" a law.
export const CODE_CURRENT_THROUGH = {};

// Split cited source refs ("Κώδικας Ποινικής Δικονομίας άρθρο 98") into Codes with a known
// consolidation date and everything else (no known date — the only ones worth a warning).
export function splitByCurrency(refs) {
  const known = new Map();
  const unknown = [];
  for (const ref of refs) {
    const code = Object.keys(CODE_CURRENT_THROUGH).find((c) => String(ref).startsWith(c));
    if (code) known.set(code, CODE_CURRENT_THROUGH[code]);
    else unknown.push(ref);
  }
  return { current: [...known].map(([code, through]) => ({ code, through })), unknown };
}

// Static disclosure is safer than asking another model to guess newer statutes.
// Replace this notice only after trustworthy source-level version metadata exists.
export async function currencyAgent(_anthropic, { sources, lang }) {
  if (!Array.isArray(sources) || sources.length === 0) return { notice: null, current: [] };
  return {
    notice: lang === "en"
      ? "The indexed material has not been independently certified as the legally applicable version on the event date. Check the official Gazette, amendments and transitional provisions."
      : "Δεν έχει πιστοποιηθεί ότι το ευρετηριασμένο κείμενο είναι η εφαρμοστέα εκδοχή στον κρίσιμο χρόνο. Ελέγξτε ΦΕΚ, τροποποιήσεις και μεταβατικές διατάξεις.",
    current: [],
  };
}
