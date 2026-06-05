// db.js — Postgres + pgvector. On Railway, add a Postgres service; it provides DATABASE_URL.
// pgvector must be available (Railway's Postgres supports `CREATE EXTENSION vector`).

import pg from "pg";
import { EMBED_DIM } from "./embeddings.js";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});

export async function initSchema() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id        BIGSERIAL PRIMARY KEY,
      source    TEXT NOT NULL,          -- 'code' | 'decisions'
      code_name TEXT NOT NULL,          -- e.g. 'Αστικός Κώδικας'
      area      TEXT NOT NULL,          -- 'civil' | 'criminal' | 'admin'
      article   TEXT,                   -- e.g. '197'
      decision  TEXT,                   -- e.g. 'ΑΠ 1234/2020'
      content   TEXT NOT NULL,
      embedding vector(${EMBED_DIM})
    )`);
  // HNSW needs pgvector >= 0.5. If your version is older, use ivfflat instead:
  //   CREATE INDEX ... USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops)"
  );
  await pool.query("CREATE INDEX IF NOT EXISTS chunks_area_idx ON chunks (area)");
}

// Stores 👍/👎 on answers so you can find which questions got weak answers and improve.
// NOTE: `question` can contain personal data — see the privacy note in the README.
export async function ensureFeedbackSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS feedback (
      id         BIGSERIAL PRIMARY KEY,
      user_id    TEXT,
      rating     TEXT NOT NULL,          -- 'up' | 'down'
      area       TEXT,
      mode       TEXT,
      question   TEXT,
      answer     TEXT,
      sources    JSONB,
      comment    TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    )`);
}
