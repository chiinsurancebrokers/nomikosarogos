// Usage: npm run evals -- ./evals/answers.json [--suite inheritance|criminal]
// Format: { "cases": { "id": { "analysis": "...", "retrievedSources": [] } } }
// Runs NO model calls and never uploads private answers. Do not commit real case
// responses or party names to a public repository.
import fs from "node:fs/promises";
import { gradeSuite } from "./rubric.js";

const suiteAt = process.argv.indexOf("--suite");
const suiteName = suiteAt > 0 ? process.argv[suiteAt + 1] : "inheritance";
if (!/^[a-z]+$/.test(suiteName)) throw new Error("Invalid suite name");
const suite = JSON.parse(await fs.readFile(new URL(`./${suiteName}.json`, import.meta.url), "utf8"));
const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run evals -- ./evals/answers.json");
  process.exitCode = 2;
} else {
  try {
    const results = JSON.parse(await fs.readFile(file, "utf8"));
    const scores = gradeSuite(suite, results.cases || {});
    console.log(JSON.stringify(scores, null, 2));
    if (scores.passed !== scores.total) process.exitCode = 1;
  } catch (e) {
    console.error("Could not evaluate recorded answers:", e.message);
    process.exitCode = 2;
  }
}
