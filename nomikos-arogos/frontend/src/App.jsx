import React, { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";

const API_URL = import.meta.env.VITE_API_URL || "";

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  ink: "#14233b", navy: "#1f3a5f", bg: "#f3ede1", card: "#faf6ec",
  bronze: "#b08a4a", bronzeDeep: "#8a6a34", blue: "#2f6699",
  text: "#2a2417", muted: "#6b6451", line: "#d9cfb8", alert: "#9c3b2e",
  ok: "#3f7d4e", warn: "#b07a1e",
};

const T = {
  el: {
    brand: "Νομικός Αρωγός", tagline: "Κατανοητή νομική πληροφόρηση για κάθε πολίτη",
    notLawyer: "Πληροφόρηση — όχι νομική συμβουλή",
    signInTitle: "Σύνδεση", signInSub: "Δώστε το email σας για να λάβετε έναν κωδικό μιας χρήσης.",
    email: "Email", sendCode: "Αποστολή κωδικού", codeLabel: "Κωδικός από το email",
    verify: "Σύνδεση", sending: "Αποστολή…", verifying: "Έλεγχος…",
    codeSent: "Σας στείλαμε έναν κωδικό. Ελέγξτε το email σας.",
    signOut: "Αποσύνδεση", authExpired: "Η συνεδρία έληξε. Συνδεθείτε ξανά.",
    areaQ: "Σε ποιον τομέα αφορά το ζήτημά σας;",
    civil: "Αστικό Δίκαιο", civilSub: "Συμβάσεις, οικογένεια, κληρονομιά, ακίνητα",
    criminal: "Ποινικό Δίκαιο", criminalSub: "Κατηγορίες, μηνύσεις, αδικήματα, ποινές",
    unsure: "Δεν είμαι σίγουρος/η", unsureSub: "Περιγράψτε το και θα σας προσανατολίσουμε",
    describe: "Περιγράψτε με απλά λόγια τι συμβαίνει",
    placeholder: "π.χ. Ο εργοδότης μου δεν μου πληρώνει δεδουλευμένα και δεν απαντά…",
    deep: "Εκτενής ανάλυση", deepSub: "Πιο βαθιά ανάλυση + δεύτερη γνώμη",
    attach: "Επισύναψη εγγράφου", remove: "Αφαίρεση",
    examplesT: "Παραδείγματα", ask: "Ρωτήστε", asking: "Αναζήτηση στους Κώδικες…",
    answerT: "Καθοδήγηση", sourcesT: "Πηγές", again: "Νέα ερώτηση",
    fbQ: "Σας βοήθησε αυτή η απάντηση;", fbYes: "Ναι", fbNo: "Όχι",
    fbThanks: "Ευχαριστούμε για την ανατροφοδότηση.",
    fbCommentPh: "Τι έλειπε ή τι ήταν λάθος; (προαιρετικό)", fbSend: "Αποστολή",
    verifyT: "Έλεγχος δεύτερου μοντέλου",
    verdicts: { supported: "Επιβεβαιωμένο από τις πηγές", partially_supported: "Εν μέρει επιβεβαιωμένο", unsupported: "Μη επιβεβαιωμένο — προσοχή", unverified: "Δεν ελέγχθηκε" },
    aidT: "Δωρεάν Νομική Βοήθεια (ν. 3226/2004)",
    aidBody: "Αν έχετε χαμηλό εισόδημα, δικαιούστε δωρεάν δικηγόρο μέσω του Δικηγορικού Συλλόγου της περιοχής σας.",
    aidCta: "Βρείτε τον Δικηγορικό Σύλλογό σας",
    codesT: "Επίσημοι Κώδικες", courtsT: "Νομολογία",
    deadlineT: "Προσοχή στις προθεσμίες",
    deadlineBody: "Πολλά δικαιώματα χάνονται αν περάσει η προθεσμία. Αν υπάρχει έγγραφο με ημερομηνία, μιλήστε ΑΜΕΣΑ με δικηγόρο.",
    disTitle: "Πριν ξεκινήσετε", disOk: "Κατάλαβα, συνέχεια",
    disBody: "Γενική νομική πληροφόρηση βασισμένη στους ελληνικούς Κώδικες. ΔΕΝ είναι δικηγόρος και δεν αντικαθιστά τη νομική συμβουλή. Επαληθεύστε τα άρθρα και απευθυνθείτε σε δικηγόρο. Μην εισάγετε ευαίσθητα προσωπικά δεδομένα.",
    err: "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.",
  },
  en: {
    brand: "Legal Companion", tagline: "Clear legal information for every citizen",
    notLawyer: "Information — not legal advice",
    signInTitle: "Sign in", signInSub: "Enter your email to receive a one-time code.",
    email: "Email", sendCode: "Send code", codeLabel: "Code from your email",
    verify: "Sign in", sending: "Sending…", verifying: "Checking…",
    codeSent: "We sent you a code. Check your email.",
    signOut: "Sign out", authExpired: "Session expired. Please sign in again.",
    areaQ: "What area does your issue concern?",
    civil: "Civil Law", civilSub: "Contracts, family, inheritance, property",
    criminal: "Criminal Law", criminalSub: "Charges, complaints, offences, penalties",
    unsure: "I'm not sure", unsureSub: "Describe it and we'll orient you",
    describe: "Describe in plain words what is happening",
    placeholder: "e.g. My employer won't pay my wages and won't answer…",
    deep: "Extended analysis", deepSub: "Deeper analysis + second opinion",
    attach: "Attach document", remove: "Remove",
    examplesT: "Examples", ask: "Ask", asking: "Searching the Codes…",
    answerT: "Guidance", sourcesT: "Sources", again: "New question",
    fbQ: "Did this answer help you?", fbYes: "Yes", fbNo: "No",
    fbThanks: "Thank you for the feedback.",
    fbCommentPh: "What was missing or wrong? (optional)", fbSend: "Send",
    verifyT: "Second-model check",
    verdicts: { supported: "Supported by sources", partially_supported: "Partially supported", unsupported: "Unsupported — caution", unverified: "Not checked" },
    aidT: "Free Legal Aid (Law 3226/2004)",
    aidBody: "If you are low-income, you are entitled to a free lawyer through your local Bar Association.",
    aidCta: "Find your local Bar Association",
    codesT: "Official Codes", courtsT: "Case law",
    deadlineT: "Mind the deadlines",
    deadlineBody: "Many rights are lost once a deadline passes. If you hold a dated document, speak to a lawyer IMMEDIATELY.",
    disTitle: "Before you start", disOk: "I understand, continue",
    disBody: "General legal information based on the Greek Codes. NOT a lawyer and no substitute for legal advice. Verify articles and consult a lawyer. Do not enter sensitive personal data.",
    err: "Something went wrong. Please try again.",
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

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function Section({ heading, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      {heading && (
        <div style={{ fontFamily: "'Spectral', serif", fontWeight: 600, fontSize: 17, color: C.navy, marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: C.bronze, fontSize: 13 }}>◆</span>{heading}
        </div>
      )}
      <div style={{ color: C.text, lineHeight: 1.62, fontSize: 15.5, whiteSpace: "pre-wrap" }}>{children}</div>
    </div>
  );
}

function renderAnswer(text) {
  const lines = (text || "").split("\n");
  const blocks = [];
  let current = { heading: null, body: [] };
  const headingRe = /^\s*(?:\d+[\).\-]\s*)?([^:]{2,60}):\s*(.*)$/;
  const push = () => { if (current.heading || current.body.join("").trim()) blocks.push(current); };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { current.body.push(""); continue; }
    const m = line.match(headingRe);
    const looksHeading = m && line.length < 70 && !/[.;]$/.test(m[1]) && /[Α-Ωα-ωA-Za-z]/.test(m[1]);
    if (looksHeading) { push(); current = { heading: m[1].replace(/\*\*/g, "").trim(), body: m[2] ? [m[2]] : [] }; }
    else current.body.push(raw.replace(/\*\*/g, ""));
  }
  push();
  if (!blocks.length) return <Section>{text}</Section>;
  return blocks.map((b, i) => <Section key={i} heading={b.heading}>{b.body.join("\n").trim()}</Section>);
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

  const inputStyle = { width: "100%", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", fontSize: 16, color: C.text, fontFamily: "'IBM Plex Sans', sans-serif" };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: C.bg }}>
      <div style={{ background: C.card, maxWidth: 420, width: "100%", borderRadius: 14, border: `1px solid ${C.line}`, overflow: "hidden", boxShadow: "0 18px 50px rgba(20,35,59,.18)" }}>
        <div className="meander" />
        <div style={{ padding: "30px 32px 34px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Spectral', serif", fontSize: 28, fontWeight: 700, color: C.ink }}>{t.brand}</div>
            <button onClick={() => setLang(lang === "el" ? "en" : "el")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 18, padding: "4px 10px", color: C.navy, cursor: "pointer", fontWeight: 600, fontSize: 12 }}>{lang === "el" ? "EN" : "ΕΛ"}</button>
          </div>
          <div style={{ color: C.muted, fontSize: 14, marginTop: 4, marginBottom: 22 }}>{t.tagline}</div>
          <div style={{ fontFamily: "'Spectral', serif", fontWeight: 600, fontSize: 20, color: C.navy }}>{t.signInTitle}</div>
          <div style={{ color: C.muted, fontSize: 14, margin: "6px 0 18px" }}>{t.signInSub}</div>

          <label style={{ fontSize: 13, color: C.muted }}>{t.email}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" disabled={sent} style={{ ...inputStyle, marginTop: 6, opacity: sent ? 0.6 : 1 }} />

          {!sent ? (
            <button className="btn" onClick={sendCode} disabled={busy || !email.trim()} style={{ marginTop: 16, width: "100%", background: busy || !email.trim() ? C.line : C.bronze, color: busy || !email.trim() ? C.muted : "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 16, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}>
              {busy ? t.sending : t.sendCode}
            </button>
          ) : (
            <>
              <label style={{ fontSize: 13, color: C.muted, display: "block", marginTop: 16 }}>{t.codeLabel}</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" style={{ ...inputStyle, marginTop: 6, letterSpacing: 4, textAlign: "center", fontSize: 22 }} />
              <button className="btn" onClick={verify} disabled={busy || !code.trim()} style={{ marginTop: 16, width: "100%", background: busy || !code.trim() ? C.line : C.ink, color: busy || !code.trim() ? C.muted : "#fff", border: "none", borderRadius: 10, padding: "13px", fontSize: 16, fontWeight: 600, cursor: busy ? "default" : "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}>
                {busy ? t.verifying : t.verify}
              </button>
            </>
          )}
          {msg && <div style={{ color: C.ok, fontSize: 13.5, marginTop: 12 }}>{msg}</div>}
          {err && <div style={{ color: C.alert, fontSize: 13.5, marginTop: 12 }}>{err}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────────────
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

function MainApp({ lang, setLang, onSignOut }) {
  const t = T[lang];
  const isMobile = useIsMobile();
  const [area, setArea] = useState("civil");
  const [situation, setSituation] = useState("");
  const [mode, setMode] = useState("quick");
  const [docFile, setDocFile] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showDis, setShowDis] = useState(true);
  const [fb, setFb] = useState(null);          // null | 'down-open' | 'sent'
  const [fbComment, setFbComment] = useState("");
  const answerRef = useRef(null);

  useEffect(() => { if (answer && answerRef.current) answerRef.current.scrollIntoView({ behavior: "smooth", block: "start" }); }, [answer]);

  async function sendFeedback(rating, comment) {
    setFb("sent");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token || !answer) return;
      await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rating, comment: comment || "", area, mode,
          question: situation.trim(), answer: answer.analysis, sources: answer.sources,
        }),
      });
    } catch { /* feedback is best-effort; never block the user */ }
  }

  async function ask() {
    if ((!situation.trim() && !docFile) || loading) return;
    setLoading(true); setError(""); setAnswer(null); setFb(null); setFbComment("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setError(t.authExpired); setLoading(false); return; }
      let document = null;
      if (docFile) document = { data: await fileToBase64(docFile), mediaType: docFile.type };
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ question: situation.trim(), area, lang, mode, document }),
      });
      if (res.status === 401) setError(t.authExpired);
      else if (!res.ok) setError(t.err);
      else setAnswer(await res.json());
    } catch { setError(t.err); }
    finally { setLoading(false); }
  }

  const areaCards = [
    { key: "civil", title: t.civil, sub: t.civilSub, icon: "§" },
    { key: "criminal", title: t.criminal, sub: t.criminalSub, icon: "⚖" },
    { key: "unsure", title: t.unsure, sub: t.unsureSub, icon: "?" },
  ];
  const verdictColor = (v) => v === "supported" ? C.ok : v === "partially_supported" ? C.warn : C.alert;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, backgroundImage: "radial-gradient(circle at 12% 8%, rgba(176,138,74,0.10), transparent 42%), radial-gradient(circle at 88% 0%, rgba(47,102,153,0.08), transparent 45%)", color: C.text, fontFamily: "'IBM Plex Sans', sans-serif", paddingBottom: 60 }}>
      {showDis && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,35,59,.55)", backdropFilter: "blur(3px)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.card, maxWidth: 560, borderRadius: 14, border: `1px solid ${C.line}`, overflow: "hidden", animation: "fadeUp .35s ease" }}>
            <div className="meander" />
            <div style={{ padding: "26px 30px 30px" }}>
              <div style={{ fontFamily: "'Spectral', serif", fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 12 }}>{t.disTitle}</div>
              <p style={{ lineHeight: 1.65, fontSize: 15.5 }}>{t.disBody}</p>
              <button className="btn" onClick={() => setShowDis(false)} style={{ marginTop: 18, background: C.ink, color: "#fff", border: "none", borderRadius: 9, padding: "12px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'IBM Plex Sans', sans-serif" }}>{t.disOk}</button>
            </div>
          </div>
        </div>
      )}

      <div className="meander" />
      <header style={{ maxWidth: 1080, margin: "0 auto", padding: "26px 24px 8px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
        <div>
          <div style={{ fontFamily: "'Spectral', serif", fontSize: 34, fontWeight: 700, color: C.ink, letterSpacing: "-0.5px", lineHeight: 1.05 }}>{t.brand}</div>
          <div style={{ color: C.muted, marginTop: 4, fontSize: 15 }}>{t.tagline}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11.5, letterSpacing: ".5px", textTransform: "uppercase", color: C.bronzeDeep, border: `1px solid ${C.bronze}`, borderRadius: 20, padding: "5px 12px", fontWeight: 600 }}>{t.notLawyer}</span>
          <button onClick={() => setLang(lang === "el" ? "en" : "el")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 20, padding: "5px 12px", color: C.navy, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>{lang === "el" ? "EN" : "ΕΛ"}</button>
          <button onClick={onSignOut} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 20, padding: "5px 12px", color: C.muted, cursor: "pointer", fontWeight: 600, fontSize: 13 }}>{t.signOut}</button>
        </div>
      </header>

      <main style={{ maxWidth: 1080, margin: "0 auto", padding: isMobile ? "8px 16px" : "8px 24px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0,1fr) 300px", gap: isMobile ? 18 : 26, alignItems: "start" }}>
        <div>
          <div style={{ fontFamily: "'Spectral', serif", fontWeight: 600, fontSize: 19, color: C.ink, margin: "12px 0" }}>{t.areaQ}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
            {areaCards.map((a) => {
              const active = area === a.key;
              return (
                <div key={a.key} className="acard" onClick={() => setArea(a.key)} style={{ background: active ? C.ink : C.card, border: `1px solid ${active ? C.ink : C.line}`, borderRadius: 12, padding: "16px 14px", boxShadow: active ? "0 10px 26px rgba(20,35,59,.2)" : "none" }}>
                  <div style={{ fontFamily: "'Spectral', serif", fontSize: 26, color: C.bronze, lineHeight: 1 }}>{a.icon}</div>
                  <div style={{ fontWeight: 600, marginTop: 8, fontSize: 15.5, color: active ? "#fff" : C.ink }}>{a.title}</div>
                  <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.4, color: active ? "rgba(255,255,255,.7)" : C.muted }}>{a.sub}</div>
                </div>
              );
            })}
          </div>

          <div style={{ fontFamily: "'Spectral', serif", fontWeight: 600, fontSize: 19, color: C.ink, margin: "26px 0 10px" }}>{t.describe}</div>
          <textarea value={situation} onChange={(e) => setSituation(e.target.value)} placeholder={t.placeholder} rows={5} style={{ width: "100%", background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 16px", fontSize: 15.5, lineHeight: 1.55, color: C.text, resize: "vertical", fontFamily: "'IBM Plex Sans', sans-serif" }} />

          <div style={{ marginTop: 12 }}>
            <span style={{ fontSize: 12.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px" }}>{t.examplesT}:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {EXAMPLES[lang][area].map((ex, i) => (
                <button key={i} className="ex" onClick={() => setSituation(ex)} style={{ background: "transparent", border: `1px dashed ${C.line}`, borderRadius: 18, padding: "7px 13px", fontSize: 13, color: C.navy, cursor: "pointer", textAlign: "left", fontFamily: "'IBM Plex Sans', sans-serif" }}>{ex}</button>
              ))}
            </div>
          </div>

          {/* controls: attach + deep toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 16, flexWrap: "wrap" }}>
            <label className="btn" style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 14px", cursor: "pointer", fontSize: 13.5, color: C.navy, background: C.card }}>
              📎 {docFile ? docFile.name.slice(0, 22) : t.attach}
              <input type="file" accept="application/pdf,image/*" style={{ display: "none" }} onChange={(e) => setDocFile(e.target.files?.[0] || null)} />
            </label>
            {docFile && <button onClick={() => setDocFile(null)} style={{ background: "transparent", border: "none", color: C.alert, cursor: "pointer", fontSize: 13 }}>{t.remove}</button>}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5, color: C.text }}>
              <input type="checkbox" checked={mode === "deep"} onChange={(e) => setMode(e.target.checked ? "deep" : "quick")} />
              <span><strong>{t.deep}</strong> <span style={{ color: C.muted }}>· {t.deepSub}</span></span>
            </label>
          </div>

          <button className="btn" onClick={ask} disabled={loading || (!situation.trim() && !docFile)} style={{ marginTop: 18, background: loading || (!situation.trim() && !docFile) ? C.line : C.bronze, color: loading || (!situation.trim() && !docFile) ? C.muted : "#fff", border: "none", borderRadius: 10, padding: "13px 28px", fontSize: 16, fontWeight: 600, cursor: loading || (!situation.trim() && !docFile) ? "default" : "pointer", boxShadow: loading ? "none" : "0 8px 22px rgba(176,138,74,.35)", fontFamily: "'IBM Plex Sans', sans-serif" }}>
            {loading ? t.asking : "⚖  " + t.ask}
          </button>

          {(loading || answer || error) && (
            <div ref={answerRef} style={{ marginTop: 24, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: "hidden", animation: "fadeUp .4s ease" }}>
              <div className="meander" />
              <div style={{ padding: "22px 26px" }}>
                <div style={{ fontFamily: "'Spectral', serif", fontSize: 20, fontWeight: 700, color: C.ink, marginBottom: 16 }}>{t.answerT}</div>
                {loading && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center", color: C.muted }}>
                    {[0, 1, 2].map((i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 8, background: C.bronze, animation: "pulse 1.1s infinite", animationDelay: i * 0.18 + "s" }} />)}
                    <span style={{ marginLeft: 8, fontSize: 14 }}>{t.asking}</span>
                  </div>
                )}
                {error && <div style={{ color: C.alert }}>{error}</div>}
                {answer && (
                  <>
                    {renderAnswer(answer.analysis)}

                    {answer.sources?.length > 0 && (
                      <div style={{ marginTop: 6, marginBottom: 6 }}>
                        <div style={{ fontSize: 12.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{t.sourcesT}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {answer.sources.map((s, i) => <span key={i} style={{ fontSize: 12.5, background: "rgba(47,102,153,.1)", color: C.navy, borderRadius: 14, padding: "4px 10px" }}>{s}</span>)}
                        </div>
                      </div>
                    )}

                    {answer.verification && (
                      <div style={{ marginTop: 14, padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff" }}>
                        <div style={{ fontSize: 12.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{t.verifyT}</div>
                        <div style={{ fontWeight: 600, color: verdictColor(answer.verification.verdict) }}>{t.verdicts[answer.verification.verdict] || answer.verification.verdict}</div>
                        {answer.verification.note && <div style={{ fontSize: 13.5, color: C.text, marginTop: 4, lineHeight: 1.5 }}>{answer.verification.note}</div>}
                        {answer.verification.flags?.length > 0 && (
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: C.alert }}>
                            {answer.verification.flags.map((f, i) => <li key={i}>{f.claim ? `${f.claim}: ` : ""}{f.issue}</li>)}
                          </ul>
                        )}
                      </div>
                    )}

                    {answer.disclaimer && <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}`, fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>{answer.disclaimer}</div>}

                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}` }}>
                      {fb === "sent" ? (
                        <div style={{ fontSize: 13.5, color: C.ok }}>✓ {t.fbThanks}</div>
                      ) : (
                        <>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13.5, color: C.muted }}>{t.fbQ}</span>
                            <button onClick={() => sendFeedback("up")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 14, color: C.navy }}>👍 {t.fbYes}</button>
                            <button onClick={() => setFb("down-open")} style={{ background: fb === "down-open" ? "rgba(156,59,46,.08)" : "transparent", border: `1px solid ${fb === "down-open" ? C.alert : C.line}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 14, color: C.alert }}>👎 {t.fbNo}</button>
                          </div>
                          {fb === "down-open" && (
                            <div style={{ marginTop: 10 }}>
                              <textarea value={fbComment} onChange={(e) => setFbComment(e.target.value)} placeholder={t.fbCommentPh} rows={2} style={{ width: "100%", background: "#fff", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", fontSize: 13.5, color: C.text, resize: "vertical", fontFamily: "'IBM Plex Sans', sans-serif" }} />
                              <button onClick={() => sendFeedback("down", fbComment)} style={{ marginTop: 8, background: C.ink, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13.5, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>{t.fbSend}</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    <button onClick={() => { setAnswer(null); setSituation(""); setDocFile(null); }} style={{ marginTop: 14, background: "transparent", border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 16px", color: C.navy, cursor: "pointer", fontSize: 13.5, fontWeight: 600, fontFamily: "'IBM Plex Sans', sans-serif" }}>↺ {t.again}</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16, position: isMobile ? "static" : "sticky", top: 16 }}>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontWeight: 600, color: C.navy, marginBottom: 6, fontSize: 15 }}>{t.aidT}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{t.aidBody}</div>
            <a className="lk" href="https://e-justice.europa.eu/topics/taking-legal-action/legal-aid/el_en" target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, fontSize: 13.5, fontWeight: 600 }}>{t.aidCta} →</a>
          </div>
          <div style={{ background: "rgba(156,59,46,.06)", border: `1px solid rgba(156,59,46,.3)`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontWeight: 600, color: C.alert, marginBottom: 6, fontSize: 15 }}>⏳ {t.deadlineT}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{t.deadlineBody}</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontWeight: 600, color: C.navy, marginBottom: 10, fontSize: 15 }}>{t.codesT}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{CODES.map(([n, u]) => <a key={n} className="lk" href={u} target="_blank" rel="noreferrer" style={{ fontSize: 13.5 }}>{n}</a>)}</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "16px 18px" }}>
            <div style={{ fontWeight: 600, color: C.navy, marginBottom: 10, fontSize: 15 }}>{t.courtsT}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{COURTS.map(([n, u]) => <a key={n} className="lk" href={u} target="_blank" rel="noreferrer" style={{ fontSize: 13.5 }}>{n}</a>)}</div>
          </div>
        </aside>
      </main>
    </div>
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

  const styles = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Spectral:ital,wght@0,400;0,500;0,600;0,700;1,400&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
      * { box-sizing: border-box; }
      html, body, #root { margin: 0; padding: 0; }
      ::selection { background: ${C.bronze}; color: #fff; }
      @keyframes fadeUp { from { opacity: 0; transform: translateY(14px);} to { opacity:1; transform:none; } }
      @keyframes pulse { 0%,100%{ opacity:.35 } 50%{ opacity:1 } }
      @keyframes dash { to { background-position: 24px 0; } }
      .meander { height: 6px; background-image: repeating-linear-gradient(90deg, ${C.bronze} 0 4px, transparent 4px 12px); background-size: 24px 6px; animation: dash 18s linear infinite; opacity:.55; }
      .acard { transition: transform .18s ease, box-shadow .18s ease; cursor: pointer; }
      .acard:hover { transform: translateY(-3px); box-shadow: 0 12px 30px rgba(20,35,59,.14); }
      .btn { transition: transform .12s ease; }
      .btn:hover { transform: translateY(-2px); }
      .lk { color: ${C.blue}; text-decoration: none; border-bottom: 1px solid rgba(47,102,153,.3); }
      .ex:hover { background: rgba(176,138,74,.12); }
      textarea:focus, input:focus { outline: none; border-color: ${C.bronze} !important; box-shadow: 0 0 0 3px rgba(176,138,74,.15); }
    `}</style>
  );

  if (!ready) return <>{styles}<div style={{ minHeight: "100vh", background: C.bg }} /></>;

  return (
    <>
      {styles}
      {session
        ? <MainApp lang={lang} setLang={setLang} onSignOut={() => supabase.auth.signOut()} />
        : <AuthScreen lang={lang} setLang={setLang} />}
    </>
  );
}
