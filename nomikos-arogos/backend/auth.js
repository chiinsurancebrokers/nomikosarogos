// auth.js — verify the caller's Supabase session before running the (costly) AI pipeline.
//
// The frontend sends the user's access token:  Authorization: Bearer <access_token>
// (get it client-side with `const { data } = await supabase.auth.getSession()` →
//  data.session.access_token).
//
// We verify with getClaims(), which checks the token against the project's JWKS
// (asymmetric keys) locally — fast, no round-trip per request — and falls back to a
// server check for legacy HS256 projects. No service-role key needed here.

import { createClient } from "@supabase/supabase-js";

const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY");
}

// A verification-only client (anon/publishable key is enough to read the JWKS).
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) return res.status(401).json({ error: "Authentication required" });

    const { data, error } = await supabase.auth.getClaims(token);
    const claims = data?.claims;
    if (error || !claims?.sub) {
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Minimal, non-sensitive identity for downstream use (rate-limiting, ownership).
    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch {
    return res.status(401).json({ error: "Authentication failed" });
  }
}
