import { createRemoteJWKSet, jwtVerify } from "jose";

const { SUPABASE_URL, SUPABASE_JWT_SECRET } = process.env;
if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");

const base = SUPABASE_URL.replace(/\/+$/, "");
const JWKS = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
const HS256 = SUPABASE_JWT_SECRET ? new TextEncoder().encode(SUPABASE_JWT_SECRET) : null;

async function verifyToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWKS, { audience: "authenticated" });
    return payload;
  } catch (e) {
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
    console.error("auth verify failed:", e?.code || e?.message);
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
