// Source identity checks before a court decision can enter the legal index.
// The URL in a manifest is a claimed identity, NOT evidence of the content.
export function validateDecisionManifestEntry(d) {
  const m = /^ΑΠ\s+(\d{1,5})\/(\d{4})$/u.exec(String(d?.ref || "").trim());
  if (!m) throw new Error("Only specific Άρειος Πάγος decisions in ΑΠ N/YYYY format are accepted");
  let u;
  try { u = new URL(d.url); } catch { throw new Error("Decision URL is invalid"); }
  if (u.protocol !== "https:" || !["www.areiospagos.gr", "areiospagos.gr"].includes(u.hostname.toLowerCase()) ||
      u.pathname.toLowerCase() !== "/nomologia/apofaseis_display.asp")
    throw new Error("Not an allowlisted official decision URL");
  if (u.searchParams.get("apof") !== `${Number(m[1])}_${m[2]}`)
    throw new Error("Decision reference does not match URL identifier");
  if (!["civil", "criminal"].includes(d.area)) throw new Error("Invalid decision area");
  return { ref: `ΑΠ ${Number(m[1])}/${m[2]}`, url: u.href };
}

const strip = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function validateDecisionText(d, text) {
  const { ref } = validateDecisionManifestEntry(d);
  const m = /^ΑΠ\s+(\d+)\/(\d{4})$/u.exec(ref);
  const head = strip(text).slice(0, 10000);
  // Check the FIRST document-number heading, not a number merely cited later.
  // This avoids accepting a 1496/2023 page because it incidentally cites 1497/2023.
  const h = /(?:αριθμος|αριθμ\.)\s*(?:αποφασης\s*)?[:.]?\s*0*(\d{1,5})\s*\/\s*(\d{4})(?!\d)/u.exec(head);
  if (!h || Number(h[1]) !== Number(m[1]) || h[2] !== m[2])
    throw new Error("First decision heading does not match manifest reference");
  return true;
}

// Admin-only intake for an exact official URL (not crawling court summaries/indexes).
export function candidateFromOfficialUrl(url, area) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('Not a valid URL'); }
  const apof = parsed.searchParams.get('apof') || '';
  const m = /^(\d{1,5})_(\d{4})$/.exec(apof);
  if (!m) throw new Error('Official URL must contain apof=NUMBER_YEAR');
  const candidate = {
    ref: 'ΑΠ ' + Number(m[1]) + '/' + m[2],
    court: 'Άρειος Πάγος',
    area, url,
  };
  validateDecisionManifestEntry(candidate);
  return candidate;
}
