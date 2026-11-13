// decisions.js — index court decisions (Άρειος Πάγος) from a manifest of URLs.
//
//   npm run decisions                 # fetch + chunk + embed every entry in decisions.json
//   npm run decisions -- --only 1497/2023,1496/2023
//
// decisions.json: [{ "ref": "ΑΠ 1497/2023", "court": "Άρειος Πάγος", "area": "civil", "url": "https://…" }]
// Each decision is stored as its own document (see chunkDecisionDocument) with code_name = court,
// decision = ref, source = 'decisions'. Re-running is idempotent per decision.
//
// This runs on Railway (the build sandbox cannot reach areiospagos.gr). The first run should be
// watched: pages are decoded as UTF-8 or windows-1253 and converted from HTML by a simple stripper.

import fs from "node:fs/promises";
import { pool, initSchema } from "./db.js";
import { embed, EMBED_MODEL } from "./embeddings.js";
import { chunkDecisionDocument, looksGarbled } from "./chunking.js";
import { validateDecisionManifestEntry, validateDecisionText } from "./decisionValidation.js";

const ENTITIES = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&laquo;": "«", "&raquo;": "»" };

export function htmlToText(html) {
  return (html || "")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|laquo|raquo|#39);/g, (e) => ENTITIES[e] || " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\u0000/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// areiospagos.gr has served both UTF-8 and legacy Greek pages: honour the declared charset, and
// fall back to windows-1253 when UTF-8 decoding produces replacement characters.
export function decodeBody(buf, contentType = "") {
  const declared = /charset=([\w-]+)/i.exec(contentType)?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString("latin1"))?.[1];
  const tryDecode = (label) => { try { return new TextDecoder(label, { fatal: false }).decode(buf); } catch { return null; } };
  let text = tryDecode(declared || "utf-8") ?? tryDecode("utf-8");
  if (text && text.includes("�")) text = tryDecode("windows-1253") ?? text;
  return text;
}

async function fetchDecision(url) {
  const res = await fetch(url, { headers: { "user-agent": "NomikosArogos-indexer/1.0 (+legal information; contact via site)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return decodeBody(Buffer.from(await res.arrayBuffer()), res.headers.get("content-type") || "");
}

const batch = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function ingestOne(d) {
  const entry = validateDecisionManifestEntry(d); // block non-official domains and mismatched URL identifiers
  const html = await fetchDecision(entry.url);
  const text = htmlToText(html).normalize("NFC");
  if (text.length < 1500 || looksGarbled(text)) throw new Error("page text too short or garbled — check charset/HTML");
  validateDecisionText(d, text); // reject an HTML error page or the WRONG decision
  const rows = chunkDecisionDocument(text, entry.ref, entry.url);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM chunks WHERE source = 'decisions' AND decision = $1", [entry.ref]);
    for (const group of batch(rows, 64)) {
      const vectors = await embed(group.map((r) => `${d.court || "Άρειος Πάγος"} ${r.decision}\n${r.text}`));
      const params = [];
      const values = [];
      group.forEach((r, i) => {
        const b = i * 8;
        params.push(`(${b + 1},${b + 2},${b + 3},${b + 4},${b + 5},${b + 6},${b + 7},${b + 8})`);
        values.push("decisions", d.court || "Άρειος Πάγος", d.area, null, r.decision, r.text, `[${vectors[i].join(",")}]`, "pending");
      });
      await client.query(
        `INSERT INTO chunks (source,code_name,area,article,decision,content,embedding,review_status) VALUES ${params.join(",")}`,
        values
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return rows.length; // review_status=pending; not searchable until approved by a human
}

async function main() {
  await initSchema();
  const approveAt = process.argv.indexOf("--approve");
  const rejectAt = process.argv.indexOf("--reject");
  if (approveAt >= 0 || rejectAt >= 0) {
    const approving = approveAt >= 0;
    const ref = process.argv[(approving ? approveAt : rejectAt) + 1];
    if (!ref || !/^ΑΠ \d{1,5}\/\d{4}$/u.test(ref)) throw new Error("Specify a decision ref, e.g. ΑΠ 1497/2023");
    const result = approving
      ? await pool.query("UPDATE chunks SET review_status = 'approved' WHERE source='decisions' AND decision=$1", [ref])
      : await pool.query("DELETE FROM chunks WHERE source='decisions' AND decision=$1", [ref]);
    if (!result.rowCount) throw new Error("No indexed decision with that reference");
    console.log(`${approving ? "Approved" : "Rejected"} ${ref} (${result.rowCount} chunks)`);
    await pool.end();
    return;
  }
  const list = JSON.parse(await fs.readFile(new URL("./decisions.json", import.meta.url), "utf8"));
  const i = process.argv.indexOf("--only");
  const only = i > -1 ? process.argv[i + 1].split(",").map((x) => x.trim()) : null;
  const todo = only ? list.filter((d) => only.some((o) => d.ref.endsWith(o))) : list;
  let ok = 0, failed = 0;
  for (const d of todo) {
    try { const n = await ingestOne(d); ok++; console.log(`✓ ${d.ref}: ${n} chunks (PENDING HUMAN REVIEW)`); }
    catch (e) { failed++; console.error(`✗ ${d.ref}: ${e.message}`); }
    await new Promise((r) => setTimeout(r, 1500)); // be polite to the court's server
  }
  console.log(`Done: ${ok} indexed, ${failed} failed (${EMBED_MODEL}).`);
  await pool.end();
}

if (import.meta.url === `file://${process.argv[1]}`) main();
