// ocr.js — recover text from PDFs whose text layer is garbled by legacy Greek font
// encodings (the Ποινικός Κώδικας PDF is the known offender). We ignore the broken text
// layer entirely: rasterize each page to an image, then read the *rendered* glyphs.
//
// Memory: pages are rendered ONE AT A TIME and mupdf's WASM objects are freed immediately,
// so a several-hundred-page Code doesn't exhaust the heap. (Rendering every page up front
// is what caused "malloc failed".)
//
// No system dependencies — rasterization uses the mupdf WASM build.
//
// Two providers (set OCR_PROVIDER):
//   tesseract  (default) — free, self-contained: tesseract.js with Greek model 'ell'.
//   claude               — higher accuracy on messy Greek; costs tokens (ingest is one-off).
//
// Tunables: OCR_DPI (default 200; lower to 150 if memory is tight), OCR_LANG, OCR_CLAUDE_MODEL.

import * as mupdf from "mupdf";

const DPI = Number(process.env.OCR_DPI || 200);
const LANG = process.env.OCR_LANG || "ell";

// Render one page to a PNG buffer, freeing mupdf's WASM objects right away.
function renderPage(doc, i, m) {
  const page = doc.loadPage(i);
  const pix = page.toPixmap(m, mupdf.ColorSpace.DeviceRGB, false, true);
  const png = Buffer.from(pix.asPNG());
  pix.destroy();
  page.destroy();
  return png;
}

async function ocrTesseract(doc, n, m) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(LANG); // fetches the 'ell' model once, then caches
  const out = [];
  try {
    for (let i = 0; i < n; i++) {
      const png = renderPage(doc, i, m); // only one page in memory at a time
      const { data } = await worker.recognize(png);
      out.push(data.text);
      process.stdout.write(`  OCR ${i + 1}/${n}\r`);
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

async function ocrClaude(doc, n, m) {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const model = process.env.OCR_CLAUDE_MODEL || "claude-sonnet-4-6";
  const out = [];
  for (let i = 0; i < n; i++) {
    const png = renderPage(doc, i, m);
    const msg = await client.messages.create({
      model,
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } },
            { type: "text", text: TRANSCRIBE },
          ],
        },
      ],
    });
    out.push(msg.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
    process.stdout.write(`  OCR ${i + 1}/${n}\r`);
  }
  return out.join("\n");
}

// PDF buffer → recovered plain text.
export async function ocrPdf(buf, provider = process.env.OCR_PROVIDER || "tesseract") {
  const doc = mupdf.Document.openDocument(new Uint8Array(buf), "application/pdf");
  try {
    const n = doc.countPages();
    const m = mupdf.Matrix.scale(DPI / 72, DPI / 72);
    const text = provider === "claude" ? await ocrClaude(doc, n, m) : await ocrTesseract(doc, n, m);
    process.stdout.write("\n");
    return text;
  } finally {
    doc.destroy();
  }
}
