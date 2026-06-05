# Νομικός Αρωγός — backend

A small, B2C, mission-driven AI **legal-information** service for Greek civil (αστικό)
and criminal (ποινικό) law. Not a lawyer; not legal advice. Designed to widen access
to justice and route people to free legal aid.

## What each request does

```
question (+ optional document)
        │
        ▼
1. Read document      → Claude reads PDFs/images natively  (NOT Roboflow)
2. Retrieve law       → RAG over official Codes + anonymized decisions  (you plug in)
3. Deep analysis      → Claude  (Opus 4.8 deep mode / Sonnet 4.6 quick mode)
4. Second opinion     → OpenAI VERIFIES Claude's citations against the sources
        │
        ▼
{ analysis, verification, sources, disclaimer }
```

## Deploy to Railway

1. Push this folder to a GitHub repo.
2. Railway → **New Project → Deploy from GitHub repo**.
3. In **Variables**, add `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` (and optionally the
   model overrides + `ALLOWED_ORIGIN`). Railway injects `PORT` automatically.
4. Railway auto-detects Node and runs `npm install` then `npm start`.
5. Your frontend (the prototype) calls `POST https://<your-app>.up.railway.app/api/analyze`.

`npm install` may pull newer SDK majors than pinned here — that's fine; the
`messages.create` / `chat.completions.create` calls used are stable.

## Why these choices

- **No Roboflow.** Roboflow is computer vision (object detection). Reading a court
  paper is a multimodal-LLM job — Claude does it natively. One fewer vendor/key/cost.
  Bad scans → add Tesseract (free) or a managed OCR. Anonymization → Microsoft Presidio.
- **OpenAI as verifier, not a free second opinion.** An independent second answer just
  doubles hallucination risk. Here both models share the same retrieved sources and the
  verifier flags any citation the sources don't support — a safety net for vulnerable users.
- **RAG is the real work — now wired in.** `retrieve.js` does cosine search over a
  pgvector index of the official Codes. `ingest.js` builds that index. Run it before
  going live; an empty index returns no sources and the answer will say it can't find them.

## Build the index (RAG)

1. Add a **Postgres** service in Railway (it sets `DATABASE_URL`). pgvector is supported.
2. Set `EMBED_MODEL` / `EMBED_DIM` (defaults: `text-embedding-3-small`, `1536`).
3. Run the indexer once:

   ```bash
   npm install
   npm run ingest        # downloads the codes in sources.json, chunks by Άρθρο, embeds, stores
   ```

`ingest.js` splits each code on `Άρθρο N` so every chunk is a whole article carrying its
number — that's what gets cited back ("Αστικός Κώδικας άρθρο 197") and what the verifier checks.

**Greek-PDF gotcha (handled automatically):** some older Ministry PDFs use legacy font
encodings that extract as mojibake — the **Ποινικός Κώδικας** is the known offender. The
indexer recovers these with OCR: it ignores the broken text layer, rasterizes each page
(mupdf, no system deps), and reads the rendered glyphs. OCR runs when a `sources.json` entry
has `"ocr": true` (the Ποινικός Κώδικας is flagged) **or** when extraction looks garbled.
Choose the engine with `OCR_PROVIDER`:

- `tesseract` (default) — free and self-contained, Greek model `ell`. Good for a free tool.
- `claude` — higher accuracy on messy Greek; costs tokens, but ingest is one-off (a few €).

Tune with `OCR_DPI` (raise to 300 if quality is poor) and `OCR_LANG`. If a file is *still*
garbled after OCR, save a clean transcript locally and point its manifest entry at `"path"`.

**To add case law:** add manifest entries with `"type": "decisions"` and the right `"area"`
(`"civil"`/`"criminal"` for Άρειος Πάγος, `"admin"` for ΣτΕ). Decisions are chunked by decision
number. Clean static sources are far easier than the JS-only official portals — e.g. **CyLII**
(`cylii.org`) serves anonymized Άρειος Πάγος decisions as plain HTML with a predictable URL
pattern (`/gr/cases/arpag/<series>/<year>/<year>_<series>_<NNNN>.html`); always keep the link
back to the official `areiospagos.gr` text and check the source's terms before bulk fetching.

**Keeping it current:** these 2019 PDFs are not always the latest consolidated text (the Ποινικός
Κώδικας and ΚΠολΔ have since been amended). Track amendments via the ΦΕΚ and re-run `ingest` to refresh.

## Authentication (Supabase, EU-hosted)

`/api/analyze` is protected by `requireAuth` (`auth.js`) so only signed-in users can
trigger the costly Claude + OpenAI pipeline. The flow:

1. The frontend signs the user in with Supabase Auth and reads the access token:
   `const { data } = await supabase.auth.getSession()` → `data.session.access_token`.
2. It calls the backend with `Authorization: Bearer <access_token>`.
3. `requireAuth` verifies the token with `jose` against the project's public JWKS
   (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) — local signature check, keys cached,
   no SDK and no websocket, so it runs on any Node version — and attaches `req.user = { id, role }`.

Set `SUPABASE_URL` in the env (the backend needs only the project URL to fetch the public keys;
the anon key is a frontend concern). Use an **EU-region** Supabase project to keep personal data
in the EU. Because Supabase is Postgres under the hood, the same project can host Auth **and** the
pgvector index, so `DATABASE_URL` can point at it too — one EU-hosted service for auth + RAG.
This assumes asymmetric signing keys (ES256/RS256), the default for new Supabase projects.



- Uploaded documents are processed in memory and **never persisted or logged**.
- Turn on **zero-retention / no-training** on both APIs.
- Prefer redacting PII (Presidio) **before** sending documents to the models.
- Add a clear consent + privacy notice; keep the "information, not advice" line everywhere.
- Keep `ALLOWED_ORIGIN` locked to your domain.

## Feedback (learning what to improve)

Each answer shows 👍 / 👎; `POST /api/feedback` (auth-required) stores the rating, the
question, the answer, the cited sources, and an optional comment in a `feedback` table.
Query it to find which questions got weak answers and prioritise fixes (prompt, sources,
retrieval).

> **Privacy:** the stored `question` can contain personal/sensitive data (a real legal
> situation). Treat the `feedback` table as personal data under GDPR — inform users in your
> privacy notice, set a retention period, restrict access, and consider anonymising or
> dropping the raw `question`/`answer` once you've learned from it. Keep it in your EU region.

## Cost control (so the free tier survives)

- Default to Sonnet (`quick`); reserve Opus + the OpenAI verifier for the
  "Εκτενής Ανάλυση" (`deep`) toggle only.
- Cache retrieval results; embed your corpus once, not per request.
