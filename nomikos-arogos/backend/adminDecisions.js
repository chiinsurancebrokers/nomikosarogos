// adminDecisions.js — operator-only HTTP control of the court-decision pipeline.
//
// The build sandbox cannot reach areiospagos.gr, but the Railway service can. These endpoints let the
// operator run the SAME validated pipeline as `npm run decisions` without a shell. Policy is unchanged:
// ingestion stores decisions as `pending`; only an explicit approve call makes them searchable.
// Disabled unless ADMIN_TOKEN (>=24 chars) is set. Send it as `Authorization: Bearer <token>`.

import crypto from "node:crypto";
import { Router } from "express";
import { ingestOne, ingestManifest, listDecisions, setDecisionStatus } from "./decisions.js";
import { candidateFromOfficialUrl } from "./decisionValidation.js";

export function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function requireAdmin(req, res, next) {
  const token = process.env.ADMIN_TOKEN || "";
  if (token.length < 24) return res.status(404).json({ error: "Not found" }); // feature off
  const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!given || !safeEqual(given, token)) return res.status(401).json({ error: "Unauthorized" });
  next();
}

let running = false;
const guarded = (fn) => async (req, res) => {
  if (running) return res.status(409).json({ error: "An ingest job is already running" });
  running = true;
  try { res.json(await fn(req)); }
  catch (e) { res.status(400).json({ error: e.message }); }
  finally { running = false; }
};

export const adminDecisions = Router();
adminDecisions.use(requireAdmin);
adminDecisions.get("/decisions", async (_req, res) => {
  try { res.json({ decisions: await listDecisions() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Body: { "only": ["1497/2023"] } to limit the manifest, or { "url": "<official areiospagos URL>", "area": "civil" }.
adminDecisions.post("/decisions/ingest", guarded(async (req) => {
  const { url, area, only } = req.body || {};
  if (url) {
    const c = candidateFromOfficialUrl(String(url), String(area || ""));
    return { results: [{ ref: c.ref, ok: true, chunks: await ingestOne(c), status: "pending" }] };
  }
  return { results: await ingestManifest(Array.isArray(only) ? only.map(String) : null) };
}));
// Body: { "ref": "ΑΠ 1497/2023", "action": "approve" | "reject" } — approve only after reading the full decision.
adminDecisions.post("/decisions/review", async (req, res) => {
  try {
    const { ref, action } = req.body || {};
    if (action !== "approve" && action !== "reject") return res.status(400).json({ error: "action must be approve or reject" });
    const n = await setDecisionStatus(String(ref), action === "approve");
    console.log(`decision ${action}: ${ref} (${n} chunks)`);
    res.json({ ref, action, chunks: n });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
