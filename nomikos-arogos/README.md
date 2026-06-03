# Νομικός Αρωγός · Legal Companion

A **B2C, mission-driven AI legal-information** app for Greek civil (αστικό) and criminal
(ποινικό) law. It helps ordinary people understand their situation in plain language,
grounded in the official Codes and case law, and routes them to free legal aid.

> **It is not a lawyer and not legal advice.** It provides general legal information and
> always points users toward a qualified lawyer and free legal aid (Law 3226/2004).

## How it works

```
 Browser (frontend, Vite + React)
   │  Supabase email login → access token
   ▼
 Authorization: Bearer <token>
   │
 Backend (Express on Railway)
   ├─ requireAuth        verify Supabase token (JWKS, local)
   ├─ retrieveSources    RAG over official Codes + case law (pgvector)
   ├─ Claude             grounded analysis (Opus 4.8 deep / Sonnet 4.6 quick)
   └─ OpenAI             verifies Claude's citations against the same sources
   ▼
 { analysis, verification, sources, disclaimer }
```

## Repo layout

```
nomikos-arogos/
├─ backend/     Express API: auth + RAG + Claude + OpenAI verifier  (deploy to Railway)
│  └─ ingest.js  one-off indexer for the official Codes
└─ frontend/    Vite + React app with Supabase login                (deploy anywhere static)
```

## Go live (order matters)

### 1. Supabase (EU region — keeps personal data in the EU)
- Create a project in an **EU region**.
- Auth → Email: enable email **OTP / magic code** sign-in.
- Copy the **Project URL** and the **anon (publishable) key**.
- Database → copy the **connection string** (this is your `DATABASE_URL`; the same project
  hosts your pgvector index, so you don't need a separate DB).

### 2. Backend (Railway)
- New Project → Deploy from GitHub repo → root directory `backend`.
- Variables: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, `PGSSL=true`,
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `ALLOWED_ORIGIN` (your frontend URL).
- Deploy. Then build the legal index once (locally or via a Railway one-off):
  ```
  npm install && npm run ingest
  ```
- Note the backend URL, e.g. `https://your-backend.up.railway.app`.

### 3. Frontend (Vercel / Netlify / Railway static)
- Deploy the `frontend` folder. Build command `npm run build`, output `dist`.
- Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL=https://your-backend.up.railway.app`.
- After it has a URL, set the backend's `ALLOWED_ORIGIN` to that URL and redeploy the backend.

## Push to GitHub

```
git init
git add .
git commit -m "Νομικός Αρωγός — initial"
git branch -M main
git remote add origin https://github.com/<you>/nomikos-arogos.git
git push -u origin main
```

(`.gitignore` already excludes `node_modules`, `dist`, and `.env` files — never commit keys.)

## Before you put it in front of real people

- **Populate the index.** `npm run ingest` must succeed, or answers fall back to model
  memory. Some 2019 Ministry PDFs use legacy Greek font encodings that extract as garbage;
  `ingest.js` detects and skips those — OCR them (Tesseract `ell`) and re-ingest from a local path.
- **Keep amendments current.** The 2019 Codes aren't always the latest text (ΠΚ, ΚΠολΔ have
  changed). Track the ΦΕΚ and re-ingest periodically.
- **Data protection.** Uploaded documents are processed in memory and not persisted or logged;
  enable zero-retention/no-training on the model APIs; consider redacting PII before sending.
- **Cost control.** `deep` mode runs Opus + the OpenAI verifier — reserve it for the toggle;
  `quick` (Sonnet only) keeps a free tier viable.
- **Not legal advice.** Keep the disclaimer and free-legal-aid routing prominent.

See `backend/README.md` for backend-specific details.
