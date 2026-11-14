import test from "node:test";
import assert from "node:assert/strict";
import { inspectCourtSourceUrl, retrieveCourtDecision, extractUnverifiedReferences } from "../regAgent.js";

const cd = "L6GPBiDNyTnGk6UqHybZD3rXLoPbAV";
const official = "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=" + cd + "&apof=1791_2007";
const jsonUrl = "https://www.areiospagos.gr/nomologia/apofasi_ai_v2.asp?cd=" + cd;
const translated = "https://www-areiospagos-gr.translate.goog/nomologia/apofaseis_DISPLAY.asp?cd=" + cd +
  "&apof=1791_2007&info=bad%EF%BF%BD&_x_tr_sl=el&_x_tr_tl=en";
const text = "Αριθμός 1791/2007\nΤΟ ΔΙΚΑΣΤΗΡΙΟ ΤΟΥ ΑΡΕΙΟΥ ΠΑΓΟΥ\nΑ΄ Πολιτικό Τμήμα\n" +
  "ΣΚΕΦΘΗΚΕ ΣΥΜΦΩΝΑ ΜΕ ΤΟ ΝΟΜΟ\n" +
  ("Η εγγύηση διέπεται από το άρθρο 847 ΑΚ. Αναφέρεται η ΑΠ 14/2006. ".repeat(35)) +
  "\nΓΙΑ ΤΟΥΣ ΛΟΓΟΥΣ ΑΥΤΟΥΣ\nΑπορρίπτει την αίτηση.\n" +
  "ΔΗΜΟΣΙΕΥΘΗΚΕ σε δημόσια συνεδρίαση στις 15 Ιουνίου 2007.";
const payload = (overrides = {}) => ({ status: "success", case_id: cd, court: "Areios Pagos", document_text: text, ...overrides });
const jsonResponse = (data) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });

test("REG strips translation proxy and untrusted info parameters from provenance", () => {
  const parsed = inspectCourtSourceUrl(translated);
  assert.equal(parsed.ref, "ΑΠ 1791/2007");
  assert.equal(parsed.displayUrl, official);
  assert.equal(parsed.jsonUrl, jsonUrl);
  assert.equal(parsed.inputKind, "display");
});

test("REG accepts JSON cd-only source and rejects SSRF/unsafe paths", () => {
  assert.equal(inspectCourtSourceUrl(jsonUrl).ref, null);
  for (const unsafe of [
    "https://www.areiospagos.gr.evil.test/nomologia/apofasi_ai_v2.asp?cd=" + cd,
    "https://evil.test/nomologia/apofaseis_DISPLAY.asp?cd=" + cd + "&apof=1791_2007",
    "http://www.areiospagos.gr/nomologia/apofasi_ai_v2.asp?cd=" + cd,
    "https://www.areiospagos.gr@evil.test/nomologia/apofasi_ai_v2.asp?cd=" + cd,
    "https://www.areiospagos.gr/nomologia/apofaseis_result.asp?cd=" + cd,
    "https://www.areiospagos.gr/nomologia/apofaseis_DISPLAY.asp?cd=" + cd,
  ]) assert.throws(() => inspectCourtSourceUrl(unsafe));
});

test("REG retrieves official JSON, verifies decision/date, and labels references unverified", async () => {
  let calls = 0;
  const result = await retrieveCourtDecision(translated, {
    fetchImpl: async (url) => { calls++; assert.equal(url, jsonUrl); return jsonResponse(payload()); },
  });
  assert.equal(calls, 1);
  assert.equal(result.ref, "ΑΠ 1791/2007");
  assert.equal(result.publishedAt, "2007-06-15");
  assert.equal(result.officialUrl, official);
  assert.equal(result.transport, "official_json");
  assert.ok(result.body.startsWith("Αριθμός 1791/2007"));
  assert.ok(result.citedDecisions.includes("ΑΠ 14/2006"));
  assert.equal(result.verifiedIndividually, false);
});

test("REG derives official display URL from a JSON-only link", async () => {
  const result = await retrieveCourtDecision(jsonUrl, { fetchImpl: async () => jsonResponse(payload()) });
  assert.equal(result.officialUrl, official);
  assert.equal(result.ref, "ΑΠ 1791/2007");
});

test("REG rejects mismatched identity, missing publication and non-success payloads", async () => {
  for (const overrides of [
    { case_id: "DIFFERENT" },
    { court: "Other Court" },
    { document_text: text.replace("1791/2007", "1792/2007") },
    { document_text: text.replace(/ΔΗΜΟΣΙΕΥΘΗΚΕ[\s\S]*/, "") },
    { status: "not_found" },
  ]) {
    await assert.rejects(retrieveCourtDecision(jsonUrl, {
      fetchImpl: async () => jsonResponse(payload(overrides)),
    }), /REG/);
  }
});

test("REG falls back only to official HTML for a known display decision", async () => {
  const called = [];
  const html = "<html><body><p>" + text.replaceAll("\n", "</p><p>") + "</p></body></html>";
  const result = await retrieveCourtDecision(official, {
    fetchImpl: async (url) => {
      called.push(url);
      return url === jsonUrl ? new Response("unavailable", { status: 503 }) :
        new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    },
  });
  assert.deepEqual(called, [jsonUrl, official]);
  assert.equal(result.transport, "official_html_fallback");
  assert.equal(result.publishedAt, "2007-06-15");
});

test("REG does not fall back to translated proxy, indexes or unrelated sources", async () => {
  await assert.rejects(retrieveCourtDecision(jsonUrl, {
    fetchImpl: async () => new Response("unavailable", { status: 503 }),
  }), /JSON retrieval rejected/);
  await assert.rejects(retrieveCourtDecision(official, {
    fetchImpl: async (url) => url === jsonUrl ? new Response("no", { status: 503 }) :
      new Response("<html>search result</html>", { status: 200 }),
  }), /HTML failed/);
});

test("REG enforces response byte caps and labels cross-citations as unverified", async () => {
  await assert.rejects(retrieveCourtDecision(jsonUrl, {
    maxBytes: 40,
    fetchImpl: async () => jsonResponse(payload()),
  }), /size limit/);
  const refs = extractUnverifiedReferences("ΑΠ 11/2020, ΟλΑΠ 14/2006, άρθρο 847 ΑΚ");
  assert.deepEqual(refs.citedDecisions, ["ΑΠ 11/2020", "ΟλΑΠ 14/2006"]);
  assert.equal(refs.verifiedIndividually, false);
});
