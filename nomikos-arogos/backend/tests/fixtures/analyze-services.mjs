// Test-only upstream services. No credentials, outbound calls or real case files.
export const state = { sources: [], analysis: "", verdict: "supported", docFacts: null, analysisCalls: 0, reviewCalls: 0 };
export default class Client {
  messages = { create: async ({ max_tokens }) => {
    if (max_tokens >= 4000) {
      state.analysisCalls++;
      return { content: [{ type: "text", text: state.analysis }] };
    }
    return { content: [{ type: "text", text: "ποινή, προθεσμία" }] };
  } };
  chat = { completions: { create: async () => {
    state.reviewCalls++;
    return { choices: [{ message: { content: JSON.stringify({ verdict: state.verdict, flags: [], note: "Synthetic source check" }) } }] };
  } } };
}
export const retrieveSources = async () => state.sources;
export const requireAuth = (req, res, next) => {
  if (req.headers.authorization !== "Bearer synthetic-test-session") return res.status(401).json({ error: "Authentication required" });
  req.user = { id: "synthetic-user" };
  next();
};
export const adminDecisions = (_req, _res, next) => next();
export const researchCaseLaw = async () => null;
export const fetchInheritanceArticle = async () => [];
export const pool = { query: async () => ({ rows: [] }) };
export const ensureFeedbackSchema = async () => {};
export const ensureFeederSchema = async () => {};
export const ensureLegalHistorySchema = async () => {};
export const loadApprovedLegalHistory = async () => ({ rules: [], versions: [] });
export const documentAgent = async () => state.docFacts;
export const docFactsBlock = () => "Synthetic document facts";
export const intakeAgent = async () => ({ ask: false });
export const intakeReply = () => "Synthetic intake";
export const sourceChecker = async (_client, { sources }) => ({ sources, dropped: 0 });
export const currencyAgent = async () => ({});
