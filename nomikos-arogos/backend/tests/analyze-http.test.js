import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

test("real analyze HTTP pipeline with isolated synthetic upstream services", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--import", fileURLToPath(new URL("./fixtures/analyze-bootstrap.mjs", import.meta.url)),
    fileURLToPath(new URL("./fixtures/analyze-scenarios.mjs", import.meta.url)),
  ], { env: { ...process.env, PORT: "0", ANTHROPIC_API_KEY: "synthetic", OPENAI_API_KEY: "synthetic" }, timeout: 15000 });
  assert.match(stdout, /HTTP regressions passed/);
});
