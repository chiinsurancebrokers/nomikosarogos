// ingest.js — one-off (re-runnable) indexer.
//   node ingest.js                      # uses sources.json (downloads the official codes)
//
// For files that come back garbled (legacy Greek font encoding), OCR them first
// (Tesseract lang 'ell', or transcribe via a multimodal model), save the clean text
// locally, and add a manifest entry with "path" instead of "url".

import fs from "node:fs/promises";
import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";
import { chunkCode, chunkDecisions, looksGarbled } from "./chunking.js";
import { ocrPdf } from "./ocr.js";
import { embed, EMBED_MODEL } from "./embeddings.js";
import { pool, initSchema } from "./db.js";

async function loadSource(src) {
  const ref = src.url || src.path;
  let buf;
  if (src.url) {
    const res = await fetch(encodeURI(src.url));
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    buf = await fs.readFile(src.path);
  }
  const lower = ref.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return { text, buf, isPdf: true };
  }
  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: value, buf, isPdf: false };
  }
  return { text: buf.toString("utf8"), buf, isPdf: false }; // .txt (e.g. court decisions)
}

const batch = (a, n) => {
  const o = [];
  for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n));
  return o;
};

async function ingestOne(src) {
  console.log(`\n→ ${src.code_name} (${src.area})`);
  const { text: raw, buf, isPdf } = await loadSource(src);
  let text = raw;

  // Legacy Greek-font PDFs (e.g. the Ποινικός Κώδικας) extract as mojibake. Recover them
  // by OCR'ing the rendered pages instead of trusting the broken text layer.
  if (isPdf && (src.ocr || looksGarbled(text))) {
    const why = src.ocr ? "flagged for OCR" : "text layer looks garbled";
    const provider = process.env.OCR_PROVIDER || "tesseract";
    console.warn(`  ⚠ ${why} — running OCR (${provider}); this can take a while…`);
    text = await ocrPdf(buf);
  }

  if (looksGarbled(text)) {
    console.warn(
      "  ⚠ still garbled after OCR — skipping. Try OCR_PROVIDER=claude, a higher OCR_DPI,\n" +
        "    or save a clean transcript locally and point the manifest entry at it via \"path\"."
    );
    return 0;
  }
  text = text.replace(/\u0000/g, "");

  const rows = src.type === "decisions" ? chunkDecisions(text) : chunkCode(text);
  console.log(`  ${rows.length} chunks`);

  await pool.query("DELETE FROM chunks WHERE code_name = $1", [src.code_name]); // idempotent
  let done = 0;
  for (const group of batch(rows, 96)) {
    const labels = group.map(
      (r) => `${src.code_name} ${r.article ? "άρθρο " + r.article : r.decision || ""}\n${r.text}`
    );
    const vectors = await embed(labels);
    const params = [];
    const values = [];
    group.forEach((r, i) => {
      const b = i * 7;
      params.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`);
      values.push(
        src.type === "decisions" ? "decisions" : "code",
        src.code_name,
        src.area,
        r.article || null,
        r.decision || null,
        r.text,
        `[${vectors[i].join(",")}]`
      );
    });
    await pool.query(
      `INSERT INTO chunks (source,code_name,area,article,decision,content,embedding) VALUES ${params.join(",")}`,
      values
    );
    done += group.length;
    process.stdout.write(`  embedded ${done}/${rows.length}\r`);
  }
  console.log(`\n  \u2713 ${done} stored`);
  return done;
}

async function main() {
  await initSchema();
  const manifest = JSON.parse(await fs.readFile(new URL("./sources.json", import.meta.url)));
  let total = 0;
  for (const src of manifest) {
    try {
      total += await ingestOne(src);
    } catch (e) {
      console.error(`  \u2717 ${src.code_name}: ${e.message}`);
    }
  }
  console.log(`\nDone. ${total} chunks indexed with ${EMBED_MODEL}.`);
  await pool.end();
}

main();
