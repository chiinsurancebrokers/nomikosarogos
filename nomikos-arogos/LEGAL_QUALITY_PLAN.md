# Νομικός Αρωγός — Legal-source quality policy (phase 1)

**Purpose:** a verified Greek legal-research assistant, not a substitute for licensed lawyers. A polished answer or a second LLM verdict is not proof of correct law.

## Findings (13 November 2026)

1. The source manifest contains historical PDF versions of Greek Codes, but has no source-level provenance, amendment history or effective-date metadata.
2. PR #15 added `backend/decisions.json` (22 candidate Άρειος Πάγος references) and an indexer; `backend/sources.json` still contains no case-law entries. PR #15 did not establish that all 22 decisions have been fetched or legally reviewed. The new indexer quarantines imported decisions by default until approved.
3. The feeder previously auto-approved new statutes by default. Human review is now required by default. Backfill and review any previously skipped or indexed statutes.
4. The feeder previously treated laws 5303/2026, 5336/2026 and 5344/2026 as consolidated without checking the local source PDF. This skip-list has been removed. For example, 5303/2026 entirely renumbered the inheritance section. Do not treat publication date as the effective date.
5. Source-only verification is not a proof of *temporal applicability*. New quality gates decline unsupported drafts or unknown/secondhand case-law citations and warn that the event-time version must still be checked.
6. Uploaded legal documents can contain sensitive personal data. The PostgreSQL/Supabase region does not prove all processing occurs in the EU: review Anthropic/OpenAI arrangements and feedback retention. Do not store uploaded files or real-case test sets in a public repository.

## Phase 2: trustworthy knowledge graph

Each authoritative document and provision must carry:
- official URL / canonical text / publisher / ΦΕΚ number / issue / publication date / cryptographic digest;
- jurisdiction, court, chamber, case ID, source document, paragraphs and page anchors (for judgments);
- provision/article ID, law or Code, amendment relations, effective_from and effective_to, transitional clauses, and separately event-time applicability;
- whether raw law, consolidated rendition, commentary, doctrine or unverified user-provided evidence;
- ingestion, OCR and legal-review state (pending/approved/rejected), review timestamp and responsible reviewer.

The retrieval pipeline needs article and paragraph exact match + semantic full-text, court decision search, citation-to-source links and a check that each quoted provision appears on the linked page. A statute's amendment should not be presumed to apply retroactively. Cases should be ranked by level, date, issue and closeness of facts; a lower-court decision must never be described as binding precedent.

**Source priority:** official Government Gazette (et.gr), official court texts (areiospagos.gr and other competent courts), official EU law (EUR-Lex / Curia), and then authorized reliable legal research databases, subject to their license terms. Do not bulk copy proprietary legal databases.

## Phase 3: evaluation before a claim of Dikaio.ai parity

Maintain an anonymized, lawyer-reviewed benchmark with at least:
- 20 law-currentness/renumbering queries;
- 20 effective-date and transitional-law scenarios;
- 20 civil-procedure deadline scenarios (including 1–31 August, weekends and service);
- 20 verified Supreme Court judgment searches and citation tests;
- 20 document-analysis tests detecting claims versus judicial findings, multiple parties and inconsistent prayers.

Score independently:
1. Retrieval recall and citation validity;
2. Law-as-of-date accuracy;
3. Correct distinction of allegation, evidence and finding;
4. Precise law-to-fact application, including arguments *against* the suggested position;
5. Safe abstention on missing law and unsupported references.

The system should not advertise legal accuracy comparable to a lawyer or a commercial legal-research platform until the benchmark is independently audited. **Human legal review remains required for actual filings, legal strategy and deadlines.**

## Operational release checklist

- [ ] Run backend tests and frontend build in CI.
- [ ] Inspect `feeder_items` for `skipped`, `garbled`, `error`, and `pending_review`; manually backfill reviewed, relevant ΦΕΚ.
- [ ] Reconcile any laws previously skipped as 'already consolidated' against the real local Code PDFs.
- [ ] Verify official URLs, OCR fidelity and quoted text for every indexed article used in release tests.
- [ ] Verify privacy notice, retention, access control, model-provider data handling and data processing region.
- [ ] Secure case files outside this public GitHub repository.
- [ ] Have a qualified Greek lawyer approve benchmark expected answers and all deadline calculation rules.
- [ ] Run regression checks before every corpus update.

