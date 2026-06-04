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

const {
  ANTHROPIC_API_KEY,
  OPENAI_API_KEY,
  PORT = 8080,
  CLAUDE_DEEP_MODEL = "claude-opus-4-8",     // best reasoning + 1M context for deep mode
  CLAUDE_QUICK_MODEL = "claude-sonnet-4-6",  // cheaper default for simple questions
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

GROUND your answer in the RETRIEVED SOURCES below. Cite the relevant article using its reference (e.g. "Αστικός Κώδικας άρθρο 197"). If the sources do not cover the question, say so plainly and do NOT invent article numbers, decisions, or penalties.

Structure (translate labels to ${replyLang}):
1. In short
2. Relevant legal framework — articles, with references; for case-law direction note Άρειος Πάγος (civil/criminal) or ΣτΕ (administrative), but never cite a decision number unless it appears in the sources.
3. Practical next steps
4. When to see a lawyer urgently — flag any deadline / προθεσμία / παραγραφή.
5. Free help — low-income citizens may get a free lawyer under Law 3226/2004 via their local Bar Association (Δικηγορικός Σύλλογος).

Remember: Greece is civil-law (rulings guide, not bind). Court decisions are anonymized — never seek or expose party identities. Tell the user to verify articles against the official Code text.

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

// ── 4. Claude deep analysis ───────────────────────────────────────────────────
async function analyzeWithClaude({ question, area, lang, mode, document, sources }) {
  const model = mode === "deep" ? CLAUDE_DEEP_MODEL : CLAUDE_QUICK_MODEL;
  const msg = await anthropic.messages.create({
    model,
    max_tokens: mode === "deep" ? 8000 : 4000,
    // Note: Opus 4.7+ rejects temperature/top_p — so we don't set them.
    system: buildSystemPrompt(lang, area, sources),
    messages: [{ role: "user", content: buildUserContent({ question, document }) }],
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
    const { question = "", area = "unsure", lang = "el", mode = "quick", document = null } = req.body || {};
    if (!question.trim() && !document) {
      return res.status(400).json({ error: "Provide a question or a document." });
    }

    const sources = await retrieveSources(question, area);
    const analysis = await analyzeWithClaude({ question, area, lang, mode, document, sources });

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

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Νομικός Αρωγός backend listening on :${PORT}`));
