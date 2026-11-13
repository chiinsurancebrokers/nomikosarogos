// ─────────────────────────────────────────────────────────────────────────────
//  ΝΟΜΙΚΟΣ ΑΡΩΓΟΣ — backend
//  B2C, mission-driven AI legal-INFORMATION service for Greek civil & criminal law.
//
//  Pipeline per request:
//    1) (optional) read an uploaded document   → Claude native multimodal (NOT Roboflow)
//    2) retrieve relevant law + case law        → RAG (stub here; plug in your vector DB)
//    3) deep analysis                           → Claude (Opus 4.8 deep / Sonnet 4.6 quick)
//    4) second opinion as a VERIFIER            → OpenAI checks Claude's citations vs sources
//
//  Secrets live ONLY here (Railway env vars). The browser never sees them.
//  No uploaded document is persisted or logged (GDPR / sensitive personal data).
// ─────────────────────────────────────────────────────────────────────────────

import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { retrieveSources } from "./retrieve.js";
import { requiresIndependentReview, assessEvidence } from "./quality.js";
import { requireAuth } from "./auth.js";
import { classifyCitations } from "./citations.js";
import { buildSourceLinks } from "./sourceLinks.js";
import { adminDecisions } from "./adminDecisions.js";
import { researchCaseLaw } from "./caseLawResearch.js";
import { determineInheritanceLaw, guardInheritanceSources, assessTemporalDraft, temporalNotice, INHERITANCE_REFORM } from "./temporalLaw.js";
import { fetchInheritanceArticle } from "./applicableLawSource.js";
import { inheritancePreflight, mergeSessionFacts, sanitizeSessionFacts } from "./sessionContext.js";
import { selectHistoricalVersion, guardHistoricalSources, historyStatusMessage, assessHistoricalDraft } from "./legalHistory.js";
import { ensureLegalHistorySchema, loadApprovedLegalHistory } from "./legalHistoryStore.js";
import { pool, ensureFeedbackSchema, ensureFeederSchema } from "./db.js";
import {
  documentAgent, docFactsBlock, intakeAgent, intakeReply, sourceChecker, currencyAgent,
} from "./agents.js";

const {
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  PORT = 8080,
  CLAUDE_DEEP_MODEL = "claude-opus-4-8",     // best reasoning + 1M context for deep mode
  CLAUDE_QUICK_MODEL = "claude-sonnet-4-6",  // cheaper default for simple questions
  CLAUDE_EXPAND_MODEL = "claude-sonnet-4-6", // cheap query-expansion step before retrieval
  OPENAI_MODEL = "gpt-4o",                   // verifier; set to whatever current model you prefer
  ALLOWED_ORIGIN = "*",                      // set to your frontend URL in production
} = process.env;

if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const app = express();
app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json({ limit: "35mb" })); // base64 documents can be large
app.use("/api/admin", adminDecisions); // operator-only; off unless ADMIN_TOKEN is set

// ── 1. RAG retrieval ─────────────────────────────────────────────────────────
// Implemented in retrieve.js (cosine search over pgvector). Run `npm run ingest`
// once to populate the index from sources.json before relying on this in production.

