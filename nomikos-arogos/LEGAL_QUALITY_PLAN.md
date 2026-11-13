# Νομικός Αρωγός — Legal-source quality policy (phase 1)

**Purpose:** a verified Greek legal-research assistant, not a substitute for licensed lawyers. A polished answer or a second LLM verdict is not proof of correct law.

## Findings (13 November 2026)

1. The source manifest contains historical PDF versions of Greek Codes, but has no source-level provenance, amendment history or effective-date metadata.
2. No judicial decisions appear in `backend/sources.json` today. Court-case analysis cannot claim coverage of Greek case law until decisions are indexed with verified text and provenance.
3. The feeder previously auto-approved new statutes by default. Human review is now required by default. Backfill and review any previously skipped or indexed statutes.
4. The feeder previously treated laws 5303/2026, 5336/2026 and 5344/2026 as consolidated without checking the local source PDF. This skip-list has been removed. For example, 5303/2026 entirely renumbered the inheritance section. Do not treat publication date as the effective date.
5. Source-only verification is not a proof of *temporal applicability*. New quality gates decline unsupported drafts and warn that the event-time version must still be checked.
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
