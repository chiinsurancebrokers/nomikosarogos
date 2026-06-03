// ocr.js — recover text from PDFs whose text layer is garbled by legacy Greek font
// encodings (the Ποινικός Κώδικας PDF is the known offender). We ignore the broken text
// layer entirely: rasterize each page to an image, then read the *rendered* glyphs.
//
// No system dependencies — pages are rasterized with the mupdf WASM build.
//
// Two providers (set OCR_PROVIDER):
//   tesseract  (default) — free, self-contained: tesseract.js with Greek model 'ell'.
//                          Downloads the model once from a CDN, then caches it.
//   claude               — higher accuracy on messy Greek; costs tokens, but ingest is a
//                          one-off so it's a few dollars at most. Reuses ANTHROPIC_API_KEY.
//
// Tunables: OCR_DPI (default 200), OCR_LANG (default 'ell'), OCR_CLAUDE_MODEL.

import * as mupdf from "mupdf";

const DPI = Number(process.env.OCR_DPI || 200);
const LANG = process.env.OCR_LANG || "ell";

// PDF buffer → one PNG buffer per page.
export async function rasterizePdf(buf, dpi = DPI) {
  const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
  const n = doc.countPages();
  const m = mupdf.Matrix.scale(dpi / 72, dpi / 72);
  const pages = [];
  for (let i = 0; i < n; i++) {
    const pix = doc.loadPage(i).toPixmap(m, mupdf.ColorSpace.DeviceRGB, false, true);
    pages.push(Buffer.from(pix.asPNG()));
  }
  return pages;
}

async function ocrTesseract(pages) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(LANG); // fetches the 'ell' model once, then caches
  const out = [];
  try {
    for (let i = 0; i < pages.length; i++) {
      const { data } = await worker.recognize(pages[i]);
      out.push(data.text);
      process.stdout.write(`  OCR ${i + 1}/${pages.length}\r`);
    }
  } finally {
    await worker.terminate();
  }
  return out.join("\n");
}

const TRANSCRIBE =
  "Μετάγραψε ΠΙΣΤΑ και ΑΥΤΟΥΣΙΑ το ελληνικό νομικό κείμενο αυτής της σελίδας. " +
  "Διατήρησε τις επικεφαλίδες των άρθρων στη μορφή «Άρθρο N». " +
  "Μην προσθέσεις σχόλια, επεξηγήσεις ή Markdown — επίστρεψε μόνο το κείμενο.";

async function ocrClaude(pages) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const model = process.env.OCR_CLAUDE_MODEL || "claude-sonnet-4-6";
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const msg = await client.messages.create({
      model,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: pages[i].toString("base64") } },
            { type: "text", text: TRANSCRIBE },
          ],
        },
      ],
    });
    out.push(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    process.stdout.write(`  OCR ${i + 1}/${pages.length}\r`);
  }
  return out.join("\n");
}

// PDF buffer → recovered plain text.
export async function ocrPdf(buf, provider = process.env.OCR_PROVIDER || "tesseract") {
  const pages = await rasterizePdf(buf);
  const text = provider === "claude" ? await ocrClaude(pages) : await ocrTesseract(pages);
  process.stdout.write("\n");
  return text;
}
