// auth.js — verify the caller's Supabase session before running the (costly) AI pipeline.
//
// Verifies the access token from `Authorization: Bearer <token>`. Handles BOTH signing schemes:
//   • asymmetric (ES256/RS256) — verified against the project's public JWKS endpoint
//   • legacy symmetric (HS256) — verified with the project's JWT secret, if SUPABASE_JWT_SECRET is set
// so it works regardless of which signing key the Supabase project uses. On failure it logs the
// reason (visible in Railway deploy logs) to make diagnosis easy.

import { createRemoteJWKSet, jwtVerify } from "jose";

const { SUPABASE_URL, SUPABASE_JWT_SECRET } = process.env;
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");

const base = SUPABASE_URL.replace(/\/+$/, "");
const JWKS = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
const HS256 = SUPABASE_JWT_SECRET ? new TextEncoder().encode(SUPABASE_JWT_SECRET) : null;

async function verifyToken(token) {
  // Asymmetric first (the modern default).
  try {
    const { payload } = await jwtVerify(token, JWKS, { audience: "authenticated" });
    return payload;
  } catch (e) {
    // Fall back to legacy HS256 shared-secret verification, if configured.
    if (HS256) {
      const { payload } = await jwtVerify(token, HS256, { audience: "authenticated" });
      return payload;
    }
    throw e;
  }
}

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const payload = await verifyToken(token);
    if (!payload.sub) return res.status(401).json({ error: "Invalid session" });

    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (e) {
    console.error("auth verify failed:", e?.code || e?.message); // shows up in Railway logs
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