## PR #15 follow-up — decisions and evaluations

- Court decision ingest: `cd nomikos-arogos/backend && npm run decisions`. An entry is rejected if the HTTPS domain, path, URL's `apof` id, or opening decision-number heading does not match the manifest; OCR/HTML parsing failures are reported, not silently accepted.
- New decisions are stored with `review_status='pending'`, excluded from RAG until a qualified human checks the actual full decision and its relevance. In Railway's backend environment, approve with `node decisions.js --approve "ΑΠ 1497/2023"` (or reject with `--reject`). This CLI **does not perform legal review** by itself.
- Legacy unreviewed `decisions` rows with `review_status IS NULL` are also hidden from retrieval. Verify existing records and explicitly approve after inspection.
- Each chunk carries its exact official URL. The server publishes clickable official court links only when the domain and decision identifier match.
- Offline evaluation: capture a response locally, map cases by ID in a private JSON file (`{ "cases": { "inh-1857-old-text": { "analysis": "...", "retrievedSources": [] } } }`), run `npm run evals -- ./evals/answers.json`. This tests textual expectations and citation discipline only; **it is not a certified legal accuracy score**. Do not commit personal case answers to public GitHub.
- Underlying live Postgres coverage, official URL responsiveness and correctness of legal holdings remain **unverified** until deployed and inspected.

## Growing the decisions corpus (discovery, not scraping)

`areiospagos.gr` indexes/summaries are off-limits (see COURT_SOURCE_POLICY.md) and the site restricts automated access, so there is no scraper of its listings. Official decision URLs carry an opaque `cd` token and cannot be guessed; obtain them from a source that publishes them (e.g. Legal Data Hunter `GR/SupremeCourt` search hits), save the hits as JSON and merge:

```bash
node discoverDecisions.js hits.json --area civil --topic "παραγραφή" --since 2012
```
Only the reference and official URL are stored (deduped, allowlisted, identifier-checked). Then ingest on Railway with the admin API (`{"skipIndexed": true}` runs only new entries as a background job; poll `GET /api/admin/decisions/job`). Entries remain `pending` until a human approves them; the `topic` tag is a discovery hint, not a relevance judgement, and the "ασφάλιση" batch in particular needs a relevance check before approval.

## High-stakes criminal criteria (`criminalStakes.js`)

Applies when a criminal question touches **sentence** (ποινή, αναστολή, μετατροπή, απόλυση υπό όρο), **remedies/deadlines** (έφεση, αναίρεση, ανακοπή/ένσταση, προθεσμία), **detention** (σύλληψη, προφυλάκιση) or **limitation** (παραγραφή). Then:

1. **Code era.** The knowledge base holds the *current* ΠΚ/ΚΠΔ (ν. 4619/4620/2019, in force 1.7.2019). For acts before that date the previous text / more favourable law may apply and is not in the sources; a draft that ignores this is rejected. Criminal AP decisions published before 1.7.2019 interpret the previous Codes and can only be shown as *distinguishable*.
2. **No figures from memory.** Any number of days/months/years near a deadline or penalty must appear in the retrieved sources or the user's own facts; otherwise the draft is withheld.
3. **Remedy identity.** «Ανακοπή» is mainly civil-procedure; the draft must say which procedure it belongs to. Stage, challenged decision and start event (publication/service) are required; missing ones must be asked for.
4. **Sentence.** Imposed vs served, full arithmetic, all conditions, no outcome prediction.
5. **Liberty at stake.** Immediate lawyer referral; no unsourced phone numbers.
6. **Case law.** A cassation ruling reviews law and reasoning, not facts; a rejected/inadmissible ground is not a merits holding. These limits are appended to every criminal decision finding.

High-stakes criminal questions always get the independent source check. Offline cases: `npm run evals -- answers.json --suite criminal`. The expected conclusions need lawyer approval before they count as a benchmark. These are guard rails, not legal accuracy: a lawyer must still approve the criteria, especially the era cut-off and the treatment of ανακοπή.
