// Retrieve exact historic Code article; never substitute new text for an older estate.
import { pool } from "./db.js";

export async function fetchInheritanceArticle(temporal) {
  if (!temporal || temporal.issue !== "renunciation_annulment" ||
      !["legacy", "reformed"].includes(temporal.status)) return [];
  const article = temporal.status === "legacy" ? "1857" : "1855";
  const sql = [
    "SELECT content FROM chunks",
    "WHERE source = 'code' AND code_name = 'Αστικός Κώδικας'",
    "AND article = $1 AND (review_status IS NULL OR review_status = 'approved')",
    "ORDER BY id LIMIT 10",
  ].join("\n");
  try {
    const { rows } = await pool.query(sql, [article]);
    if (!rows?.length) return [];
    const fullText = rows.map((r) => String(r.content || "")).join("\n\n");
    const normalized = fullText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (!normalized.includes("αμετακλητ") || !normalized.includes("αποποι") ||
        !(normalized.includes("πλαν") || normalized.includes("απατ"))) return [];
    return [{ ref: "Αστικός Κώδικας άρθρο " + article, text: fullText, anchored: true }];
  } catch (err) {
    console.error("Applicable historic Code article unavailable:", err?.name || "error");
    return [];
  }
}
