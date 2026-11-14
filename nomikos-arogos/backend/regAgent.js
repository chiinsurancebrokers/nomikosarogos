// REG — Retrieval & Evidence Guardian for the Supreme Court's public decision texts.
// Only official full decisions are retrieved. Indexes, headnotes and topic summaries
// are NOT collected. This is an undocumented endpoint: failures are not evidence that
// the decision does not exist. No third-party translation is used as source text.
import { decisionBodyAgent, publicationDateAgent } from "./courtAgents.js";
import { validateDecisionText } from "./decisionValidation.js";

const COURT = "https://www.areiospagos.gr";
const TRANSLATED = "www-areiospagos-gr.translate.goog";
const DISPLAY = "/nomologia/apofaseis_DISPLAY.asp";
const JSON_PATH = "/nomologia/apofasi_ai_v2.asp";
const MAX_BYTES = 2_000_000;

export function inspectCourtSourceUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error("Invalid court URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("Court source must be HTTPS without credentials or a custom port");
  const host = url.hostname.toLowerCase();
  if (!["www.areiospagos.gr", "areiospagos.gr", TRANSLATED].includes(host))
    throw new Error("Court source is not on the official or allowlisted translation host");
  const path = url.pathname.toLowerCase();
  if (![DISPLAY.toLowerCase(), JSON_PATH.toLowerCase()].includes(path))
    throw new Error("Only an individual decision page or JSON decision endpoint is accepted");
  if (host === TRANSLATED && path !== DISPLAY.toLowerCase())
    throw new Error("Translation proxy is only accepted for a decision display link");
  if (url.searchParams.getAll("cd").length !== 1 || url.searchParams.getAll("apof").length > 1)
    throw new Error("Duplicate or missing court identity parameters");
  const cd = url.searchParams.get("cd") || "";
  if (!/^[A-Za-z0-9]{1,64}$/.test(cd))
    throw new Error("Missing or malformed court case id (cd)");
  const apof = url.searchParams.get("apof") || "";
  if (apof && !/^\d{1,5}_\d{4}$/.test(apof))
    throw new Error("Malformed court decision number (apof)");
  if (path === DISPLAY.toLowerCase() && !apof)
    throw new Error("Decision display URL must contain apof=NUMBER_YEAR");
  const ref = apof ? "ΑΠ " + Number(apof.split("_")[0]) + "/" + apof.split("_")[1] : null;
  const display = new URL(DISPLAY, COURT);
  display.searchParams.set("cd", cd);
  if (apof) display.searchParams.set("apof", apof);
  const json = new URL(JSON_PATH, COURT);
  json.searchParams.set("cd", cd);
  return { cd, ref, displayUrl: display.href, jsonUrl: json.href, inputKind: path === DISPLAY.toLowerCase() ? "display" : "json" };
}

function refFromText(text) {
  const m = /(?:^|\n)\s*Αριθμός\s+0*(\d{1,5})\s*\/\s*(\d{4})\b/iu.exec(String(text));
  if (!m) throw new Error("REG: missing decision heading");
  return "ΑΠ " + Number(m[1]) + "/" + m[2];
}

function completeDecision(text, source, expectedRef) {
  const ref = refFromText(text);
  if (expectedRef && ref !== expectedRef)
    throw new Error("REG: case id / decision number mismatch");
  const display = new URL(source.displayUrl);
  if (!display.searchParams.has("apof"))
    display.searchParams.set("apof", ref.replace("ΑΠ ", "").replace("/", "_"));
  const officialUrl = display.href;
  const body = decisionBodyAgent(String(text).normalize("NFC"), ref);
  validateDecisionText({ ref, area: "civil", url: officialUrl }, body);
  const publication = publicationDateAgent(body);
  if (!publication.publishedAt)
    throw new Error("REG: decision publication date is missing or cannot be verified");
  return { ref, officialUrl, body, publishedAt: publication.publishedAt };
}

