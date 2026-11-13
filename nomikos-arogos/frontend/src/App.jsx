import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "./supabaseClient";

const API_URL = import.meta.env.VITE_API_URL || "";

const T = {
  el: {
    brand: "ΝΟΜΙΚΟΣ ΑΡΩΓΟΣ", name: "Νομικός Αρωγός", online: "● Σε σύνδεση",
    eyebrow: "ΝΟΜΙΚΗ ΠΛΗΡΟΦΟΡΗΣΗ, ΜΕ ΤΕΚΜΗΡΙΩΣΗ",
    headline: ["Γνωρίστε τον Αρωγό.", "Κατανοήστε τα δικαιώματά σας", "πριν αποφασίσετε."],
    lead: "Περιγράψτε το ζήτημά σας. Ο Αρωγός εντοπίζει τα σχετικά άρθρα των ελληνικών Κωδίκων, ελέγχει τις πηγές του και σας εξηγεί με απλά λόγια — χωρίς να επινοεί νόμους.",
    trust: ["Απαντήσεις μόνο από τους Κώδικες", "Έλεγχος πηγών και επικαιρότητας", "Δωρεάν νομική βοήθεια όπου δικαιούστε"],
    notLawyer: "Πληροφόρηση — όχι νομική συμβουλή",
    signInTitle: "Σύνδεση", signInSub: "Δώστε το email σας για να λάβετε έναν κωδικό μιας χρήσης.",
    email: "Email", sendCode: "Αποστολή κωδικού", codeLabel: "Κωδικός από το email",
    verify: "Σύνδεση", sending: "Αποστολή…", verifying: "Έλεγχος…",
    codeSent: "Σας στείλαμε έναν κωδικό. Ελέγξτε το email σας.",
    signOut: "Αποσύνδεση", authExpired: "Η συνεδρία έληξε. Συνδεθείτε ξανά.",
    civil: "Αστικό Δίκαιο", criminal: "Ποινικό Δίκαιο", unsure: "Δεν είμαι σίγουρος/η",
    steps: ["1 Περιγραφή", "2 Έλεγχος πηγών", "3 Καθοδήγηση"],
    placeholder: "Περιγράψτε με απλά λόγια τι συμβαίνει…",
    chatPlaceholder: "Γράψτε το μήνυμά σας…",
    lawyer: "Λειτουργία δικηγόρου (τεχνική ανάλυση)", citWarnT: "Παραπομπές σε νομολογία που δεν επαληθεύτηκαν",
    citMissing: "Δεν υπάρχουν στις πηγές μου (πιθανώς ανακριβείς)", citSecond: "Αναφέρονται μόνο μέσα σε άλλη απόφαση (δεν διαβάστηκαν)",
    deep: "Εκτενής ανάλυση", attach: "Επισύναψη", remove: "Αφαίρεση",
    send: "Αποστολή", newChat: "Νέα συνομιλία", asking: "Αναζήτηση και έλεγχος πηγών",
    startHint: "Διαλέξτε τομέα και περιγράψτε το ζήτημά σας — μετά μπορείτε να συνεχίσετε τη συζήτηση.",
    sourcesT: "Πηγές", verifyT: "Έλεγχος δεύτερου μοντέλου",
    verdicts: { supported: "Επιβεβαιωμένο από τις πηγές", partially_supported: "Εν μέρει επιβεβαιωμένο", unsupported: "Μη επιβεβαιωμένο — προσοχή", unverified: "Δεν ελέγχθηκε" },
    fbQ: "Σας βοήθησε αυτή η απάντηση;", fbYes: "Ναι", fbNo: "Όχι",
    fbThanks: "Ευχαριστούμε για την ανατροφοδότηση.",
    fbCommentPh: "Τι έλειπε ή τι ήταν λάθος; (προαιρετικό)", fbSend: "Αποστολή",
    aidT: "Δωρεάν Νομική Βοήθεια (ν. 3226/2004)",
    aidBody: "Αν έχετε χαμηλό εισόδημα, δικαιούστε δωρεάν δικηγόρο μέσω του Δικηγορικού Συλλόγου της περιοχής σας.",
    aidCta: "Βρείτε τον Δικηγορικό Σύλλογό σας",
    deadlineT: "Προσοχή στις προθεσμίες",
    deadlineBody: "Πολλά δικαιώματα χάνονται αν περάσει η προθεσμία. Αν υπάρχει έγγραφο με ημερομηνία, μιλήστε ΑΜΕΣΑ με δικηγόρο.",
    codesT: "Επίσημοι Κώδικες", courtsT: "Νομολογία",
    disTitle: "Πριν ξεκινήσετε", disOk: "Κατάλαβα, συνέχεια",
    disBody: "Γενική νομική πληροφόρηση βασισμένη στους ελληνικούς Κώδικες. ΔΕΝ είναι δικηγόρος και δεν αντικαθιστά τη νομική συμβουλή. Επαληθεύστε τα άρθρα και απευθυνθείτε σε δικηγόρο. Μην εισάγετε ευαίσθητα προσωπικά δεδομένα.",
    err: "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.",
    tooBig: "Το αρχείο είναι πολύ μεγάλο (μέγιστο 20MB). Δοκιμάστε μικρότερο αρχείο ή λιγότερες σελίδες.",
    agentIntake: "Διευκρίνιση", agentDoc: "Ανάγνωση εγγράφου", agentSources: "Έλεγχος πηγών",
    agentCurrency: "Έλεγχος επικαιρότητας",
    sourcesDropped: (k, d) => `${k} πηγές κρατήθηκαν · ${d} άσχετες αφαιρέθηκαν`,
    sourcesKept: (k) => `${k} πηγές ελέγχθηκαν`,
    docT: "Τι διάβασα στο έγγραφό σας", docDeadlines: "Προθεσμίες",
    currencyT: "Πιθανή τροποποίηση νόμου", currentThrough: "Κείμενο ενοποιημένο έως",
  },
  en: {
    brand: "LEGAL COMPANION", name: "Legal Companion", online: "● Online",
    eyebrow: "LEGAL INFORMATION, WITH EVIDENCE",
    headline: ["Meet your Companion.", "Understand your rights", "before you decide."],
    lead: "Describe your situation. The Companion finds the relevant articles in the Greek Codes, checks its own sources and explains them in plain language — without inventing law.",
    trust: ["Answers only from the Codes", "Source and currency checks", "Free legal aid where you qualify"],
    notLawyer: "Information — not legal advice",
    signInTitle: "Sign in", signInSub: "Enter your email to receive a one-time code.",
    email: "Email", sendCode: "Send code", codeLabel: "Code from your email",
    verify: "Sign in", sending: "Sending…", verifying: "Checking…",
    codeSent: "We sent you a code. Check your email.",
    signOut: "Sign out", authExpired: "Session expired. Please sign in again.",
    civil: "Civil Law", criminal: "Criminal Law", unsure: "I'm not sure",
    steps: ["1 Describe", "2 Check sources", "3 Guidance"],
    placeholder: "Describe in plain words what is happening…",
    chatPlaceholder: "Type your message…",
    lawyer: "Lawyer mode (technical analysis)", citWarnT: "Case-law citations that could not be verified",
    citMissing: "Not in my sources (possibly inaccurate)", citSecond: "Only cited inside another decision (not read)",
    deep: "Extended analysis", attach: "Attach", remove: "Remove",
    send: "Send", newChat: "New conversation", asking: "Searching and checking sources",
    startHint: "Pick an area and describe your situation — then you can keep the conversation going.",
    sourcesT: "Sources", verifyT: "Second-model check",
    verdicts: { supported: "Supported by sources", partially_supported: "Partially supported", unsupported: "Unsupported — caution", unverified: "Not checked" },
    fbQ: "Did this answer help you?", fbYes: "Yes", fbNo: "No",
    fbThanks: "Thank you for the feedback.",
    fbCommentPh: "What was missing or wrong? (optional)", fbSend: "Send",
    aidT: "Free Legal Aid (Law 3226/2004)",
    aidBody: "If you are low-income, you are entitled to a free lawyer through your local Bar Association.",
    aidCta: "Find your local Bar Association",
    deadlineT: "Mind the deadlines",
    deadlineBody: "Many rights are lost once a deadline passes. If you hold a dated document, speak to a lawyer IMMEDIATELY.",
    codesT: "Official Codes", courtsT: "Case law",
    disTitle: "Before you start", disOk: "I understand, continue",
    disBody: "General legal information based on the Greek Codes. NOT a lawyer and no substitute for legal advice. Verify articles and consult a lawyer. Do not enter sensitive personal data.",
    err: "Something went wrong. Please try again.",
    tooBig: "The file is too large (max 20MB). Please try a smaller file or fewer pages.",
    agentIntake: "Clarifying", agentDoc: "Document read", agentSources: "Source check",
    agentCurrency: "Currency check",
    sourcesDropped: (k, d) => `${k} sources kept · ${d} unrelated removed`,
    sourcesKept: (k) => `${k} sources checked`,
    docT: "What I read in your document", docDeadlines: "Deadlines",
    currencyT: "Law may have been amended", currentThrough: "Text consolidated through",
  },
};