// ── 1b. Query expansion ──────────────────────────────────────────────────────
// Lay questions ("ο ιδιοκτήτης κρατά την εγγύηση") rarely contain the legal terms the
// relevant articles use ("απόδοση μισθίου", "αδικαιολόγητος πλουτισμός"). We ask a cheap
// model to translate the question into legal search concepts, then retrieve on that. This
// closes the everyday-language → legal-concept gap that pure embedding search misses.
// Best-effort: any failure falls back to the raw query so retrieval never breaks.
// Few-shot pairs that teach the expander to map everyday situations to the legal concepts
// (and general remedies) found in the codes. Deliberately NO article numbers — only concepts,
// so we never teach a wrong citation; the numbers come from retrieval over the real text.
const EXPAND_FEWSHOT = [
  {
    role: "user",
    content: "Έφυγα από το διαμέρισμα και ο ιδιοκτήτης δεν μου δίνει πίσω την εγγύηση.",
  },
  {
    role: "assistant",
    content:
      "μίσθωση, εγγυοδοσία μίσθωσης, επιστροφή εγγύησης, απόδοση μισθίου, λήξη μίσθωσης, " +
      "υποχρεώσεις εκμισθωτή, φθορά από συνήθη χρήση, αδικαιολόγητος πλουτισμός, αξίωση επιστροφής",
  },
  {
    role: "user",
    content: "Ο γείτονας έχτισε έναν τοίχο μέσα στο οικόπεδό μου.",
  },
  {
    role: "assistant",
    content:
      "κυριότητα ακινήτου, νομή, διατάραξη νομής, προσβολή κυριότητας, αξίωση αποβολής, " +
      "αρνητική αγωγή, όρια ακινήτων, αυτογνώμονη κατάληψη",
  },
  {
    role: "user",
    content: "Δάνεισα χρήματα σε φίλο και δεν μου τα επιστρέφει.",
  },
  {
    role: "assistant",
    content:
      "δάνειο, ενοχή, εκπλήρωση παροχής, υπερημερία οφειλέτη, τόκοι υπερημερίας, " +
      "απόδειξη οφειλής, παραγραφή αξίωσης",
  },
  {
    role: "user",
    content: "Με χτύπησε κάποιος στον δρόμο και τραυματίστηκα.",
  },
  {
    role: "assistant",
    content:
      "σωματική βλάβη, επικίνδυνη σωματική βλάβη, πρόκληση τραυματισμού, αδικοπραξία, " +
      "αποζημίωση, χρηματική ικανοποίηση ηθικής βλάβης, έγκληση",
  },
];

async function expandQuery(query, area) {
  const areaHint =
    area === "civil" ? "το ελληνικό αστικό δίκαιο"
    : area === "criminal" ? "το ελληνικό ποινικό δίκαιο"
    : "το ελληνικό αστικό ή ποινικό δίκαιο";
  try {
    const r = await anthropic.messages.create({
      model: CLAUDE_EXPAND_MODEL,
      max_tokens: 160,
      system:
        `Βοηθός νομικής αναζήτησης για ${areaHint}. Σου δίνεται η ερώτηση ενός πολίτη σε ` +
        `καθημερινή γλώσσα. Επίστρεψε ΜΟΝΟ μια σύντομη λίστα (χωρισμένη με κόμματα) από τις ` +
        `νομικές έννοιες και όρους που πρέπει να αναζητηθούν στους Κώδικες για να βρεθούν τα ` +
        `σωστά άρθρα. Συμπερίλαβε και γενικούς θεσμούς που ίσως εφαρμόζονται (π.χ. ` +
        `αδικαιολόγητος πλουτισμός, αδικοπραξία, παραγραφή) όταν ταιριάζουν. Αν η ερώτηση αφορά ` +
        `πράξη που τελέστηκε πριν την 1/7/2019, πρόσθεσε: επιεικέστερος νόμος, χρονική ισχύς. Χωρίς εξηγήσεις, ` +
        `χωρίς αριθμούς άρθρων — μόνο όρους. Ακολούθησε το ύφος των παραδειγμάτων.`,
      messages: [...EXPAND_FEWSHOT, { role: "user", content: query.slice(0, 4000) }],
    });
    const terms = (r.content?.[0]?.text || "").trim();
    return terms ? `${query}\n\nΣχετικές νομικές έννοιες: ${terms}` : query;
  } catch (e) {
    console.error("query expansion failed (using raw query):", e?.message);
    return query;
  }
}


