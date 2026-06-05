// embeddings.js — turn text into vectors for retrieval.
//
// Default: OpenAI text-embedding-3-small (1536 dims) — cheap, decent multilingual.
// For better Greek legal retrieval, consider Cohere embed-multilingual-v3.0 or
// Voyage voyage-3 (swap the call below). If you change the model, change EMBED_DIM
// to match and re-create the table (the vector column is fixed-width).

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
export const EMBED_DIM = parseInt(process.env.EMBED_DIM || "1536", 10); // small=1536, large=3072

export async function embed(texts) {
  const input = Array.isArray(texts) ? texts : [texts];
  const res = await openai.embeddings.create({ model: EMBED_MODEL, input });
  return res.data.map((d) => d.embedding);
}
