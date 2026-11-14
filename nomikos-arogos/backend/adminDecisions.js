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

// Ingest runs as a background job (a full manifest takes minutes; proxies time out long requests).
let job = null;
export function startJob(runner) {
  if (job?.state === "running") throw new Error("An ingest job is already running");
  const j = (job = { state: "running", startedAt: new Date().toISOString(), done: 0, total: null, results: [] });
  runner((p) => Object.assign(j, p))
    .then((results) => Object.assign(j, { state: "finished", results, finishedAt: new Date().toISOString() }))
    .catch((e) => Object.assign(j, { state: "failed", error: e.message }));
  return j;
}

export const adminDecisions = Router();
adminDecisions.use(requireAdmin);
adminDecisions.get("/decisions", async (_req, res) => {
  try { res.json({ decisions: await listDecisions() }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// Body: { "only": ["1497/2023"], "skipIndexed": true } to limit the manifest, or
// { "url": "<official areiospagos URL>", "area": "civil" }. Returns 202; poll GET /decisions/job.
adminDecisions.post("/decisions/ingest", (req, res) => {
  try {
    const { url, area, only, skipIndexed } = req.body || {};
    if (url) {
      const c = candidateFromOfficialUrl(String(url), String(area || ""));
      return res.status(202).json(startJob(async () => [{ ref: c.ref, ok: true, chunks: await ingestOne(c) }]));
    }
    const list = Array.isArray(only) ? only.map(String) : null;
    res.status(202).json(startJob((onProgress) => ingestManifest(list, { skipIndexed: !!skipIndexed, onProgress })));
  } catch (e) { res.status(e.message.includes("already running") ? 409 : 400).json({ error: e.message }); }
});
adminDecisions.get("/decisions/job", (_req, res) => res.json(job || { state: "idle" }));
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
