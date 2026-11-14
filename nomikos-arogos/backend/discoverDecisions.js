// discoverDecisions.js — merge DISCOVERED official decision links into decisions.json.
//
//   node discoverDecisions.js hits.json --area civil [--topic "αποποίηση κληρονομίας"] [--since 2010]
//
// Discovery deliberately does NOT crawl areiospagos.gr search/listing pages: that site's indexes,
// taxonomy and summaries are off-limits (COURT_SOURCE_POLICY.md) and its robots rules may disallow
// automated listing access. Official decision URLs (which carry an opaque `cd` token and cannot be
// guessed) come from a legal-research source that publishes them — e.g. Legal Data Hunter's
// GR/SupremeCourt search hits — saved as JSON: either a search response ({hits:[…]}) or an array of
// hits with at least { url } (court/date optional). Only the reference + official URL are stored; the
// decision text is fetched later by `npm run decisions` / the admin API, validated, and held `pending`.

import fs from "node:fs/promises";
import { validateDecisionManifestEntry, candidateFromOfficialUrl } from "./decisionValidation.js";

export function hitsFrom(json) {
  const arr = Array.isArray(json) ? json : Array.isArray(json?.hits) ? json.hits : [];
  return arr.flatMap((h) => (Array.isArray(h?.hits) ? h.hits : [h]));
}

export function mergeDiscovered(existing, hits, { area, topic, since } = {}) {
  const have = new Set(existing.map((d) => d.ref));
  const added = [], rejected = [];
  for (const h of hits) {
    try {
      if (h.court && !/Άρειος Πάγος/u.test(h.court)) throw new Error("not an Areios Pagos decision");
      if (since && h.date && Number(String(h.date).slice(0, 4)) < Number(since)) throw new Error("older than --since");
      const c = candidateFromOfficialUrl(h.url, area);
      validateDecisionManifestEntry(c);
      if (have.has(c.ref)) continue;
      have.add(c.ref);
      const entry = { ref: c.ref, court: "Άρειος Πάγος", area, url: c.url };
      if (topic) entry.topic = topic;
      added.push(entry);
    } catch (e) { rejected.push({ url: h?.url, reason: e.message }); }
  }
  return { merged: [...existing, ...added], added, rejected };
}

async function main() {
  const [file] = process.argv.slice(2);
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined; };
  if (!file || !["civil", "criminal"].includes(arg("--area"))) throw new Error("Usage: node discoverDecisions.js hits.json --area civil|criminal [--topic T] [--since YYYY]");
  const target = new URL("./decisions.json", import.meta.url);
  const existing = JSON.parse(await fs.readFile(target, "utf8"));
  const { merged, added, rejected } = mergeDiscovered(existing, hitsFrom(JSON.parse(await fs.readFile(file, "utf8"))), { area: arg("--area"), topic: arg("--topic"), since: arg("--since") });
  await fs.writeFile(target, JSON.stringify(merged, null, 2) + "\n");
  console.log(`added ${added.length}, rejected ${rejected.length}, total ${merged.length}`);
  rejected.forEach((r) => console.log("  rejected:", r.url, "-", r.reason));
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
