// Railway/admin CLI. No public HTTP endpoint. Every import is pending legal review.
// Usage:
//   npm run law-history -- --import ./my-rule.json
//   npm run law-history -- --approve-rule case-rule-1 --reviewer "lawyer-id"
//   npm run law-history -- --approve-version legal-version-1 --reviewer "lawyer-id"
//   npm run law-history -- --reject-version legal-version-1 --reviewer "lawyer-id"
//   npm run law-history -- --list
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { pool } from "./db.js";
import { ensureLegalHistorySchema } from "./legalHistoryStore.js";
import { officialLegalUrl } from "./legalHistory.js";

const safeId = (v) => /^[a-z0-9][a-z0-9_.-]{2,99}$/.test(String(v || ""));
const iso = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const safeText = (v, max = 160) => typeof v === "string" && v.length > 0 && v.length <= max;
const EVENTS = new Set(["death","offence","contract","filing","service","act"]);
const AREAS = new Set(["civil","criminal","admin"]);

async function importEntry(entry) {
  const e = entry || {};
  if (e.kind === "rule") {
    if (!safeId(e.rule_id) || !safeId(e.topic) || !AREAS.has(e.area) ||
      !EVENTS.has(e.event_type) ||
      !Array.isArray(e.match_terms) || !e.match_terms.length ||
      e.match_terms.length > 12 || !e.match_terms.every((v) => safeText(v, 90)) ||
      !safeText(e.source_ref, 230) || !officialLegalUrl(e.source_url))
      throw new Error("Invalid rule metadata; require official statutory source and event type");
    const result = await pool.query([
      "INSERT INTO legal_transition_rules",
      "(rule_id,topic,area,event_type,match_terms,source_ref,source_url,has_exceptions,exception_note)",
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING",
    ].join(" "), [
      e.rule_id, e.topic, e.area, e.event_type,
      e.match_terms, e.source_ref, e.source_url,
      e.has_exceptions === true, e.exception_note || null,
    ]);
    if (!result.rowCount) throw new Error("Rule already exists; approved entries are immutable via this importer");
    return { entity: "rule", id: e.rule_id };
  }
  if (e.kind === "version") {
    if (!safeId(e.version_id) || !safeId(e.rule_id) || !safeText(e.code_name) ||
      !safeText(e.article, 30) || !safeText(e.citation, 300) ||
      !iso(e.applicable_from) || (e.applicable_until && !iso(e.applicable_until)) ||
      (e.applicable_until && e.applicable_from >= e.applicable_until) ||
      !iso(e.published_at) || !safeText(e.source_ref, 230) ||
      !officialLegalUrl(e.source_url) ||
      typeof e.body_text !== "string" || e.body_text.trim().length < 120 ||
      e.body_text.length > 80000 ||
      (e.applicable_from < e.published_at &&
        !(e.retroactive === true && officialLegalUrl(e.retroactivity_source_url))))
      throw new Error("Invalid version metadata or missing official/provenance support");
    const digest = createHash("sha256").update(e.body_text, "utf8").digest("hex");
    const result = await pool.query([
      "INSERT INTO legal_text_versions",
      "(version_id,rule_id,code_name,article,citation,applicable_from,applicable_until,",
      "source_ref,source_url,published_at,body_text,body_sha256,retroactive,retroactivity_source_url)",
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT DO NOTHING",
    ].join(" "), [
      e.version_id, e.rule_id, e.code_name, e.article, e.citation,
      e.applicable_from, e.applicable_until || null, e.source_ref,
      e.source_url, e.published_at, e.body_text, digest,
      e.retroactive === true, e.retroactivity_source_url || null,
    ]);
    if (!result.rowCount) throw new Error("Version already exists; approved entries are immutable via this importer");
    return { entity: "version", id: e.version_id };
  }
  throw new Error("Expected kind=rule or kind=version");
}

async function review(entity, id, reviewer, approve) {
  if (!safeId(id) || !safeText(reviewer, 120))
    throw new Error("Explicit valid entity ID and reviewer identifier are required");
  const table = entity === "rule" ? "legal_transition_rules" : "legal_text_versions";
  const idCol = entity === "rule" ? "rule_id" : "version_id";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const q = [
      "UPDATE " + table,
      "SET review_status=$1, reviewed_by=$2, reviewed_at=now()",
      "WHERE " + idCol + "=$3 AND review_status='pending'",
      "RETURNING " + (entity === "version" ? "body_sha256" : "source_ref"),
    ].join(" ");
    const updated = await client.query(q, [approve ? "approved" : "rejected", reviewer, id]);
    if (updated.rowCount !== 1) throw new Error("Item is missing or already reviewed");
    await client.query(
      "INSERT INTO legal_history_audit (operation,entity,entity_id,reviewer,content_hash) VALUES ($1,$2,$3,$4,$5)",
      [approve ? "approved" : "rejected", entity, id, reviewer, entity === "version" ? updated.rows[0].body_sha256 : null]
    );
    await client.query("COMMIT");
    return { entity, id, status: approve ? "approved" : "rejected" };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}

async function main() {
  await ensureLegalHistorySchema();
  const args = process.argv.slice(2);
  if (args.includes("--import")) {
    const path = args[args.indexOf("--import") + 1];
    if (!path) throw new Error("--import requires a local JSON filename");
    const input = JSON.parse(await fs.readFile(path, "utf8"));
    // Supports one entry; no bulk unverified harvesting.
    console.log(JSON.stringify(await importEntry(input)));
  } else if (args.includes("--list")) {
    const counts = await pool.query([
      "SELECT 'rules' AS kind, review_status, count(*)::int AS n",
      "FROM legal_transition_rules GROUP BY review_status",
      "UNION ALL",
      "SELECT 'versions', review_status, count(*)::int",
      "FROM legal_text_versions GROUP BY review_status ORDER BY kind,review_status",
    ].join(" "));
    console.log(JSON.stringify(counts.rows, null, 2));
  } else {
    const command = args.find((a) => /^--(approve|reject)-(rule|version)$/.test(a));
    if (!command) throw new Error("Use --import, --list, --approve-rule/version or --reject-rule/version");
    const [, action, entity] = /^--(approve|reject)-(rule|version)$/.exec(command);
    const id = args[args.indexOf(command) + 1];
    const ix = args.indexOf("--reviewer");
    const reviewer = ix >= 0 ? args[ix + 1] : null;
    console.log(JSON.stringify(await review(entity, id, reviewer, action === "approve")));
  }
}

main().catch((e) => { console.error("Legal history operation failed:", e.message); process.exitCode = 1; })
  .finally(() => pool.end());
