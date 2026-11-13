// Historical-law registry: no existing RAG chunks are rewritten, nothing is auto-approved.
import { pool } from "./db.js";

const ruleDDL = [
  "CREATE TABLE IF NOT EXISTS legal_transition_rules (",
  "rule_id TEXT PRIMARY KEY, topic TEXT NOT NULL,",
  "area TEXT NOT NULL CHECK (area IN ('civil','criminal','admin')),",
  "event_type TEXT NOT NULL CHECK (event_type IN ('death','offence','contract','filing','service','act')),",
  "match_terms TEXT[] NOT NULL, source_ref TEXT NOT NULL, source_url TEXT NOT NULL,",
  "has_exceptions BOOLEAN NOT NULL DEFAULT false, exception_note TEXT,",
  "review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),",
  "reviewed_by TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
].join(" ");
const versionDDL = [
  "CREATE TABLE IF NOT EXISTS legal_text_versions (",
  "version_id TEXT PRIMARY KEY, rule_id TEXT NOT NULL REFERENCES legal_transition_rules(rule_id),",
  "code_name TEXT NOT NULL, article TEXT NOT NULL, citation TEXT NOT NULL,",
  "applicable_from DATE NOT NULL, applicable_until DATE,",
  "source_ref TEXT NOT NULL, source_url TEXT NOT NULL, published_at DATE NOT NULL,",
  "body_text TEXT NOT NULL, body_sha256 TEXT NOT NULL,",
  "retroactive BOOLEAN NOT NULL DEFAULT false, retroactivity_source_url TEXT,",
  "review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN ('pending','approved','rejected')),",
  "reviewed_by TEXT, reviewed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),",
  "CHECK (applicable_until IS NULL OR applicable_until > applicable_from))",
].join(" ");

export async function ensureLegalHistorySchema() {
  await pool.query(ruleDDL);
  await pool.query(versionDDL);
  await pool.query("CREATE INDEX IF NOT EXISTS legal_versions_rule_idx ON legal_text_versions (rule_id,review_status,applicable_from,applicable_until)");
  await pool.query([
    "CREATE TABLE IF NOT EXISTS legal_history_audit (",
    "id BIGSERIAL PRIMARY KEY, operation TEXT NOT NULL, entity TEXT NOT NULL,",
    "entity_id TEXT NOT NULL, reviewer TEXT, content_hash TEXT,",
    "created_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  ].join(" "));
}
const iso = (d) => d instanceof Date ? d.toISOString().slice(0, 10)
  : d ? String(d).slice(0, 10) : null;

export async function loadApprovedLegalHistory() {
  // Hard cap: silently truncating the revision history could choose the wrong law.
  const rules = await pool.query([
    "SELECT rule_id,topic,area,event_type,match_terms,source_ref,source_url,",
    "has_exceptions,exception_note,review_status FROM legal_transition_rules",
    "WHERE review_status='approved' ORDER BY rule_id LIMIT 501",
  ].join(" "));
  if (rules.rows.length > 500) throw new Error("Legal registry rule limit exceeded");
  if (!rules.rows.length) return { rules: [], versions: [] };
  const versions = await pool.query([
    "SELECT version_id,rule_id,code_name,article,citation,applicable_from,",
    "applicable_until,source_ref,source_url,published_at,body_text,body_sha256,",
    "retroactive,retroactivity_source_url,review_status FROM legal_text_versions",
    "WHERE rule_id=ANY($1::text[]) ORDER BY rule_id,applicable_from LIMIT 2001",
  ].join(" "), [rules.rows.map((r) => r.rule_id)]);
  if (versions.rows.length > 2000) throw new Error("Legal registry version limit exceeded");
  return {
    rules: rules.rows,
    versions: versions.rows.map((v) => ({
      ...v, applicable_from: iso(v.applicable_from),
      applicable_until: iso(v.applicable_until),
      published_at: iso(v.published_at),
    })),
  };
}
