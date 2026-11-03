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

// CLI: node feeder.js --file ./pdfs/x.pdf --fek 20220100203 --law "ν. 4985/2022" --area criminal
//        [--title "..."] [--published 2022-10-27]
// Used to ingest a ΦΕΚ PDF supplied by an administrator (e.g. when the download link is unavailable).
export function parseIngestFileArgs(argv) {
  const get = (name) => {
    const i = argv.indexOf(name);
    return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : undefined;
  };
  const o = { file: get("--file"), fek: get("--fek"), law: get("--law"), area: get("--area"), title: get("--title"), publishedAt: get("--published") };
  if (!o.file) throw new Error("--file <path to ΦΕΚ PDF> is required");
  if (!parseFekId(o.fek)) throw new Error("--fek must be the 11-digit ΦΕΚ id, e.g. 20220100203 (ΦΕΚ Α' 203/2022)");
  if (!/^ν\.\s*\d{1,5}\/\d{4}$/u.test(o.law || "")) throw new Error('--law must look like "ν. 4985/2022"');
  if (!["civil", "criminal"].includes(o.area)) throw new Error("--area must be civil or criminal");
  if (o.publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(o.publishedAt)) throw new Error("--published must be YYYY-MM-DD");
  return o;
}