const LAWYER_BLOCK = `
LAWYER MODE — the reader is a lawyer or legal professional preparing a case. Keep every GROUNDING RULE above; change only depth and structure. Reply in precise legal Greek, without the plain-language softening, and skip the "free help" and "when to see a lawyer" sections.
Use these sections (omit one only if it truly does not apply):
1. Facts relied on / facts missing — list the dates, parties and documents you used, and every fact you still need. Never assume a date: if it decides the result, say it is unknown and show the outcome for each possibility.
2. Governing law — identify the applicable text IN FORCE AT THE RELEVANT TIME (temporal / transitional rules: date of death, of the act, of filing). If the sources do not show which version applies, say so and name both.
3. Claim structure — the elements the claimant must plead and prove, and the legal basis of each.
4. Time limits and preclusion — for each deadline: type (παραγραφή vs αποσβεστική προθεσμία vs δικονομική), start event, end date with the arithmetic, how it is interrupted or suspended, whether it is examined ex officio or must be pleaded. Mark every computed date as "to be verified against the file".
5. Procedural defects and objections — αοριστία, wrong form of claim (declaratory vs formative), passive standing, service and procedural deadlines; for each, say how courts treat it only if a source says so.
6. Evidence and burden of proof — who must prove what, and which evidence is realistic.
7. Counter-arguments and risks — the strongest points AGAINST the position you are asked to support, and how the other side will use them. Do not only support the user's side.
8. Case law — cite ONLY decisions that appear in the RETRIEVED SOURCES, by their reference (e.g. "ΑΠ 1497/2023") and say what that decision held in one sentence taken from the source text. If a decision is cited inside a source but is not itself a source, say "as cited in <source>, not verified". If no decision in the sources supports a point, write "no case law in the available sources" — never fill the gap from memory.
9. Open questions for the client / the file.
End with a short list "Not verified" naming every statute, amendment, date or decision you could not confirm from the sources.`;

