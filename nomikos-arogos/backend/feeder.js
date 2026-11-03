// feeder.js — automatic law feeder. Run it on a schedule (Railway cron, e.g. "0 */6 * * *"):
//
//   node feeder.js                      # one run: find new ΦΕΚ Α issues, index relevant civil/criminal laws
//   node feeder.js --approve <fekId>    # release a held statute (when FEEDER_REQUIRE_REVIEW=true)
//   node feeder.js --reject  <fekId>    # delete a statute's chunks and mark it rejected
//
// Per run, for each year in scope: probe the next ΦΕΚ number after the last one processed. The first
// miss means nothing newer is published. Each new issue is
//   1. downloaded and its text extracted (OCR only if FEEDER_OCR=true and the text layer is garbled),
//   2. pre-filtered (is it a law about civil/criminal matters?),
//   3. classified by a model (law number, area, which Code articles it amends),
//   4. chunked by article, embedded and stored as source='statute' with code_name = 'ν. N/YYYY'.
// Nothing is dropped silently: every issue gets a row in feeder_items, and a summary goes to
// FEEDER_WEBHOOK_URL (Slack-compatible {"text": ...}) when set.
//
// Env: DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY (embeddings), FEK_URL_TEMPLATE,
//      FEEDER_START_NUMBER (first number to try in a year with no state; default 1),
//      FEEDER_MAX_PER_RUN (default 25), FEEDER_REQUIRE_REVIEW (default false),
//      FEEDER_OCR (default false), FEEDER_WEBHOOK_URL (optional).

import Anthropic from "@anthropic-ai/sdk";
import { extractText, getDocumentProxy } from "unpdf";
import { pool, initSchema } from "./db.js";
import { embed } from "./embeddings.js";
import { looksGarbled } from "./chunking.js";
import { ocrPdf } from "./ocr.js";
import { fekId, downloadFek, yearsToProbe } from "./fek.js";
import { looksLikeRelevantLaw, classifyStatute, chunkStatute, isConsolidated, DEFAULT_CONSOLIDATED } from "./statute.js";

const {
  FEEDER_START_NUMBER = "1",
  FEEDER_MAX_PER_RUN = "25",
  FEEDER_REQUIRE_REVIEW = "false",
  FEEDER_OCR = "false",
  FEEDER_WEBHOOK_URL,
  ANTHROPIC_API_KEY,
  FEEDER_CONSOLIDATED_LAWS,
} = process.env;

const CONSOLIDATED = FEEDER_CONSOLIDATED_LAWS
  ? FEEDER_CONSOLIDATED_LAWS.split(",").map((x) => x.trim()).filter(Boolean)
  : DEFAULT_CONSOLIDATED;

