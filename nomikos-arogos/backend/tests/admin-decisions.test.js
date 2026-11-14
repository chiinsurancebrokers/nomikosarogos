import test from "node:test";
import assert from "node:assert/strict";
process.env.SUPABASE_URL ||= "https://example.supabase.co";
process.env.DATABASE_URL ||= "postgres://u:p@localhost:5432/x";
process.env.OPENAI_API_KEY ??= "test";
const { requireAdmin, safeEqual } = await import("../adminDecisions.js");

const run = (header) => {
  const out = {};
  const res = { status(c) { out.code = c; return this; }, json(b) { out.body = b; return this; } };
  let nexted = false;
  requireAdmin({ headers: { authorization: header } }, res, () => { nexted = true; });
  return { ...out, nexted };
};

test("admin API is off (404) without a strong ADMIN_TOKEN", () => {
  delete process.env.ADMIN_TOKEN;
  assert.equal(run("Bearer x").code, 404);
  process.env.ADMIN_TOKEN = "short";
  assert.equal(run("Bearer short").code, 404);
});
test("admin API rejects wrong token and accepts the right one", () => {
  process.env.ADMIN_TOKEN = "a".repeat(32);
  assert.equal(run("Bearer nope").code, 401);
  assert.equal(run(undefined).code, 401);
  assert.equal(run("Bearer " + "a".repeat(32)).nexted, true);
});
test("safeEqual compares different lengths safely", () => {
  assert.equal(safeEqual("a", "aa"), false);
  assert.equal(safeEqual("abc", "abc"), true);
});
