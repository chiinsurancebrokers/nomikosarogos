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
import { requireAuth } from "./auth.js";
import { pool, ensureFeedbackSchema } from "./db.js";

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
app.use(express.json({ limit: "25mb" })); // base64 documents can be large

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
        `αδικαιολόγητος πλουτισμός, αδικοπραξία, παραγραφή) όταν ταιριάζουν. Χωρίς εξηγήσεις, ` +
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

// ── 2. System prompt (grounded) ──────────────────────────────────────────────
function buildSystemPrompt(lang, area, sources) {
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
- Decide which of three cases applies before answering:
  (A) The sources clearly contain the provision that answers the question → give the full structured answer, citing each article by its reference (e.g. "Αστικός Κώδικας άρθρο 197").
  (B) The question is too vague or ambiguous to identify the correct provision — e.g. a term with several legal meanings (such as «εγγύηση»: μίσθωσης / δανείου / καλής εκτέλεσης), or missing facts that decide which law applies → DO NOT guess and DO NOT output the structured answer. Instead reply briefly and warmly, explain you need a specific detail to find the exact applicable law, and ask 1–3 concrete clarifying questions. Then stop.
  (C) The question is clear but the sources do NOT contain the relevant provision → say plainly that you do not have the specific article in your available sources. Give at most short, cautious general orientation, explicitly marked as NOT based on a specific provision, and tell the user to verify against the official Code and consult a lawyer. Never fabricate article numbers, decisions, or penalties.

When case (A) applies, structure the answer (translate labels to ${replyLang}):
1. In short
2. Relevant legal framework — articles, with references; for case-law direction note Άρειος Πάγος (civil/criminal) or ΣτΕ (administrative), but never cite a decision number unless it appears in the sources.
3. Practical next steps
4. When to see a lawyer urgently — flag any deadline / προθεσμία / παραγραφή.
5. Free help — low-income citizens may get a free lawyer under Law 3226/2004 via their local Bar Association (Δικηγορικός Σύλλογος).

Remember: Greece is civil-law (rulings guide, not bind). Court decisions are anonymized — never seek or expose party identities. Tell the user to verify articles against the official Code text.

EXAMPLE of case (B) — clarify instead of guessing (do not copy the wording; match the behaviour):
User: «Θέλω να μάθω για την εγγύηση.»
Good response: a warm one-line opening, then: «Για να βρω τον σωστό νόμο χρειάζομαι μια διευκρίνιση — εννοείτε την εγγύηση (εγγυοδοσία) σε μίσθωση κατοικίας, την εγγύηση/εγγυητή σε δάνειο, ή την εγγύηση καλής εκτέλεσης σε σύμβαση;» — then stop and wait. (Reason: «εγγύηση» maps to different articles per sense; guessing would cite the wrong law.)

RETRIEVED SOURCES:
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
async function analyzeWithClaude({ history, area, lang, mode, document, sources }) {
  const model = mode === "deep" ? CLAUDE_DEEP_MODEL : CLAUDE_QUICK_MODEL;

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
    max_tokens: mode === "deep" ? 8000 : 4000,
    // Note: Opus 4.7+ rejects temperature/top_p — so we don't set them.
    system: buildSystemPrompt(lang, area, sources),
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
    const { messages, question = "", area = "unsure", lang = "el", mode = "quick", document = null } = req.body || {};

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

    // Retrieve using ALL user turns so follow-ups ("ενοικίου") inherit earlier context.
    const query = history.filter((m) => m.role === "user").map((m) => m.content).join("\n") || "document";
    const searchText = await expandQuery(query, area); // lay wording → legal concepts
    const sources = await retrieveSources(searchText, area);

    const analysis = await analyzeWithClaude({ history, area, lang, mode, document, sources });

    // Only run the costly verifier in deep mode (keeps the free tier affordable).
    const verification = mode === "deep" ? await verifyWithOpenAI({ analysis, sources, lang }) : null;

    res.json({
      analysis,
      verification,
      sources: sources.map((s) => s.ref), // never echo full source text back wholesale
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

app.get("/health", (_req, res) => res.json({ ok: true }));

ensureFeedbackSchema().catch((e) => console.error("feedback schema init failed:", e?.message));
app.listen(PORT, () => console.log(`Νομικός Αρωγός backend listening on :${PORT}`));