const EXAMPLES = {
  el: {
    civil: ["Ο ιδιοκτήτης δεν μου επιστρέφει την εγγύηση.", "Προϊόν ήρθε ελαττωματικό και το κατάστημα αρνείται επιστροφή.", "Τι δικαιούμαι από κληρονομιά χωρίς διαθήκη;"],
    criminal: ["Με κατηγορούν για κάτι που δεν έκανα.", "Θέλω να υποβάλω μήνυση για απειλές.", "Τι σημαίνει αυτόφωρο;"],
    unsure: ["Ο γείτονας έχτισε κάτι που με εμποδίζει.", "Δέχομαι παρενόχληση στη δουλειά."],
  },
  en: {
    civil: ["My landlord won't return my deposit.", "A product arrived defective and the shop refuses a refund.", "What am I entitled to from an inheritance with no will?"],
    criminal: ["I'm accused of something I didn't do.", "I want to file a complaint about threats.", "What does 'αυτόφωρο' mean?"],
    unsure: ["My neighbour built something blocking me.", "I'm being harassed at work."],
  },
};

const CODES = [
  ["Αστικός Κώδικας", "https://ministryofjustice.gr/wp-content/uploads/2019/10/Αστικός-Κώδικας.pdf"],
  ["Ποινικός Κώδικας", "https://ministryofjustice.gr/wp-content/uploads/2019/10/Ποινικός-Κώδικας.pdf"],
  ["Όλοι οι Κώδικες", "https://ministryofjustice.gr/?page_id=3262"],
];
const COURTS = [
  ["Άρειος Πάγος", "https://www.areiospagos.gr/"],
  ["ΣτΕ / Διοικητικά", "https://www.adjustice.gr/webcenter/portal/ste/ypiresies/nomologies"],
];

