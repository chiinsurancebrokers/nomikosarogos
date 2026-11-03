// PDF → text, with a fallback for old gazette PDFs that use a legacy 8-bit Greek font.
// Normal PDFs go through unpdf exactly as before. If the text turns out to be legacy-encoded
// (see repairLegacyEncoding), the PDF is read again WITHOUT pdf.js's NFKC normalisation, which
// otherwise turns NBSP into a space (losing capital Κ) and ligatures ﬁ/ﬂ into "fi"/"fl" (ή/ί).
import { extractText, getDocumentProxy } from "unpdf";
import { repairLegacyEncoding } from "./chunking.js";

async function rawPages(pdf) {
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent({ disableNormalization: true });
    pages.push(tc.items.map((i) => (i.str ?? "") + (i.hasEOL ? "\n" : "")).join(""));
  }
  return pages;
}

export async function pdfToPages(buf) {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  // Per page (mergePages:false): a TOC page stays one line of dotted leaders, which
  // stripTableOfContents() can drop; merged, the whole document would be ONE line.
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const joined = pages.join("\n").replace(/\u0000/g, "");
  if (repairLegacyEncoding(joined) === joined) return pages;
  const raw = await rawPages(pdf);
  return raw.map((p) => repairLegacyEncoding(p.replace(/\u0000/g, "")));
}
