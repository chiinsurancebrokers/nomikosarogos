// auth.js — verify the caller's Supabase session before running the (costly) AI pipeline.
//
// The frontend sends the user's access token:  Authorization: Bearer <access_token>
// (client-side: `const { data } = await supabase.auth.getSession()` → data.session.access_token).
//
// A backend only needs to verify the token's signature against Supabase's PUBLIC keys, so we
// do exactly that with `jose` against the project's JWKS endpoint — no Supabase SDK, no
// realtime/websocket client, and therefore no Node-version requirement. Keys are cached and
// rotation is handled automatically. This assumes asymmetric signing keys (ES256/RS256), the
// default for Supabase projects created since May 2025.

import { createRemoteJWKSet, jwtVerify } from "jose";

const { SUPABASE_URL } = process.env;
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");

const base = SUPABASE_URL.replace(/\/+$/, "");
const ISSUER = `${base}/auth/v1`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: "authenticated",
    });
    if (!payload.sub) return res.status(401).json({ error: "Invalid session" });

    // Minimal, non-sensitive identity for downstream use (rate-limiting, ownership).
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