const MAX_FILE_BYTES = 20 * 1024 * 1024; // base64 inflates ~33%; server JSON limit is 35mb

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Repairs the most common malformed bold the model produces ("** text **") before rendering.
function tidyMarkdown(text) {
  // Pair `**` markers left to right and trim only the inside of each pair, so
  // `** x **` becomes `**x**` while the text between two bold spans is untouched.
  return (text || "").replace(/\*\*([^*\n]+?)\*\*/g, (m, inner) => {
    const t = inner.trim();
    return t ? `**${t}**` : m;
  });
}

function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}
      >
        {tidyMarkdown(children)}
      </ReactMarkdown>
    </div>
  );
}

function useIsMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia(`(max-width:${breakpoint}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${breakpoint}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);
  return isMobile;
}

// Shared navy panel (brand, headline, trust points) used on both the sign-in and main screens.
function LeftPanel({ t, children }) {
  return (
    <div className="left-panel">
      <div className="brand-row">{t.brand}</div>
      <div className="left-eyebrow">{t.eyebrow}</div>
      <h1 className="left-headline">
        {t.headline.map((l, i) => <React.Fragment key={i}>{l}{i < t.headline.length - 1 && <br />}</React.Fragment>)}
      </h1>
      <p className="left-lead">{t.lead}</p>
      <ul className="trust-bullets">
        {t.trust.map((x) => <li key={x}><i className="bullet-dot" /><span>{x}</span></li>)}
      </ul>
      {children}
    </div>
  );
}

// ── Auth screen ───────────────────────────────────────────────────────────────
function AuthScreen({ lang, setLang }) {
  const t = T[lang];
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function sendCode() {
    if (!email.trim() || busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setErr(error.message);
    else { setSent(true); setMsg(t.codeSent); }
  }
  async function verify() {
    if (!code.trim() || busy) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setErr(error.message);
    // success → onAuthStateChange in App sets the session
  }

  return (
    <div className="split-shell">
      <LeftPanel t={t} />
      <div className="right-panel">
        <div className="chat-card auth-card">
          <div className="chat-card-header">
            <div className="hal-dot" />
            <div className="chat-card-name">{t.name}</div>
            <div style={{ flex: 1 }} />
            <button className="ghost-btn" onClick={() => setLang(lang === "el" ? "en" : "el")}>{lang === "el" ? "EN" : "ΕΛ"}</button>
          </div>
          <div className="auth-body">
            <div className="auth-title">{t.signInTitle}</div>
            <div className="auth-sub">{t.signInSub}</div>
            <label className="field-label">{t.email}</label>
            <input className="field" value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={sent} />
            {!sent ? (
              <button className="primary-btn" onClick={sendCode} disabled={busy || !email.trim()}>{busy ? t.sending : t.sendCode}</button>
            ) : (
              <>
                <label className="field-label" style={{ marginTop: 14 }}>{t.codeLabel}</label>
                <input className="field code-field" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" />
                <button className="primary-btn" onClick={verify} disabled={busy || !code.trim()}>{busy ? t.verifying : t.verify}</button>
              </>
            )}
            {msg && <div className="note ok">{msg}</div>}
            {err && <div className="note bad">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// One assistant reply: agent trail + Markdown answer + sources + notices + feedback.
function AssistantBubble({ msg, prevUserText, area, mode, lang }) {
  const t = T[lang];
  const [fb, setFb] = useState(null); // null | 'down-open' | 'sent'
  const [fbComment, setFbComment] = useState("");
  const agents = msg.agents || {};
  const verdictClass = (v) => (v === "supported" ? "ok" : v === "partially_supported" ? "warn" : "bad");

  async function sendFeedback(rating, comment) {
    setFb("sent");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rating, comment: comment || "", area, mode, question: prevUserText || "", answer: msg.content, sources: msg.sources }),
      });
    } catch { /* best-effort */ }
  }

  const trail = [];
  if (agents.intake) trail.push(t.agentIntake);
  if (agents.document) trail.push(t.agentDoc);
  if (agents.sourceCheck) {
    trail.push(agents.sourceCheck.dropped > 0
      ? `${t.agentSources}: ${t.sourcesDropped(agents.sourceCheck.kept, agents.sourceCheck.dropped)}`
      : `${t.agentSources}: ${t.sourcesKept(agents.sourceCheck.kept)}`);
  }
  if ("currency" in agents && !agents.intake) trail.push(t.agentCurrency);

  return (
    <div className="msg hal">
      {trail.length > 0 && (
        <div className="agent-trail">{trail.map((x, i) => <span key={i} className="agent-chip">✓ {x}</span>)}</div>
      )}

      {agents.document && (
        <details className="doc-facts">
          <summary>📄 {t.docT}{agents.document.docType ? ` — ${agents.document.docType}` : ""}</summary>
          {agents.document.summary && <p>{agents.document.summary}</p>}
          {agents.document.keyFacts?.length > 0 && <ul>{agents.document.keyFacts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {agents.document.dates?.length > 0 && <ul>{agents.document.dates.map((d, i) => <li key={i}><b>{d.label}:</b> {d.date}</li>)}</ul>}
          {agents.document.deadlines?.length > 0 && <div className="doc-deadlines"><b>{t.docDeadlines}:</b> {agents.document.deadlines.join(" · ")}</div>}
        </details>
      )}

      {msg.quality?.publishDraft && msg.quality?.message && (
        <div className="callout warn">
          <b>{lang === "el" ? "Όρια τεκμηρίωσης" : "Evidence limitations"}:</b> {msg.quality.message}
        </div>
      )}
      <Markdown>{msg.content}</Markdown>

      {(msg.citations?.missing?.length > 0 || msg.citations?.secondhand?.length > 0) && (
        <div className="callout warn">
          <b>⚠️ {t.citWarnT}.</b>
          {msg.citations.missing.length > 0 && <div>{t.citMissing}: {msg.citations.missing.join(", ")}</div>}
          {msg.citations.secondhand.length > 0 && <div>{t.citSecond}: {msg.citations.secondhand.join(", ")}</div>}
        </div>
      )}

      {!msg.quality && agents.currency?.notice && (
        <div className="callout warn"><b>🕒 {t.currencyT}.</b> {agents.currency.notice}</div>
      )}

      {msg.sources?.length > 0 && (
        <div className="src-block">
          <div className="small-title">{t.sourcesT}</div>
          <div className="chips">{msg.sources.map((s, i) => {
            const link = msg.sourceLinks?.find((item) => item.ref === s);
            return link
              ? <a key={i} className="chip" href={link.url} target="_blank" rel="noopener noreferrer" title={lang === "el" ? "Επίσημη πηγή — Άρειος Πάγος" : "Official source — Supreme Court"}>{s} ↗</a>
              : <span key={i} className="chip">{s}</span>;
          })}</div>
          {agents.currency?.current?.length > 0 && (
            <div className="current-note">
              {t.currentThrough}: {agents.currency.current.map((c) => `${c.code} — ${c.through}`).join(" · ")}
            </div>
          )}
        </div>
      )}

      {msg.verification && (
        <div className="callout">
          <div className="small-title">{t.verifyT}</div>
          <div className={`verdict ${verdictClass(msg.verification.verdict)}`}>{t.verdicts[msg.verification.verdict] || msg.verification.verdict}</div>
          {msg.verification.note && <div className="verdict-note">{msg.verification.note}</div>}
          {msg.verification.flags?.length > 0 && (
            <ul className="flags">{msg.verification.flags.map((f, i) => <li key={i}>{f.claim ? `${f.claim}: ` : ""}{f.issue}</li>)}</ul>
          )}
        </div>
      )}

      {msg.disclaimer && <div className="disclaimer">{msg.disclaimer}</div>}

      {!agents.intake && (
        <div className="feedback">
          {fb === "sent" ? (
            <div className="note ok">✓ {t.fbThanks}</div>
          ) : (
            <>
              <div className="fb-row">
                <span>{t.fbQ}</span>
                <button className="ghost-btn" onClick={() => sendFeedback("up")}>👍 {t.fbYes}</button>
                <button className={`ghost-btn ${fb === "down-open" ? "active-bad" : ""}`} onClick={() => setFb("down-open")}>👎 {t.fbNo}</button>
              </div>
              {fb === "down-open" && (
                <div style={{ marginTop: 8 }}>
                  <textarea className="field" value={fbComment} onChange={(e) => setFbComment(e.target.value)} placeholder={t.fbCommentPh} rows={2} />
                  <button className="primary-btn small" onClick={() => sendFeedback("down", fbComment)}>{t.fbSend}</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MainApp({ lang, setLang, onSignOut }) {
  const t = T[lang];
  const isMobile = useIsMobile();
  const [area, setArea] = useState("civil");
  const [input, setInput] = useState("");
  const [mode, setMode] = useState("quick");
  const [audience, setAudience] = useState("citizen");
  const [docFile, setDocFile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDis, setShowDis] = useState(true);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const started = messages.length > 0;
  const last = messages[messages.length - 1];
  const stage = loading ? 2 : last && last.role === "assistant" && !last.agents?.intake ? 3 : 1;

  async function send() {
    if ((!input.trim() && !docFile) || loading) return;
    setError("");
    const userText = input.trim();
    const history = [...messages, { role: "user", content: userText || "(επισυναπτόμενο έγγραφο)" }];
    setMessages(history);
    setInput("");
    const sending = docFile;
    setDocFile(null);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(t.authExpired); setLoading(false); return; }
      let document = null;
      if (sending) document = { data: await fileToBase64(sending), mediaType: sending.type };
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          area, lang, mode, audience, document,
        }),
      });
      if (res.status === 401) setError(t.authExpired);
      else if (res.status === 413) setError(t.tooBig);
      else if (!res.ok) setError(t.err);
      else {
        const data = await res.json();
        setMessages((prev) => [...prev, {
          role: "assistant", content: data.analysis, sources: data.sources,
          verification: data.verification, citations: data.citations, quality: data.quality, sourceLinks: data.sourceLinks, disclaimer: data.disclaimer, agents: data.agents,
        }]);
      }
    } catch { setError(t.err); }
    finally { setLoading(false); }
  }

  function newChat() { setMessages([]); setInput(""); setDocFile(null); setError(""); }

  const areas = [
    { key: "civil", label: `§ ${t.civil}` },
    { key: "criminal", label: `⚖ ${t.criminal}` },
    { key: "unsure", label: `? ${t.unsure}` },
  ];
  const canSend = (input.trim() || docFile) && !loading;

  return (
    <>
      {showDis && (
        <div className="modal-backdrop open">
          <div className="modal">
            <h3>{t.disTitle}</h3>
            <p>{t.disBody}</p>
            <div className="modal-actions"><button className="btn-primary" onClick={() => setShowDis(false)}>{t.disOk}</button></div>
          </div>
        </div>
      )}

      <div className="split-shell">
        <LeftPanel t={t}>
          <div className="product-toggle">
            {areas.map((a) => (
              <button key={a.key} className={`product-btn ${area === a.key ? "active" : ""}`} onClick={() => setArea(a.key)}>{a.label}</button>
            ))}
          </div>
          {!isMobile && (
            <div className="info-stack">
              <div className="info-card">
                <div className="info-title">{t.aidT}</div>
                <div className="info-body">{t.aidBody}</div>
                <a href="https://e-justice.europa.eu/topics/taking-legal-action/legal-aid/el_en" target="_blank" rel="noreferrer">{t.aidCta} →</a>
              </div>
              <div className="info-card warn">
                <div className="info-title">⏳ {t.deadlineT}</div>
                <div className="info-body">{t.deadlineBody}</div>
              </div>
              <div className="link-row">
                <span>{t.codesT}:</span>
                {CODES.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer">{n}</a>)}
              </div>
              <div className="link-row">
                <span>{t.courtsT}:</span>
                {COURTS.map(([n, u]) => <a key={n} href={u} target="_blank" rel="noreferrer">{n}</a>)}
              </div>
            </div>
          )}
        </LeftPanel>

        <div className="right-panel">
          <div className="chat-card">
            <div className="chat-card-header">
              <div className="hal-dot" />
              <div className="chat-card-name">{t.name} <span className="online-badge">{t.online}</span></div>
              <div style={{ flex: 1 }} />
              <button className="ghost-btn" onClick={() => setLang(lang === "el" ? "en" : "el")}>{lang === "el" ? "EN" : "ΕΛ"}</button>
              {started && <button className="ghost-btn" onClick={newChat}>↺ {t.newChat}</button>}
              <button className="ghost-btn" onClick={onSignOut}>{t.signOut}</button>
            </div>
            <div className="progress-bar">
              {t.steps.map((s, i) => (
                <div key={s} className={`progress-step ${stage === i + 1 ? "active" : stage > i + 1 ? "done" : ""}`}>{s}</div>
              ))}
            </div>

            <div id="chat" ref={chatRef}>
              {!started && (
                <div className="start-hint">
                  {t.startHint}
                  <div className="guided-choices">
                    {EXAMPLES[lang][area].map((ex, i) => (
                      <button key={i} className="guided-choice" onClick={() => setInput(ex)}>{ex}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="msg user">{m.content}</div>
                ) : (
                  <AssistantBubble key={i} msg={m} prevUserText={messages[i - 1]?.content} area={area} mode={mode} lang={lang} />
                )
              )}
              {loading && (
                <div className="thinking">
                  <span className="thinking-dots"><span /><span /><span /></span>
                  <span>{t.asking}</span>
                </div>
              )}
              {error && <div className="note bad">{error}</div>}
            </div>

            <div className="dynamic-input-row">
              {docFile && (
                <div className="file-pill">📎 {docFile.name.slice(0, 32)} <button onClick={() => setDocFile(null)}>{t.remove}</button></div>
              )}
              <div className="composer">
                <label className="icon-btn" title={t.attach}>
                  📎
                  <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.target.value = "";
                    if (f && f.size > MAX_FILE_BYTES) { setError(t.tooBig); return; }
                    setError("");
                    setDocFile(f);
                  }} />
                </label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !isMobile) { e.preventDefault(); send(); } }}
                  placeholder={started ? t.chatPlaceholder : t.placeholder}
                  rows={1}
                />
                <button className="send-btn" onClick={send} disabled={!canSend}>{t.send}</button>
              </div>
              <label className="deep-toggle">
                <input type="checkbox" checked={mode === "deep"} onChange={(e) => setMode(e.target.checked ? "deep" : "quick")} />
                <span>{t.deep}</span>
              </label>
              <label className="deep-toggle">
                <input type="checkbox" checked={audience === "lawyer"} onChange={(e) => setAudience(e.target.checked ? "lawyer" : "citizen")} />
                <span>{t.lawyer}</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [lang, setLang] = useState("el");
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <>
      <style>{CSS}</style>
      {!ready ? <div style={{ minHeight: "100vh", background: "#0c1727" }} />
        : session ? <MainApp lang={lang} setLang={setLang} onSignOut={() => supabase.auth.signOut()} />
        : <AuthScreen lang={lang} setLang={setLang} />}
    </>
  );
}

// ── Styles (HAL layout: navy left panel + white chat card on a light panel) ──
const CSS = `
:root{
  --navy:#0c1727; --navy-2:#172333; --white:#fff; --bg:#f5f7f9;
  --border:#e7ebef; --text:#172333; --muted:#687586;
  --accent:#5747e8; --accent-soft:#f3f0ff; --good:#1a7a4c; --gold:#c99a4a;
  --bad:#b4321f; --warn:#a15c00; --warn-soft:#fff6e5;
}
*{box-sizing:border-box}
html,body,#root{margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;background:var(--bg);color:var(--text)}
button{font-family:inherit}

.split-shell{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);min-height:100vh;background:var(--navy)}
.left-panel{padding:56px 48px;display:flex;flex-direction:column;justify-content:center;color:var(--white)}
.brand-row{font-weight:700;letter-spacing:.08em;font-size:12px;color:#9aa7bd;margin-bottom:22px}
.left-eyebrow{color:var(--gold);font-weight:700;font-size:11px;letter-spacing:.12em;margin-bottom:14px}
.left-headline{font-size:34px;line-height:1.12;overflow-wrap:anywhere;font-weight:800;margin:0 0 18px;letter-spacing:-.01em}
.left-lead{font-size:14px;line-height:1.6;color:#c3cbdb;max-width:460px;margin:0 0 24px}
.product-toggle{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 24px}
.product-btn{padding:10px 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:13px;font-weight:600}
.product-btn.active{background:var(--accent);border-color:var(--accent)}
.trust-bullets{list-style:none;padding:0;margin:0 0 26px;display:flex;flex-direction:column;gap:10px}
.trust-bullets li{font-size:13px;color:#dfe4ee;display:flex;align-items:center;gap:10px}
.bullet-dot{width:6px;height:6px;border-radius:50%;background:var(--gold);display:inline-block;flex-shrink:0}
.info-stack{display:flex;flex-direction:column;gap:12px;max-width:460px}
.info-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 16px}
.info-card.warn{border-color:rgba(201,154,74,.5)}
.info-title{font-weight:700;font-size:13px;color:#fff;margin-bottom:4px}
.info-body{font-size:12.5px;line-height:1.55;color:#c3cbdb}
.info-card a,.link-row a{color:#cfc8ff;font-size:12.5px;font-weight:600;text-decoration:none}
.info-card a{display:inline-block;margin-top:6px}
.info-card a:hover,.link-row a:hover{text-decoration:underline}
.link-row{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12.5px;color:#9aa7bd}

.right-panel{min-width:0;background:var(--bg);display:flex;align-items:center;justify-content:center;padding:32px}
.chat-card{background:var(--white);border-radius:16px;box-shadow:0 20px 50px rgba(12,23,39,.18);width:100%;max-width:600px;height:calc(100vh - 64px);max-height:860px;display:flex;flex-direction:column;overflow:hidden}
.chat-card.auth-card{height:auto}
.chat-card-header{display:flex;align-items:center;gap:8px;padding:14px 18px;border-bottom:1px solid var(--border);flex-wrap:wrap}
.hal-dot{width:34px;height:34px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#3a3160,var(--navy));flex-shrink:0}
.chat-card-name{font-weight:700;font-size:14px}
.online-badge{color:var(--good);font-weight:400;font-size:11px;margin-left:4px}
.ghost-btn{background:none;border:1px solid var(--border);border-radius:999px;padding:6px 12px;font-size:11px;cursor:pointer;color:var(--muted)}
.ghost-btn:hover{border-color:var(--accent);color:var(--accent)}
.ghost-btn.active-bad{border-color:var(--bad);color:var(--bad)}
.progress-bar{display:flex;gap:6px;padding:8px 18px;background:var(--white);border-bottom:1px solid var(--border);font-size:11px;color:var(--muted)}
.progress-step{flex:1;text-align:center;padding-bottom:6px;border-bottom:3px solid var(--border)}
.progress-step.active{color:var(--navy);font-weight:700;border-color:var(--accent)}
.progress-step.done{color:var(--good);border-color:var(--good)}

#chat{flex:1;overflow-y:auto;padding:16px 18px;min-height:0}
.start-hint{color:var(--muted);font-size:14px;line-height:1.6}
.guided-choices{display:flex;flex-direction:column;align-items:flex-start;gap:6px;margin-top:12px}
.guided-choice{background:var(--accent-soft);color:var(--accent);border:none;border-radius:14px;padding:8px 13px;font-size:12.5px;font-weight:600;cursor:pointer;text-align:left}
.guided-choice:hover{filter:brightness(.96)}
.msg{max-width:90%;min-width:0;margin:10px 0;padding:12px 14px;border-radius:14px;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
.msg.user{background:var(--navy);color:var(--white);margin-left:auto;border-bottom-right-radius:4px;white-space:pre-wrap}
.msg.hal{background:var(--white);border:1px solid var(--border);margin-right:auto;border-bottom-left-radius:4px;max-width:100%}
.thinking{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;padding:8px 0}
.thinking-dots span{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--muted);margin-left:2px;animation:pulse 1.2s infinite}
.thinking-dots span:nth-child(2){animation-delay:.2s}
.thinking-dots span:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,100%{opacity:.2}50%{opacity:1}}

.md h1,.md h2,.md h3{font-size:14.5px;font-weight:700;margin:14px 0 6px;color:var(--navy)}
.md h1:first-child,.md h2:first-child,.md h3:first-child{margin-top:0}
.md p{margin:6px 0}
.md ul,.md ol{margin:6px 0;padding-left:20px}
.md li{margin:3px 0}
.md hr{border:0;border-top:1px solid var(--border);margin:12px 0}
.md blockquote{margin:8px 0;padding:6px 12px;border-left:3px solid var(--border);color:var(--muted)}
.md strong{font-weight:700}
.md a{color:var(--accent)}
.md table{border-collapse:collapse;font-size:13px;margin:8px 0}
.md th,.md td{border:1px solid var(--border);padding:5px 8px;text-align:left}

.agent-trail{display:flex;flex-wrap:wrap;gap:5px;margin-bottom:10px}
.agent-chip{background:#eaf7ef;color:var(--good);border-radius:999px;padding:3px 9px;font-size:10.5px;font-weight:700}
.doc-facts{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:8px 12px;margin-bottom:10px;font-size:12.5px}
.doc-facts summary{cursor:pointer;font-weight:700;color:var(--navy)}
.doc-facts ul{margin:6px 0;padding-left:18px}
.doc-facts p{margin:6px 0}
.doc-deadlines{margin-top:6px;color:var(--bad)}
.callout{margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg);font-size:13px;line-height:1.5}
.callout.warn{background:var(--warn-soft);border-color:#f0d9a8;color:#5c3b00}
.small-title{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.src-block{margin-top:14px;padding-top:10px;border-top:1px solid var(--border)}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:700;padding:4px 9px;border-radius:999px}
.verdict{font-weight:700}
.verdict.ok{color:var(--good)} .verdict.warn{color:var(--warn)} .verdict.bad{color:var(--bad)}
.verdict-note{margin-top:4px;font-size:13px}
.flags{margin:8px 0 0;padding-left:18px;font-size:12.5px;color:var(--bad)}
.current-note{margin-top:8px;font-size:11.5px;color:var(--muted);line-height:1.5}
.disclaimer{margin-top:14px;padding-top:10px;border-top:1px solid var(--border);font-size:11.5px;color:var(--muted);line-height:1.5}
.feedback{margin-top:12px;padding-top:10px;border-top:1px solid var(--border)}
.fb-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--muted)}
.note{font-size:13px;margin-top:10px}
.note.ok{color:var(--good)} .note.bad{color:var(--bad)}

.dynamic-input-row{border-top:1px solid var(--border);padding:12px 16px;display:flex;flex-direction:column;gap:8px}
.composer{display:flex;gap:8px;align-items:flex-end}
.composer textarea{flex:1;border:1px solid var(--border);border-radius:18px;padding:11px 16px;font-size:14px;line-height:1.4;resize:none;max-height:140px;min-height:42px;font-family:inherit;color:var(--text)}
.composer textarea:focus,.field:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(87,71,232,.12)}
.send-btn{background:var(--navy);color:var(--white);border:none;border-radius:999px;padding:0 20px;height:42px;font-weight:700;cursor:pointer}
.send-btn:disabled{background:var(--border);color:var(--muted);cursor:default}
.icon-btn{background:var(--bg);border:1px solid var(--border);border-radius:999px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;font-size:16px}
.icon-btn:hover{background:var(--accent-soft);border-color:var(--accent)}
.deep-toggle{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);cursor:pointer}
.file-pill{font-size:12px;background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:5px 12px;align-self:flex-start}
.file-pill button{background:none;border:none;color:var(--bad);cursor:pointer;font-size:12px;margin-left:6px}

.auth-body{padding:22px 22px 26px}
.auth-title{font-size:20px;font-weight:800}
.auth-sub{color:var(--muted);font-size:13.5px;margin:6px 0 16px}
.field-label{display:block;font-size:12px;font-weight:700;margin-bottom:4px}
.field{width:100%;padding:11px 13px;border:1px solid var(--border);border-radius:10px;font-size:15px;font-family:inherit}
.code-field{letter-spacing:4px;text-align:center;font-size:20px}
.primary-btn{display:block;width:100%;margin-top:16px;background:var(--accent);color:var(--white);border:none;border-radius:10px;padding:12px;font-weight:700;font-size:14px;cursor:pointer}
.primary-btn.small{width:auto;padding:8px 16px;margin-top:8px;font-size:13px;background:var(--navy)}
.primary-btn:disabled{background:var(--border);color:var(--muted);cursor:default}

.modal-backdrop{position:fixed;inset:0;background:rgba(12,23,39,.5);display:none;align-items:center;justify-content:center;z-index:100;padding:16px}
.modal-backdrop.open{display:flex}
.modal{background:var(--white);border-radius:16px;padding:22px;max-width:520px;width:100%;max-height:85vh;overflow:auto}
.modal h3{margin-top:0}
.modal p{font-size:14px;line-height:1.6}
.modal-actions{display:flex;gap:8px;margin-top:16px}
.btn-primary{flex:1;padding:11px;border-radius:9px;font-weight:700;cursor:pointer;border:none;background:var(--navy);color:var(--white)}

@media(max-width:820px){
  .split-shell{grid-template-columns:minmax(0,1fr);min-height:auto}
  .left-panel{padding:28px 20px 8px;min-width:0}
  .left-headline{font-size:24px}
  .left-lead{margin-bottom:16px}
  .trust-bullets{display:none}
  .right-panel{padding:12px}
  .chat-card{height:calc(100vh - 24px);max-height:none}
  .chat-card.auth-card{height:auto}
}
`;