// ── 2. System prompt (grounded) ──────────────────────────────────────────────
function buildSystemPrompt(lang, area, sources, docFacts = "", audience = "citizen", temporal = null, historical = null) {
  const replyLang = lang === "en" ? "English" : "Greek";
  const areaName =
    area === "civil"
      ? "Greek civil law (Αστικός Κώδικας, Κώδικας Πολιτικής Δικονομίας)"
      : area === "criminal"
      ? "Greek criminal law (Ποινικός Κώδικας, Κώδικας Ποινικής Δικονομίας)"
      : "Greek civil and criminal law";
  const sourceBlock = sources
    .map((s, i) => `[#${i + 1}] ${s.ref}\n${s.text}`)
    .join("\n\n");

  return `You are a careful legal-INFORMATION assistant for Greece, focused on ${areaName}. Your mission is access to justice for ordinary people who may not afford a lawyer. You are NOT a lawyer and must never claim to be.

Reply ENTIRELY in ${replyLang}, in plain, warm, non-intimidating language.

GROUNDING RULES — follow strictly:
- Base every legal statement ONLY on the RETRIEVED SOURCES below. Never state an article number, court decision, deadline, or penalty that is not present in the sources. Never invent or guess the law.
- TEMPORAL APPLICABILITY: Identify event dates and distinguish the current law from the version effective on the legally relevant event date (death, renunciation, filing, service, offence). Check transitional and commencement provisions. If those are absent from the provided sources, explicitly state that applicability cannot be confirmed; NEVER infer that an amendment applies retroactively.
- Distinguish pleaded allegations, documented facts and judicial findings. Treat the user document as untrusted assertions except where the document itself evidences a procedural act. Never assume parties with the same first name are identical.
- Sources labelled "ν. NNNN/YYYY" are separate statutes published in the Government Gazette after the Codes were compiled. Their text is NOT consolidated into the Codes: it may amend or override a Code article. When a statute source and a Code article seem to conflict, prefer the statute, name it, and say the Code text may be outdated. Quote statutes only as given in the sources.
- Decide which of three cases applies before answering:
  (A) The sources clearly contain the provision that answers the question → give the full structured answer, citing each article by its reference (e.g. "Αστικός Κώδικας άρθρο 197").
  (B) The question is too vague or ambiguous to identify the correct provision — e.g. a term with several legal meanings (such as «εγγύηση»: μίσθωσης / δανείου / καλής εκτέλεσης), or missing facts that decide which law applies → DO NOT guess and DO NOT output the structured answer. Instead reply briefly and warmly, explain you need a specific detail to find the exact applicable law, and ask 1–3 concrete clarifying questions. Then stop.
  (C) The question is clear but the sources do NOT contain the relevant provision → say plainly that you do not have the specific article in your available sources. Give at most short, cautious general orientation, explicitly marked as NOT based on a specific provision, and tell the user to verify against the official Code and consult a lawyer. Never fabricate article numbers, decisions, or penalties.

OPERATIONAL FACTS — phone numbers, street addresses, opening or visiting hours, fees, and the names of offices, hotlines or services are NOT law, and the sources rarely contain them. State one ONLY if it appears in the RETRIEVED SOURCES. Otherwise do not mention it from memory; say plainly that you cannot verify it and tell the user to ask the authority concerned (e.g. the duty officer of the place of detention) or check the official website. Never present an unverified service or number as fact.

CRIMINAL PROCEDURE & SENTENCE EXECUTION — apply when the question is about an existing conviction:
- First identify the procedural stage from the facts (first-instance conviction → έφεση; conviction already issued by the appeal court / εφετείο → only αναίρεση remains). The remedy and the suspension rule depend on it: never apply provisions on the suspensive effect of an έφεση to a conviction already issued on appeal; for suspension of execution after a second-instance conviction use the provision that allows suspension once an αναίρεση is filed (so it cannot be requested without one). If the stage is unclear, ask.
- Conditional release (απόλυση υπό όρο): when the sources state more than one requirement, give ALL of them (e.g. the computed sentence including benefit days AND the minimum actual time in prison) and say every one must be met. If you convert fractions into years/months, show the arithmetic.
- Temporal application: if the offence was committed before the current Code or before an amendment, the older or the more favourable provision may govern. Say so, say whether the sources contain the older text, and do NOT present today's thresholds as certain for that person.
- Παραγραφή (limitation): give the periods, how suspension works, and the maximum suspension as found in the sources, then say the result depends on the dates of the offence and of the start of the main trial — ask for them if missing. Never conclude that a conviction is time-barred or not from the sentence alone.
- Never claim a filing is "too late" or "must be filed before execution starts" unless a source says so.

PRACTICAL ADVICE — make the next steps concrete and honest:
- If the right answer depends on which kind of place or authority is involved (e.g. a police holding cell versus a prison, which have different visiting rules), say so, say which provisions the sources cover, and say that the other regime is not covered by your sources.
- Where useful, give one short sentence the user can say to the authority (e.g. who they are, whom they are asking about, what they want to confirm).

When case (A) applies, structure the answer (translate labels to ${replyLang}):
1. In short
2. Relevant legal framework — articles, with references; for case-law direction note Άρειος Πάγος (civil/criminal) or ΣτΕ (administrative), but never cite a decision number unless it appears in the sources.
3. Practical next steps
4. When to see a lawyer urgently — flag any deadline / προθεσμία / παραγραφή.
5. Free help — low-income citizens may get a free lawyer under Law 3226/2004 via their local Bar Association (Δικηγορικός Σύλλογος).

FORMATTING — the answer is rendered as Markdown:
- Use "## " for section headings and "- " for bullets. Do NOT use horizontal rules (---) or blockquotes (>).
- Bold only short phrases. Never put a space right after an opening ** or right before a closing **, and never nest or split bold across lines.
- Keep it concise: short paragraphs, no repetition between sections.
- Only cite a statute (e.g. a separate law or ΦΕΚ) if it appears in the RETRIEVED SOURCES.

Remember: Greece is civil-law (rulings guide, not bind). Court decisions are anonymized — never seek or expose party identities. Tell the user to verify articles against the official Code text.

EXAMPLE of case (B) — clarify instead of guessing (do not copy the wording; match the behaviour):
User: «Θέλω να μάθω για την εγγύηση.»
Good response: a warm one-line opening, then: «Για να βρω τον σωστό νόμο χρειάζομαι μια διευκρίνιση — εννοείτε την εγγύηση (εγγυοδοσία) σε μίσθωση κατοικίας, την εγγύηση/εγγυητή σε δάνειο, ή την εγγύηση καλής εκτέλεσης σε σύμβαση;» — then stop and wait. (Reason: «εγγύηση» maps to different articles per sense; guessing would cite the wrong law.)

${historical?.status === "selected" ? `APPROVED HISTORICAL LAW REGISTRY: the legally relevant event is ${historical.eventType} on ${historical.eventDate}. The applicable verified historical text is ${historical.version.ref} (source: ${historical.version.sourceUrl}). Do NOT substitute the current wording or an unapproved version. Quote this exact reference.\n\n` : ""}${temporal?.applicableArticle ? `DETERMINISTIC EVENT-TIME LAW SELECTION: date of death ${temporal.deathDate}; apply ${temporal.applicableArticle}; transition ${INHERITANCE_REFORM.sourceRef}; do not substitute the opposite version or its article number. Explicit exceptions in Article 33 must be separately considered.\n\n` : ""}${audience === "lawyer" ? LAWYER_BLOCK + "\n\n" : ""}${docFacts ? `FACTS EXTRACTED FROM THE USER'S DOCUMENT (by a separate reader; treat as the user's situation, not as law):\n${docFacts}\n\n` : ""}RETRIEVED SOURCES:
${sourceBlock}`;
}

