import * as mupdf from "mupdf";

const DPI = Number(process.env.OCR_DPI || 200);
const LANG = process.env.OCR_LANG || "ell";

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
  const worker = await createWorker(LANG);
  const out = [];
  try {
    for (let i = 0; i < n; i++) {
      const png = renderPage(doc, i, m);
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
