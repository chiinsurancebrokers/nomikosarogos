import test from "node:test";
import assert from "node:assert/strict";
import { chunkCode, stripWatermark, normaliseArticleLabel } from "../chunking.js";

test("a title that starts with the word 'Η' is not read as a letter suffix", () => {
  const rows = chunkCode("Άρθρο 286\nΗ προσωρινή κράτηση\n1. Κείμενο.\nΆρθρο 287\nΗ προσωρινή κράτηση ανηλίκων\n1. Κείμενο.");
  assert.deepEqual(rows.map((r) => r.article), ["286", "287"]);
});

test("attached letter suffixes are kept, Latin lookalikes become Greek", () => {
  const rows = chunkCode("Άρθρο 169Α Παραβίαση\n1. Κείμενο.\nΆρθρο 110A Απόλυση\n1. Κείμενο.");
  assert.deepEqual(rows.map((r) => r.article), ["169Α", "110Α"]);
  assert.equal(normaliseArticleLabel("105 Β"), "105Β");
});

test("watermark, header and page-footer lines are removed, article text is kept", () => {
  const raw = [
    "ΠΟΙΝΙΚΟΣ ΚΩΔΙΚΑΣ (Οκτώβριος 2026) LoNinja.gr",
    "Άρθρο 361",
    "Εξύβριση",
    "LoNinja.groNinja.gr LoNinja.gr LoNinja.gr",
    "Σελίδα 7 από 91",
    "1. Όποιος προσβάλλει την τιμή άλλου.",
  ].join("\n");
  const out = stripWatermark(raw);
  assert.ok(!/Ninja|Σελίδα/.test(out));
  assert.ok(out.includes("Άρθρο 361") && out.includes("Εξύβριση") && out.includes("προσβάλλει την τιμή"));
});

import { looksGarbled } from "../chunking.js";
const GOOD = "Ο κρατούμενος έχει δικαίωμα επικοινωνίας με ένα τουλάχιστον τρίτο πρόσωπο που ο ίδιος υποδείξει, χωρίς αδικαιολόγητη καθυστέρηση. Αν ο κατηγορούμενος στερείται την ελευθερία του, οι αρχές υποχρεούνται να εξετάσουν το αίτημα και να ενημερώσουν τον ίδιο για τα δικαιώματά του. ";
// Real mojibake from a Word-exported Penitentiary Code PDF: Greek-range letters, wrong glyphs.
const BAD = "Νη θαλφλεο εθηέιεζεο δηθαζηηθώλ απνθάζεσλ θαη έθηηζεο πνηλώλ θαη κέηξσλ αζθαιείαο θαηά ηεο ειεπζεξίαο. Θξαηνχκελνη ζεσξνχληαη άηνκα πνπ εθηίνπλ πνηλέο θαηά ηεο ειεπζεξίαο, νη ππφδηθνη θαη φζνη θξαηνχληαη θαηά ην άξζξν 15 ηνπ παξφληνο θαζψο θαη νη ππφ απέιαζε δηακέλνληεο αιινδαπνί ζηα θαηαζηήκαηα θξάηεζεο. ";
test("looksGarbled accepts real Greek and rejects font-scrambled Greek-range text", () => {
  assert.equal(looksGarbled(GOOD.repeat(40)), false);
  assert.equal(looksGarbled(BAD.repeat(40)), true);
});

import { normaliseLegacyGlyphs } from "../chunking.js";
test("legacy glyphs ∆ (U+2206) and µ (U+00B5) become real Greek letters", () => {
  assert.equal(normaliseLegacyGlyphs("∆ΙΑΤΑΓΜΑ µε"), "ΔΙΑΤΑΓΜΑ με");
  const rows = chunkCode(normaliseLegacyGlyphs("Άρθρο 67.\nΔεσµοφύλακας\n1. Κείµενο."));
  assert.equal(rows[0].article, "67");
  assert.ok(rows[0].text.includes("Δεσμοφύλακας"));
});