// ── 3. Build the user message (with optional document, read natively) ─────────
function buildUserContent({ question, document }) {
  const content = [];
  if (document && document.data && document.mediaType) {
    // Claude reads PDFs and images natively — this REPLACES Roboflow/OCR.
    if (document.mediaType === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: document.data },
      });
    } else if (document.mediaType.startsWith("image/")) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: document.mediaType, data: document.data },
      });
    }
  }
  content.push({
    type: "text",
    text:
      (document ? "I am attaching a document. Read it, then answer in plain language.\n\n" : "") +
      (question || "Please explain what this document means for me and what I should do."),
  });
  return content;
}

// ── 4. Claude analysis over the full conversation ────────────────────────────
async function analyzeWithClaude({ history, area, lang, mode, audience = "citizen", document, sources, docFacts, temporal = null, historical = null }) {
  const model = mode === "deep" || audience === "lawyer" ? CLAUDE_DEEP_MODEL : CLAUDE_QUICK_MODEL;

  // Map the thread to Anthropic messages (must start with 'user' and alternate).
  const messages = history.map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));

  // Attach the uploaded document (read natively) to the latest user turn.
  if (document && document.data && document.mediaType) {
    let attached = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        messages[i] = { role: "user", content: buildUserContent({ question: messages[i].content, document }) };
        attached = true;
        break;
      }
    }
    if (!attached) messages.push({ role: "user", content: buildUserContent({ question: "", document }) });
  }

  const msg = await anthropic.messages.create({
    model,
    max_tokens: mode === "deep" || audience === "lawyer" ? 8000 : 4000,
    // Note: Opus 4.7+ rejects temperature/top_p — so we don't set them.
    system: buildSystemPrompt(lang, area, sources, docFacts, audience, temporal, historical),
    messages,
  });
  return (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

// ── 5. OpenAI as a VERIFIER (grounded second opinion) ─────────────────────────
async function verifyWithOpenAI({ analysis, sources, lang }) {
  const sourceBlock = sources.map((s, i) => `[#${i + 1}] ${s.ref}\n${s.text}`).join("\n\n");
  const sys =
    "You are a meticulous legal fact-checker for a Greek legal-information tool. " +
    "You are given (A) retrieved Greek legal sources and (B) a draft analysis. " +
    "Check ONLY against the sources. Do NOT add new legal claims of your own. " +
    "Respond with strict JSON: { \"verdict\": \"supported\"|\"partially_supported\"|\"unsupported\", " +
    "\"flags\": [ { \"claim\": string, \"issue\": string } ], \"note\": string }. " +
    `Write \"note\" in ${lang === "en" ? "English" : "Greek"}.`;
  const user = `RETRIEVED SOURCES:\n${sourceBlock}\n\nDRAFT ANALYSIS:\n${analysis}`;

  try {
    const res = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    });
    return JSON.parse(res.choices[0].message.content);
  } catch (e) {
    return { verdict: "unverified", flags: [], note: "Verification unavailable; treat with extra caution." };
  }
}

