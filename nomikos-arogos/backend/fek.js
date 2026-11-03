// fek.js — Government Gazette (ΦΕΚ) helpers. Pure functions + one download function.
//
// A ΦΕΚ id is 11 digits: YYYY + TT + NNNNN, e.g. 20250200449 = 2025, issue type 02 (Β), no. 449.
// Issue type 01 is ΦΕΚ Α (laws, presidential decrees, legislative acts) — the one we follow.
// Numbers within a year are sequential, so "what is new?" = probe the next number(s) after the last
// one we processed; the first miss means nothing newer has been published yet.
//
// The download URL is configurable because it is an external dependency: set FEK_URL_TEMPLATE with
// an {id} placeholder. Verify the default against https://www.et.gr before relying on it.

export const DEFAULT_FEK_URL_TEMPLATE = "https://www.et.gr/api/DownloadFeksApi/?fek_pdf={id}";

export function fekId(year, issueType, number) {
  const y = String(year);
  const t = String(issueType).padStart(2, "0");
  const n = String(number).padStart(5, "0");
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(t) || !/^\d{5}$/.test(n)) throw new Error(`bad ΦΕΚ parts: ${year}/${issueType}/${number}`);
  return `${y}${t}${n}`;
}

export function parseFekId(id) {
  const m = /^(\d{4})(\d{2})(\d{5})$/.exec(String(id));
  return m ? { year: Number(m[1]), issueType: Number(m[2]), number: Number(m[3]) } : null;
}

export function fekUrl(id, template = process.env.FEK_URL_TEMPLATE || DEFAULT_FEK_URL_TEMPLATE) {
  return template.replace("{id}", encodeURIComponent(id));
}

// Years to probe on a run: the current year, plus the previous one in January so late
// publications from December are not missed.
export function yearsToProbe(now = new Date()) {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() === 0 ? [y - 1, y] : [y];
}

export const isPdf = (buf) => buf.length > 1024 && buf.subarray(0, 5).toString("latin1") === "%PDF-";

// Returns { status: "ok", buf } | { status: "missing" } | { status: "error", message }.
// "missing" = the gazette has not published that number (404, empty or non-PDF body).
export async function downloadFek(id, { fetchImpl = fetch, timeoutMs = 60000 } = {}) {
  try {
    const res = await fetchImpl(fekUrl(id), { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
    if (res.status === 404 || res.status === 204) return { status: "missing" };
    if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    return isPdf(buf) ? { status: "ok", buf } : { status: "missing" };
  } catch (e) {
    return { status: "error", message: e?.message || String(e) };
  }
}
