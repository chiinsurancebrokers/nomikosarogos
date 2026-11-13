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
  const head = strip(text).slice(0, 3500);
  // A casual citation inside the body is NOT enough to establish document identity.
  const pattern = new RegExp(`(?:αριθμος|αριθμ\\.|απ|α\\.π\\.)\\s*[:.]?\\s*0*${Number(m[1])}\\s*\\/\\s*${m[2]}(?!\\d)`, "u");
  if (!pattern.test(head)) throw new Error("Decision number/year not confirmed in the document header");
  return true;
}