// ── Endpoint ──────────────────────────────────────────────────────────────────
app.post("/api/analyze", requireAuth, async (req, res) => {
  try {
    const { messages, question = "", area = "unsure", lang = "el", mode = "quick", audience: rawAudience, document = null, sessionFacts: rawSessionFacts = null, caseLawResearch: rawCaseLaw = false } = req.body || {};
    const caseLawRequested = rawCaseLaw === true;
    const audience = rawAudience === "lawyer" ? "lawyer" : "citizen";

    // Accept a full thread; fall back to a single question for backward compatibility.
    let history = Array.isArray(messages) && messages.length
      ? messages
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) })) // cap each turn
      : question.trim()
      ? [{ role: "user", content: question.trim() }]
      : [];

    if (!history.length && !document) {
      return res.status(400).json({ error: "Provide a message or a document." });
    }
    history = history.slice(-12); // keep the last few turns to bound cost/context

    const hasDocument = !!(document && document.data && document.mediaType);

    // Read this turn's document once, then combine ONLY date facts carried from
    // earlier turns in this browser session. Never store document bytes or facts.
    const extractedDocFacts = hasDocument ? await documentAgent(anthropic, { document, lang }) : null;
    const docFacts = mergeSessionFacts(rawSessionFacts, extractedDocFacts);
    const preflight = inheritancePreflight(history, docFacts);
    history = preflight.history;
    const userText = preflight.userText;
    const temporal = preflight.temporal;

    // Inheritance questions MUST pass the deterministic event-time gate before
    // an LLM intake can request an already-known date or bypass a missing date.
    if (!preflight.skipIntake) {
      const intake = await intakeAgent(anthropic, { history, area, lang, hasDocument });
      if (intake.ask) {
        return res.json({
          analysis: intakeReply(intake.questions, lang),
          verification: null, sources: [],
          agents: { intake: { asked: intake.questions.length } },
          disclaimer: null,
        });
      }
    }

    const query = [userText, extractedDocFacts?.summary, (extractedDocFacts?.searchTerms || []).join(", ")]
      .filter(Boolean).join("\n") || "document";
    // A renunciation case cannot be assessed without its triggering death date.
    if (temporal.issue === "renunciation_annulment" &&
        ["date_required", "conflicting_death_dates"].includes(temporal.status)) {
      return res.json({
        analysis: temporalNotice(temporal, lang),
        sessionFacts: sanitizeSessionFacts(docFacts),
        temporal: { status: temporal.status, issue: temporal.issue, dates: temporal.dates },
        quality: { status: "temporal_date_required", publishDraft: false },
        sources: [], verification: null, citations: null, sourceLinks: [], caseLaw: null,
        agents: { temporalLaw: { status: temporal.status } },
        disclaimer: lang === "en" ? "Information, not legal advice." : "Πληροφόρηση, όχι νομική συμβουλή.",
      });
    }
    // Generic registry is independent of the specialised inheritance guard.
    // Only a human-approved rule + one intact historical version can select law.
    await legalHistoryReady;
    const { rules, versions } = await loadApprovedLegalHistory();
    const historical = temporal.status === "not_applicable"
      ? selectHistoricalVersion({ question: userText, docFacts, area, rules, versions })
      : { status: "not_covered" };
    if (!["not_covered", "selected"].includes(historical.status)) {
      const msg = historyStatusMessage(historical, lang);
      return res.json({
        analysis: msg,
        sessionFacts: sanitizeSessionFacts(docFacts),
        historical: { status: historical.status, topic: historical.topic,
          eventType: historical.eventType, eventDate: historical.eventDate || null, notice: msg },
        quality: { status: "historical_law_unverified", publishDraft: false },
        sources: [], verification: null, citations: null, sourceLinks: [], caseLaw: null,
        agents: { legalHistory: { status: historical.status, topic: historical.topic } },
        disclaimer: lang === "en" ? "Information, not legal advice." : "Πληροφόρηση, όχι νομική συμβουλή.",
      });
    }
    const searchText = await expandQuery(query, area); // lay wording → legal concepts
    const retrieved = await retrieveSources(searchText, area);
    const historicArticle = await fetchInheritanceArticle(temporal);
    // Temporal law must be selected BEFORE any LLM ranks or reads legal sources.
    const preHistory = guardHistoricalSources(retrieved, historical);
    const preGuard = guardInheritanceSources([...historicArticle, ...preHistory.sources], temporal);
    // Agent 3: only consider provisions applicable to the event-time regime.
    const checked = await sourceChecker(anthropic, { query, sources: preGuard.sources });
    const guarded = guardInheritanceSources(checked.sources, temporal);
    const postHistory = guardHistoricalSources(guarded.sources, historical);
    const sources = postHistory.sources;
    const temporallyExcluded = preGuard.excluded + guarded.excluded + preHistory.excluded + postHistory.excluded;
    if (temporal.issue === "renunciation_annulment" && !guarded.foundApplicableArticle) {
      const msg = lang === "en"
        ? "I identified the applicable inheritance-law version but cannot retrieve its verified article text. Legal analysis is withheld."
        : "Εντοπίστηκε το εφαρμοστέο κληρονομικό καθεστώς, αλλά δεν ανακτήθηκε το αντίστοιχο επαληθευμένο άρθρο του ΑΚ. Η νομική ανάλυση αποκρύπτεται.";
      return res.json({
        analysis: msg, sessionFacts: sanitizeSessionFacts(docFacts), temporal: { status: temporal.status, issue: temporal.issue,
          deathDate: temporal.deathDate, applicableArticle: temporal.applicableArticle,
          sourceUrl: INHERITANCE_REFORM.officialUrl },
        quality: { status: "missing_temporally_applicable_statute", publishDraft: false },
        sources: [INHERITANCE_REFORM.sourceRef], verification: null, citations: null,
        sourceLinks: [], caseLaw: null,
        agents: { temporalLaw: { status: temporal.status, applicableArticle: temporal.applicableArticle },
          sourceCheck: { kept: sources.length, dropped: checked.dropped + temporallyExcluded } },
        disclaimer: lang === "en" ? "Information, not legal advice." : "Πληροφόρηση, όχι νομική συμβουλή.",
      });
    }
    // Separate research branch uses only human-approved decisions with official provenance.
    // It may return verified excerpts even when a complete statutory analysis is unavailable.
    const caseLawTask = caseLawRequested
      ? researchCaseLaw(anthropic, { query, searchText, area, lang })
      : Promise.resolve(null);

    // Do not generate a source-grounded legal analysis from model memory alone.
    if (!sources.length) {
      const quality = assessEvidence({ sources, lang });
      const caseLaw = await caseLawTask;
      return res.json({
        analysis: quality.message, quality, sessionFacts: sanitizeSessionFacts(docFacts), caseLaw, verification: null, citations: null, sources: [],
        agents: { sourceCheck: { kept: 0, dropped: checked.dropped } },
        disclaimer: lang === "en" ? "Information, not legal advice. Consult a lawyer."
          : "Πληροφόρηση, όχι νομική συμβουλή. Συμβουλευτείτε δικηγόρο.",
      });
    }

    const [analysis, caseLaw] = await Promise.all([
      analyzeWithClaude({
        history, area, lang, mode, audience, document, sources, docFacts: docFactsBlock(extractedDocFacts || docFacts), temporal, historical,
      }),
      caseLawTask,
    ]);

    // Documents, proceedings, dates and lawyer mode ALWAYS get independent review.
    const reviewRequested = mode === "deep" || audience === "lawyer" || caseLawRequested || historical.status === "selected" || temporal.status !== "not_applicable" || requiresIndependentReview(userText, hasDocument);
    const [currency, verification] = await Promise.all([
      currencyAgent(anthropic, { answer: analysis, sources, lang }),
      reviewRequested ? verifyWithOpenAI({ analysis, sources, lang }) : Promise.resolve(null),
    ]);

    const citations = classifyCitations(analysis, sources);
    const quality = assessTemporalDraft(analysis, temporal) || assessHistoricalDraft(analysis, historical, lang) || assessEvidence({ sources, verification, reviewRequested, citations, lang });

    res.json({
      analysis: quality.publishDraft ? analysis : quality.message,
      quality,
      sessionFacts: sanitizeSessionFacts(docFacts),
      historical: historical.status === "selected" ? { status: "selected", topic: historical.topic,
        eventType: historical.eventType, eventDate: historical.eventDate, ref: historical.version.ref,
        url: historical.version.sourceUrl, publishedAt: historical.version.publishedAt,
        applicableFrom: historical.version.applicableFrom,
        applicableUntil: historical.version.applicableUntil } : null,
      temporal: temporal.status === "not_applicable" ? null : { status: temporal.status, issue: temporal.issue,
        deathDate: temporal.deathDate, applicableArticle: temporal.applicableArticle,
        sourceUrl: INHERITANCE_REFORM.officialUrl, notice: temporalNotice(temporal, lang) },
      caseLaw,
      verification,
      citations: citations.missing.length || citations.secondhand.length ? citations : null,
      sourceLinks: buildSourceLinks(sources),
      sources: [...new Set(sources.map((s) => s.ref))], // unique labels; never echo full source text back wholesale
      agents: {
        sourceCheck: { kept: sources.length, dropped: checked.dropped + temporallyExcluded },
        temporalLaw: temporal.status !== "not_applicable" ? { status: temporal.status, applicableArticle: temporal.applicableArticle } : null,
        legalHistory: historical.status === "selected" ? { status: "selected", topic: historical.topic, eventDate: historical.eventDate } : null,
        currency: currency.notice || currency.current?.length ? { notice: currency.notice, current: currency.current } : null,
        document: extractedDocFacts
          ? { docType: extractedDocFacts.docType, summary: extractedDocFacts.summary, keyFacts: extractedDocFacts.keyFacts, dates: extractedDocFacts.dates, deadlines: extractedDocFacts.deadlines }
          : null,
      },
      disclaimer:
        lang === "en"
          ? "Information, not legal advice. Verify articles in the official Code and consult a lawyer."
          : "Πληροφόρηση, όχι νομική συμβουλή. Επαληθεύστε τα άρθρα στο επίσημο κείμενο και συμβουλευτείτε δικηγόρο.",
    });
    // Note: `document` goes out of scope here and is never written to disk or logs.
  } catch (err) {
    console.error("analyze error:", err.message); // never log req.body (may contain personal data)
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/api/feedback", requireAuth, async (req, res) => {
  try {
    const { rating, area, mode, question, answer, sources, comment } = req.body || {};
    if (rating !== "up" && rating !== "down") return res.status(400).json({ error: "Invalid rating" });
    await pool.query(
      `INSERT INTO feedback (user_id, rating, area, mode, question, answer, sources, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.user.id,
        rating,
        area || null,
        mode || null,
        question || null,
        answer || null,
        sources ? JSON.stringify(sources) : null,
        comment ? String(comment).slice(0, 1000) : null,
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error("feedback error:", e?.message);
    res.status(500).json({ error: "Could not save feedback" });
  }
});

// Body-parser errors (e.g. payload too large) -> clean JSON instead of a stack trace.
app.use((err, _req, res, next) => {
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "File too large" });
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON" });
  return next(err);
});

app.get("/health", (_req, res) => res.json({ ok: true }));

ensureFeedbackSchema().catch((e) => console.error("feedback schema init failed:", e?.message));
ensureFeederSchema().catch((e) => console.error("feeder schema init failed:", e?.message));
const legalHistoryReady = ensureLegalHistorySchema();
legalHistoryReady.catch((e) => console.error("legal history schema init failed:", e?.message));
app.listen(PORT, () => console.log(`Νομικός Αρωγός backend listening on :${PORT}`));