const REQUIRE_REVIEW = FEEDER_REQUIRE_REVIEW === "true";
const ISSUE_TYPE_A = 1; // ΦΕΚ Α
const batch = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function getState(key) {
  const r = await pool.query("SELECT value FROM feeder_state WHERE key = $1", [key]);
  return r.rows[0]?.value ?? null;
}
async function setState(key, value) {
  await pool.query(
    `INSERT INTO feeder_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, String(value)]
  );
}
async function record(id, status, extra = {}) {
  await pool.query(
    `INSERT INTO feeder_items (fek_id, status, law_ref, area, title, amends, chunks, note, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (fek_id) DO UPDATE SET status=EXCLUDED.status, law_ref=EXCLUDED.law_ref, area=EXCLUDED.area,
       title=EXCLUDED.title, amends=EXCLUDED.amends, chunks=EXCLUDED.chunks, note=EXCLUDED.note, updated_at=now()`,
    [id, status, extra.lawRef || null, extra.area || null, extra.title || null,
      extra.amends ? JSON.stringify(extra.amends) : null, extra.chunks ?? null, extra.note || null]
  );
}

async function pdfToText(buf) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n").replace(/\u0000/g, "").normalize("NFC");
}

async function storeStatute(id, cls, chunks) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE fek_id = $1", [id]); // idempotent re-runs
    const reviewStatus = REQUIRE_REVIEW ? "pending" : "approved";
    for (const group of batch(chunks, 64)) {
      const vectors = await embed(group.map((c) => `${cls.lawRef} ${c.article ? "άρθρο " + c.article : ""}\n${c.text}`));
      for (let i = 0; i < group.length; i++) {
        await client.query(
          `INSERT INTO chunks (source, code_name, area, article, content, embedding, law_ref, fek_id, published_at, review_status)
           VALUES ('statute',$1,$2,$3,$4,$5,$1,$6,$7,$8)`,
          [cls.lawRef, cls.area, group[i].article || null, group[i].text, `[${vectors[i].join(",")}]`, id, cls.publishedAt, reviewStatus]
        );
      }
    }
    await client.query("COMMIT");
    return reviewStatus;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function processIssue(anthropic, id, buf) {
  let text = await pdfToText(buf);
  if (looksGarbled(text)) {
    if (FEEDER_OCR === "true") text = (await ocrPdf(buf)).replace(/\u0000/g, "").normalize("NFC");
    if (looksGarbled(text)) {
      await record(id, "garbled", { note: "Text layer unreadable; set FEEDER_OCR=true or ingest manually." });
      return { id, status: "garbled" };
    }
  }
  if (!looksLikeRelevantLaw(text)) {
    await record(id, "skipped", { note: "Not a civil/criminal law (pre-filter)." });
    return { id, status: "skipped" };
  }
  const cls = await classifyStatute(anthropic, text);
  if (!cls) {
    await record(id, "skipped", { note: "Classifier: not a relevant civil/criminal law." });
    return { id, status: "skipped" };
  }
  if (isConsolidated(cls.lawRef, CONSOLIDATED)) {
    await record(id, "skipped", { ...cls, note: "Already inside a consolidated Code we index." });
    return { id, status: "skipped" };
  }
  const chunks = chunkStatute(text);
  if (!chunks.length) {
    await record(id, "error", { ...cls, note: "No chunks produced." });
    return { id, status: "error" };
  }
  const reviewStatus = await storeStatute(id, cls, chunks);
  const status = reviewStatus === "pending" ? "pending_review" : "ingested";
  await record(id, status, { ...cls, chunks: chunks.length });
  return { id, status, lawRef: cls.lawRef, title: cls.title, area: cls.area, amends: cls.amends, chunks: chunks.length };
}

async function notify(lines) {
  console.log(lines.join("\n"));
  if (!FEEDER_WEBHOOK_URL || !lines.length) return;
  try {
    await fetch(FEEDER_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: lines.join("\n") }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    console.error("webhook failed:", e?.message);
  }
}

async function run() {
  if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY");
  await initSchema();
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const maxPerRun = Number(FEEDER_MAX_PER_RUN) || 25;
  const results = [];
  const problems = [];
  let processed = 0;

  for (const year of yearsToProbe()) {
    const stateKey = `last_fek_A_${year}`;
    let last = Number(await getState(stateKey));
    if (!Number.isInteger(last) || last < 0) last = (Number(FEEDER_START_NUMBER) || 1) - 1;

    while (processed < maxPerRun) {
      const next = last + 1;
      const id = fekId(year, ISSUE_TYPE_A, next);
      const dl = await downloadFek(id);
      if (dl.status === "missing") break; // not published yet
      if (dl.status === "error") { problems.push(`ΦΕΚ ${id}: download failed (${dl.message})`); break; }
      try {
        const r = await processIssue(anthropic, id, dl.buf);
        results.push(r);
        if (r.status === "garbled") problems.push(`ΦΕΚ ${id}: unreadable PDF text — needs OCR/manual ingest`);
      } catch (e) {
        await record(id, "error", { note: String(e?.message || e).slice(0, 300) });
        problems.push(`ΦΕΚ ${id}: processing failed (${e?.message})`);
        break; // do not advance past a failure; retried on the next run
      }
      last = next;
      processed++;
      await setState(stateKey, last);
    }
  }

  const added = results.filter((r) => r.status === "ingested" || r.status === "pending_review");
  const lines = [];
  if (added.length) {
    lines.push(`Νομικός Αρωγός feeder: ${added.length} new law(s) ${REQUIRE_REVIEW ? "held for review" : "indexed"}:`);
    for (const r of added) {
      const am = r.amends?.length ? ` — amends ${r.amends.map((a) => `${a.code} ${a.article}`).join(", ")}` : "";
      lines.push(`• ${r.lawRef} (${r.area}) ΦΕΚ ${r.id}: ${r.title}${am}`);
    }
    if (REQUIRE_REVIEW) lines.push(`Approve with: node feeder.js --approve <fekId>`);
  }
  lines.push(...problems.map((p) => `⚠ ${p}`));
  if (lines.length) await notify(lines);
  console.log(`feeder done: ${processed} issue(s) checked, ${added.length} added, ${results.length - added.length} skipped/failed.`);
}

async function setReview(id, action) {
  if (!/^\d{11}$/.test(id || "")) throw new Error("Usage: --approve|--reject <11-digit fekId>");
  await initSchema();
  if (action === "approve") {
    const r = await pool.query("UPDATE chunks SET review_status='approved' WHERE fek_id=$1", [id]);
    await pool.query("UPDATE feeder_items SET status='ingested', updated_at=now() WHERE fek_id=$1", [id]);
    console.log(`approved ${r.rowCount} chunk(s) for ΦΕΚ ${id}`);
  } else {
    const r = await pool.query("DELETE FROM chunks WHERE fek_id=$1", [id]);
    await pool.query("UPDATE feeder_items SET status='rejected', note='Rejected by admin', updated_at=now() WHERE fek_id=$1", [id]);
    console.log(`removed ${r.rowCount} chunk(s) for ΦΕΚ ${id}`);
  }
}

const [flag, arg] = process.argv.slice(2);
const main = flag === "--approve" ? () => setReview(arg, "approve")
  : flag === "--reject" ? () => setReview(arg, "reject")
  : run;
main().then(() => pool.end()).catch(async (e) => {
  console.error("feeder failed:", e?.message || e);
  await pool.end().catch(() => {});
  process.exit(1);
});