async function getBounded(url, fetchImpl, timeoutMs, maxBytes) {
  const res = await fetchImpl(url, {
    method: "GET", redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: "application/json, text/html;q=0.9", "user-agent": "NomikosArogos-REG/1.0 (single decision retrieval)" },
  });
  if (!res.ok) throw new Error("Court endpoint HTTP " + res.status);
  if (res.url) {
    const u = new URL(res.url);
    if (u.protocol !== "https:" || !["www.areiospagos.gr", "areiospagos.gr"].includes(u.hostname.toLowerCase()))
      throw new Error("REG: redirected outside the official court");
  }
  const declaredLength = Number(res.headers?.get?.("content-length") || 0);
  if (declaredLength > maxBytes) throw new Error("REG: court response exceeds size limit");
  const reader = res.body?.getReader?.();
  let bytes;
  if (reader) {
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("REG: court response exceeds size limit");
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error("REG: court response exceeds size limit");
  }
  return { bytes, contentType: res.headers?.get?.("content-type") || "" };
}

function decodeCourtHtml(bytes, contentType) {
  const header = new TextDecoder("latin1").decode(bytes.slice(0, 2048));
  const declared = /charset=([\w-]+)/i.exec(contentType)?.[1] || /<meta[^>]+charset=["']?([\w-]+)/i.exec(header)?.[1];
  const decode = (encoding) => { try { return new TextDecoder(encoding).decode(bytes); } catch { return null; } };
  let text = decode(declared || "utf-8") || "";
  if (text.includes("�")) text = decode("windows-1253") || text;
  return text;
}

function courtHtmlToText(html) {
  return String(html).replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractUnverifiedReferences(body) {
  const decisions = [...new Set([...String(body).matchAll(/(?<![\p{L}\p{N}])(?:ΟλΑΠ|ΑΠ)\s+\d{1,5}\/\d{4}(?![\p{L}\p{N}])/gu)].map((m) => m[0]))];
  const statutes = [...new Set([...String(body).matchAll(/(?:άρθρ(?:ο|α|ων)?|αρθρ\.)\s*\d{1,4}\s*(?:§\s*\d+)?\s*(?:ΑΚ|ΚΠολΔ|ΠΚ|ΚΠΔ)/giu)].map((m) => m[0]))];
  return { citedDecisions: decisions.slice(0, 100), citedStatutes: statutes.slice(0, 100), verifiedIndividually: false };
}

export async function retrieveCourtDecision(sourceUrl, { fetchImpl = fetch, timeoutMs = 10000, maxBytes = MAX_BYTES, allowHtmlFallback = true, expectedRef = null } = {}) {
  const source = inspectCourtSourceUrl(sourceUrl);
  if (expectedRef && source.ref && expectedRef !== source.ref)
    throw new Error("REG: requested decision differs from supplied official link");
  let jsonFailure;
  try {
    const { bytes } = await getBounded(source.jsonUrl, fetchImpl, timeoutMs, maxBytes);
    const data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!data || data.status !== "success" || typeof data.document_text !== "string" || data.document_text.length < 1500)
      throw new Error("REG: JSON status or full text invalid");
    if (data.case_id !== source.cd || data.court !== "Areios Pagos")
      throw new Error("REG_INTEGRITY: JSON case identity or court mismatch");
    const verified = completeDecision(data.document_text, source, expectedRef || source.ref);
    return { ...verified, transport: "official_json", ...extractUnverifiedReferences(verified.body) };
  } catch (error) {
    if (String(error.message).startsWith("REG_INTEGRITY:") || String(error.message).includes("case id / decision number mismatch"))
      throw error; // A contradictory identity is not a transient transport failure.
    jsonFailure = error;
  }
  if (!allowHtmlFallback || !source.ref || source.inputKind !== "display")
    throw new Error("REG: JSON retrieval rejected: " + jsonFailure.message);
  try {
    const { bytes, contentType } = await getBounded(source.displayUrl, fetchImpl, timeoutMs, maxBytes);
    const text = courtHtmlToText(decodeCourtHtml(bytes, contentType));
    if (text.length < 1500) throw new Error("REG: HTML body too short");
    const verified = completeDecision(text, source, expectedRef || source.ref);
    return { ...verified, transport: "official_html_fallback", ...extractUnverifiedReferences(verified.body) };
  } catch (error) {
    throw new Error("REG: JSON failed (" + jsonFailure.message + "); official HTML failed (" + error.message + ")");
  }
}
