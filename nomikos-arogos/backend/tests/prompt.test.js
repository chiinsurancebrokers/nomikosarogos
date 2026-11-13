import test from "node:test";
import assert from "node:assert/strict";

// server.js starts the app on import, so load only the prompt builder's text by importing lazily
// with a dummy environment.
process.env.DATABASE_URL ||= "postgres://x:x@localhost:5432/x";
process.env.NODE_ENV = "test";

test("system prompt forbids unverified operational facts and asks for concrete steps", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /OPERATIONAL FACTS/);
  assert.match(src, /Never present an unverified service or number as fact/);
  assert.match(src, /police holding cell versus a prison/);
});

test("lawyer mode adds technical sections and keeps the grounding rules", async () => {
  const src = (await import("node:fs")).readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(src, /LAWYER MODE/);
  assert.match(src, /Time limits and preclusion/);
  assert.match(src, /Counter-arguments and risks/);
  assert.match(src, /never fill the gap from memory/);
  assert.match(src, /audience === "lawyer"/);
});
