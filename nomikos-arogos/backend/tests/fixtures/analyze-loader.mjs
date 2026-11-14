// Loaded only by the isolated HTTP regression child process.
const services = new URL("./analyze-services.mjs", import.meta.url).href;
const backend = new URL("../../", import.meta.url);
const files = new Set(["retrieve.js", "auth.js", "adminDecisions.js", "caseLawResearch.js", "applicableLawSource.js", "db.js", "legalHistoryStore.js", "agents.js"]
  .map(file => new URL(file, backend).href));
export async function resolve(specifier, context, nextResolve) {
  if (["@anthropic-ai/sdk", "openai"].includes(specifier) ||
      (context.parentURL && files.has(new URL(specifier, context.parentURL).href))) {
    return { url: services, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
