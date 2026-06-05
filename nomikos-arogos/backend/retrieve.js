// retrieve.js — the real retrieveSources(). Drop-in replacement for the stub in server.js.
// Embeds the question, runs a cosine nearest-neighbour search in pgvector, returns the
// top-k chunks with a citable reference and their actual text (so the model and the
// verifier are anchored to real law).

import { embed } from "./embeddings.js";
import { pool } from "./db.js";

export async function retrieveSources(question, area, k = Number(process.env.RETRIEVE_K) || 16) {
  if (!question || !question.trim()) return [];
  const [qvec] = await embed(question);
  const vecLiteral = `[${qvec.join(",")}]`;

  const useFilter = area === "civil" || area === "criminal" || area === "admin";
  const sql = `
    SELECT code_name, area, article, decision, content,
           1 - (embedding <=> $1) AS score
    FROM chunks
    ${useFilter ? "WHERE area = $3" : ""}
    ORDER BY embedding <=> $1
    LIMIT $2`;
  const params = useFilter ? [vecLiteral, k, area] : [vecLiteral, k];

  const { rows } = await pool.query(sql, params);
  return rows.map((r) => ({
    ref: r.article
      ? `${r.code_name} άρθρο ${r.article}`
      : r.decision
      ? r.decision
      : r.code_name,
    text: r.content,
    score: r.score,
  }));
}
