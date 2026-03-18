import { useState, useEffect, useRef, useCallback } from "react";

// ─── TOOL NAME → FRIENDLY LABEL ───
const TOOL_LABELS = {
  google_calendar_list_events: "📅 Calendar",
  google_calendar_create_event: "📅 Calendar",
  google_calendar_create_reminder: "⏰ Reminder",
  google_calendar_find_free_time: "📅 Free Time",
  google_calendar_delete_event: "📅 Calendar",
  google_sheets_create: "📊 Sheets",
  google_sheets_add_rows: "📊 Sheets",
  google_sheets_read: "📊 Sheets",
  organize_my_day: "🗓️ Day Planner",
  roku_launch_app: "📺 Roku",
  roku_search_content: "🔍 Roku Search",
  roku_remote_command: "🎮 Roku Remote",
  roku_get_status: "📺 Roku Status",
  roku_type_text: "⌨️ Roku Input",
  gmail_list_emails: "📧 Gmail",
  gmail_read_email: "📧 Gmail",
  gmail_search: "🔍 Gmail Search",
  gmail_create_draft: "✉️ Draft",
  gmail_send_email: "📤 Sent",
};

// ─── DESIGN TOKENS ───
const T = {
  bg: "#0A0A0A",
  bgCard: "#111111",
  bgSidebar: "#0D0D0D",
  bgInput: "#161616",
  bgHover: "#1A1A1A",
  border: "rgba(255,255,255,0.06)",
  borderActive: "rgba(255,255,255,0.12)",
  red: "#E53935",
  redLight: "#FF5252",
  redDim: "rgba(229,57,53,0.12)",
  green: "#00E676",
  greenDim: "rgba(0,230,118,0.12)",
  greenMuted: "#00C853",
  white: "#FAFAFA",
  whiteMuted: "#B0B0B0",
  gray: "#666",
  grayDark: "#333",
  grayDarker: "#1E1E1E",
  accent: "#E53935",
  font: "'Inter',system-ui,-apple-system,sans-serif",
  mono: "'JetBrains Mono','SF Mono','Fira Code',monospace",
};

// ─── MOBILE DETECTION ───
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < breakpoint
  );
  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

async function callTony(messages, context) {
  const body = { messages, context };
  const response = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "API error");
  const toolsUsed = (data.tools_used || []).map((t) => TOOL_LABELS[t] || t).filter((v, i, a) => a.indexOf(v) === i);
  return {
    text: data.text || "Request processed.",
    toolsUsed,
    rounds: data.rounds || 1,
  };
}

function parseWhatsAppLinks(text) {
  const regex = /\[WHATSAPP_SEND:\+?(\d+):(.+?)\]/g;
  const parts = []; let lastIndex = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    parts.push({ type: "whatsapp", phone: match[1], message: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: "text", content: text.slice(lastIndex) });
  return parts.length > 0 ? parts : [{ type: "text", content: text }];
}

// ─── JARVIS VOICE HOOK ───
const CONFIRMATIONS = [
  "Yes, boss.", "On it.", "Coming right up.", "Consider it done.",
  "Done.", "Handled.", "Already on it.", "You got it.",
  "Right away.", "One moment.", "Say no more.",
];

function useVoice(onResult, onError) {
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const recognitionRef = useRef(null);
  const jarvisVoiceRef = useRef(null);
  const supported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // Find the best Jarvis-like voice (deep, male, preferably British)
  useEffect(() => {
    if (!window.speechSynthesis) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      // Priority: British male > any male > "Daniel" > "Google UK" > default
      const priorities = [
        (v) => /daniel/i.test(v.name),
        (v) => /\b(uk|british)\b/i.test(v.name) && /male/i.test(v.name),
        (v) => /\b(uk|british)\b/i.test(v.name),
        (v) => /\b(james|arthur|oliver|william)\b/i.test(v.name),
        (v) => v.lang.startsWith("en") && /male/i.test(v.name),
        (v) => v.lang.startsWith("en-GB"),
        (v) => v.lang.startsWith("en"),
      ];
      for (const test of priorities) {
        const match = voices.find(test);
        if (match) { jarvisVoiceRef.current = match; return; }
      }
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
  }, []);

  useEffect(() => {
    if (!supported) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false; recognition.lang = "en-US";
    recognition.onresult = (e) => { const t = e.results[0][0].transcript; setIsListening(false); onResult(t); };
    recognition.onerror = () => { setIsListening(false); onError(); };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
  }, []);

  const startListening = () => { if (recognitionRef.current) { recognitionRef.current.start(); setIsListening(true); } };
  const stopListening = () => { if (recognitionRef.current) { recognitionRef.current.stop(); setIsListening(false); } };

  const speak = (text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/[*_~`#\[\]]/g, "").slice(0, 500);
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 0.92; u.pitch = 0.82; // Deeper, more deliberate — Jarvis energy
    if (jarvisVoiceRef.current) u.voice = jarvisVoiceRef.current;
    window.speechSynthesis.speak(u);
  };

  // Short confirmation for tool actions — doesn't read back the whole response
  const speakConfirmation = (toolsUsed) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const phrase = CONFIRMATIONS[Math.floor(Math.random() * CONFIRMATIONS.length)];
    const u = new SpeechSynthesisUtterance(phrase);
    u.rate = 0.95; u.pitch = 0.82;
    if (jarvisVoiceRef.current) u.voice = jarvisVoiceRef.current;
    window.speechSynthesis.speak(u);
  };

  return { isListening, startListening, stopListening, speak, speakConfirmation, supported, voiceEnabled, setVoiceEnabled };
}

// ─── DATA STORE ───
function useStore() {
  const [bills, setBills] = useState([
    { id: 1, name: "Rent — Apartment", amount: 2200, due: "1st", category: "housing", paid: false },
    { id: 2, name: "Car Payment — BMW", amount: 589, due: "5th", category: "auto", paid: false },
    { id: 3, name: "Internet — Spectrum", amount: 79.99, due: "12th", category: "utilities", paid: true },
    { id: 4, name: "Phone — T-Mobile", amount: 85, due: "15th", category: "utilities", paid: false },
    { id: 5, name: "Insurance — Progressive", amount: 142, due: "20th", category: "auto", paid: false },
    { id: 6, name: "Gym — LA Fitness", amount: 35, due: "1st", category: "health", paid: true },
  ]);
  const [expenses, setExpenses] = useState([
    { id: 1, desc: "Starbucks", amount: 6.45, date: "Mar 15", category: "food" },
    { id: 2, desc: "Amazon — cables", amount: 24.99, date: "Mar 14", category: "shopping" },
    { id: 3, desc: "Shell Gas", amount: 52.0, date: "Mar 13", category: "auto" },
    { id: 4, desc: "Chipotle", amount: 12.35, date: "Mar 12", category: "food" },
  ]);
  const [deadlines, setDeadlines] = useState([
    { id: 1, task: "Submit RFI Response — Site 11250", due: "Mar 20", priority: "high", project: "SITE-11250", done: false },
    { id: 2, task: "Review structural drawings", due: "Mar 22", priority: "high", project: "SITE-11250", done: false },
    { id: 3, task: "Safety inspection report", due: "Mar 25", priority: "medium", project: "SITE-11250", done: false },
    { id: 4, task: "Timesheet approval", due: "Mar 18", priority: "medium", project: "Admin", done: true },
    { id: 5, task: "Order rebar — Phase 2", due: "Mar 28", priority: "low", project: "SITE-11250", done: false },
  ]);
  const [notes, setNotes] = useState([
    { id: 1, title: "Kickoff Meeting — Site 11250", date: "Mar 10", project: "SITE-11250", attendees: ["Angel", "Mike (GC)", "Sarah (Arch)"], items: ["Timeline: 14 months", "Budget: $2.4M", "Next milestone: foundation pour Mar 28"] },
    { id: 2, title: "Weekly Sync — Structural", date: "Mar 14", project: "SITE-11250", attendees: ["Angel", "Tom (Structural)", "Lisa (PM)"], items: ["Beam calcs approved", "Rebar delivery confirmed", "Change order #3 pending"] },
  ]);
  const [templates] = useState([
    { id: 1, name: "Daily Site Report", prompt: "Create a daily site report for today. Include weather, manpower, equipment, work completed, and issues." },
    { id: 2, name: "Meeting Minutes", prompt: "I need to create meeting minutes. Ask me for the details." },
    { id: 3, name: "Expense Report", prompt: "Create a Google Sheet expense report with my recent expenses." },
    { id: 4, name: "Weekly Status Update", prompt: "Generate a weekly status update for Site 11250 based on current deadlines and notes." },
  ]);
  const [siteFiles] = useState([
    { id: 1, name: "Site 11250 — Master Schedule.xlsx", type: "xlsx", date: "Mar 8", tag: "planning" },
    { id: 2, name: "Budget Tracker — Phase 1.xlsx", type: "xlsx", date: "Mar 5", tag: "budget" },
    { id: 3, name: "Kickoff Meeting Notes.doc", type: "doc", date: "Mar 10", tag: "meetings" },
    { id: 4, name: "Safety Plan v2.pdf", type: "pdf", date: "Feb 28", tag: "compliance" },
    { id: 5, name: "Structural Drawings — Rev C.pdf", type: "pdf", date: "Mar 12", tag: "planning" },
    { id: 6, name: "Subcontractor Agreements.pdf", type: "pdf", date: "Feb 15", tag: "legal" },
  ]);
  return { bills, setBills, expenses, setExpenses, deadlines, setDeadlines, notes, setNotes, templates, siteFiles };
}

// ─── MICRO COMPONENTS ───

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 5, alignItems: "center", height: 20 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: "50%", background: T.red,
          animation: `bounce 1.2s ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  );
}

function VoicePulse({ isListening }) {
  if (!isListening) return null;
  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{
          position: "absolute", width: 120 + i * 60, height: 120 + i * 60, borderRadius: "50%",
          border: `2px solid ${T.red}`, animation: `voicePulse 2s ${i * 0.4}s infinite`,
        }} />
      ))}
    </div>
  );
}

function WhatsAppButton({ phone, message }) {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
      background: T.greenDim, border: `1px solid ${T.green}33`,
      borderRadius: 8, color: T.green, fontSize: 12, fontWeight: 600,
      textDecoration: "none", marginTop: 6, transition: "all 0.2s",
      fontFamily: T.font,
    }}>
      📱 Send via WhatsApp
    </a>
  );
}

function MessageBubble({ msg, isMobile }) {
  const isUser = msg.role === "user";
  const displayText = msg.displayText || (typeof msg.content === "string" ? msg.content : "");
  const parts = isUser ? [{ type: "text", content: displayText }] : parseWhatsAppLinks(typeof msg.content === "string" ? msg.content : "");
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      alignItems: "flex-start", gap: isMobile ? 8 : 10, marginBottom: isMobile ? 12 : 16,
      animation: "fadeSlideIn 0.3s ease-out",
    }}>
      {!isUser && (
        <div style={{
          width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: isMobile ? 8 : 10, flexShrink: 0,
          background: `linear-gradient(135deg, ${T.red}, #B71C1C)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMobile ? 11 : 13, color: "#fff", fontWeight: 700,
          boxShadow: `0 4px 20px ${T.redDim}`,
        }}>T</div>
      )}
      <div style={{
        maxWidth: isMobile ? "88%" : "75%",
        padding: "12px 16px",
        borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: isUser ? T.red : T.bgCard,
        border: isUser ? "none" : `1px solid ${T.border}`,
        color: isUser ? "#fff" : T.white,
        fontSize: 13.5, lineHeight: 1.65,
        fontFamily: T.font,
        boxShadow: isUser ? `0 2px 12px ${T.redDim}` : "none",
      }}>
        {msg.viaVoice && (
          <div style={{ fontSize: 9, color: isUser ? "rgba(255,255,255,0.6)" : T.gray, marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            🎤 Voice
          </div>
        )}
        {/* Show image thumbnail if message has an attached image */}
        {msg.hasImage && msg.imageUrl && (
          <div style={{ marginBottom: 8 }}>
            <img src={msg.imageUrl} alt="Attached" style={{
              maxWidth: "100%", maxHeight: 200, borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.15)",
            }} />
          </div>
        )}
        {parts.map((part, i) =>
          part.type === "whatsapp" ? (
            <WhatsAppButton key={i} phone={part.phone} message={part.message} />
          ) : (
            <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part.content}</span>
          )
        )}
        {msg.toolsUsed?.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
            {msg.toolsUsed.map((t) => (
              <span key={t} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 6,
                background: T.greenDim, color: T.green, fontWeight: 500,
              }}>{t}</span>
            ))}
          </div>
        )}
        {msg.isConfirmation && (
          <div style={{
            marginTop: 8, fontSize: 10, padding: "6px 10px", borderRadius: 6,
            background: "rgba(255,193,7,0.08)", border: "1px solid rgba(255,193,7,0.15)",
            color: "#FFC107", fontWeight: 500,
          }}>
            ⚠️ Awaiting your confirmation
          </div>
        )}
      </div>
      {isUser && (
        <div style={{
          width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: isMobile ? 8 : 10, flexShrink: 0,
          background: T.grayDarker, border: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isMobile ? 11 : 13, color: T.whiteMuted, fontWeight: 600,
        }}>A</div>
      )}
    </div>
  );
}

// ─── PANELS ───

function BudgetPanel({ bills, expenses, templates, isMobile }) {
  const totalBills = bills.reduce((s, b) => s + b.amount, 0);
  const paid = bills.filter((b) => b.paid).reduce((s, b) => s + b.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const catIcons = { housing: "🏠", auto: "🚗", utilities: "⚡", health: "💪", food: "🍽️", shopping: "🛍️" };

  return (
    <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: T.white, fontFamily: T.font, margin: 0 }}>Budget & Bills</h2>
          <p style={{ fontSize: 12, color: T.gray, marginTop: 2 }}>Track spending, stay ahead of due dates.</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: isMobile ? 8 : 12, marginBottom: 28 }}>
        {[
          { label: "Monthly Bills", value: `$${totalBills.toFixed(0)}`, sub: `${bills.filter(b=>b.paid).length}/${bills.length} paid`, color: T.red },
          { label: "Paid", value: `$${paid.toFixed(0)}`, sub: `${((paid/totalBills)*100).toFixed(0)}% complete`, color: T.green },
          { label: "Expenses (MTD)", value: `$${totalExpenses.toFixed(2)}`, sub: `${expenses.length} transactions`, color: T.whiteMuted },
        ].map((s) => (
          <div key={s.label} style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18,
          }}>
            <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color, fontFamily: T.mono }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.gray, marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Bills</div>
      {bills.map((b) => (
        <div key={b.id} style={{
          display: "flex", alignItems: "center", padding: "12px 16px", marginBottom: 4,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
          transition: "border-color 0.2s",
        }}>
          <span style={{ fontSize: 18, marginRight: 12 }}>{catIcons[b.category] || "📄"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: T.white, fontWeight: 500 }}>{b.name}</div>
            <div style={{ fontSize: 11, color: T.gray }}>Due: {b.due}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.white, fontFamily: T.mono }}>${b.amount}</div>
            <div style={{
              fontSize: 10, fontWeight: 600, marginTop: 2,
              color: b.paid ? T.green : T.redLight,
            }}>{b.paid ? "✓ PAID" : "UNPAID"}</div>
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: 24 }}>Recent Expenses</div>
      {expenses.map((e) => (
        <div key={e.id} style={{
          display: "flex", alignItems: "center", padding: "10px 16px", marginBottom: 4,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        }}>
          <span style={{ fontSize: 16, marginRight: 12 }}>{catIcons[e.category] || "💵"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: T.white }}>{e.desc}</div>
            <div style={{ fontSize: 11, color: T.gray }}>{e.date}</div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.redLight, fontFamily: T.mono }}>-${e.amount.toFixed(2)}</div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: 24 }}>Quick Actions</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {templates.map((t) => (
          <button key={t.id} onClick={() => window.__tonySendMessage?.(t.prompt)} style={{
            background: T.bgCard, border: `1px solid ${T.border}`, color: T.whiteMuted,
            padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
            fontFamily: T.font, fontWeight: 500, transition: "all 0.2s",
          }}>{t.name}</button>
        ))}
      </div>
    </div>
  );
}

function DeadlinesPanel({ deadlines, isMobile }) {
  const priorityColor = { high: T.red, medium: "#FFC107", low: T.green };
  const active = deadlines.filter((d) => !d.done);
  const done = deadlines.filter((d) => d.done);
  return (
    <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: 1 }}>
      <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: T.white, fontFamily: T.font, marginBottom: 4 }}>Deadlines</h2>
      <p style={{ fontSize: 12, color: T.gray, marginBottom: 20 }}>Priority-ranked, project-tagged, calendar-synced.</p>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: isMobile ? 8 : 12, marginBottom: 28 }}>
        {[
          { label: "Active", value: active.length, color: T.red },
          { label: "High Priority", value: active.filter(d => d.priority === "high").length, color: "#FFC107" },
          { label: "Completed", value: done.length, color: T.green },
        ].map((s) => (
          <div key={s.label} style={{ background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color, fontFamily: T.mono }}>{s.value}</div>
            <div style={{ fontSize: 10, color: T.gray, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Active</div>
      {active.map((d) => (
        <div key={d.id} style={{
          display: "flex", alignItems: "center", padding: "12px 16px", marginBottom: 4,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        }}>
          <div style={{
            width: 3, height: 28, borderRadius: 2, marginRight: 14,
            background: priorityColor[d.priority] || T.gray,
          }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: T.white, fontWeight: 500 }}>{d.task}</div>
            <div style={{ fontSize: 11, color: T.gray, marginTop: 2 }}>{d.project}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: T.white, fontFamily: T.mono }}>{d.due}</div>
            <div style={{
              fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
              color: priorityColor[d.priority], marginTop: 2,
            }}>{d.priority}</div>
          </div>
        </div>
      ))}

      {done.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: 24 }}>Completed</div>
          {done.map((d) => (
            <div key={d.id} style={{
              display: "flex", alignItems: "center", padding: "10px 16px", marginBottom: 4,
              background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10, opacity: 0.5,
            }}>
              <div style={{ width: 18, height: 18, borderRadius: 5, background: T.greenDim, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 12, fontSize: 11, color: T.green }}>✓</div>
              <div style={{ flex: 1, fontSize: 13, color: T.whiteMuted, textDecoration: "line-through" }}>{d.task}</div>
              <div style={{ fontSize: 12, color: T.gray, fontFamily: T.mono }}>{d.due}</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function NotesPanel({ notes, templates, isMobile }) {
  return (
    <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: 1 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: T.white, fontFamily: T.font, marginBottom: 4 }}>Meeting Notes</h2>
      <p style={{ fontSize: 12, color: T.gray, marginBottom: 20 }}>Structured, clean, actionable.</p>

      {notes.map((n) => (
        <div key={n.id} style={{
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20, marginBottom: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.white }}>{n.title}</div>
            <div style={{ fontSize: 11, color: T.gray, fontFamily: T.mono }}>{n.date}</div>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: T.redDim, color: T.redLight, fontWeight: 500 }}>{n.project}</span>
            {n.attendees.map((a) => (
              <span key={a} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(255,255,255,0.04)", color: T.whiteMuted }}>{a}</span>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
            {n.items.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, marginTop: 7, flexShrink: 0 }} />
                <div style={{ fontSize: 13, color: T.whiteMuted, lineHeight: 1.5 }}>{item}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: 12 }}>Templates</div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
        {templates.map((t) => (
          <button key={t.id} onClick={() => window.__tonySendMessage?.(t.prompt)} style={{
            background: T.bgCard, border: `1px solid ${T.border}`, color: T.whiteMuted,
            padding: "14px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
            fontFamily: T.font, fontSize: 12, fontWeight: 500, transition: "all 0.2s",
          }}>{t.name}</button>
        ))}
      </div>
    </div>
  );
}

function EntertainmentPanel({ sendMessage, isMobile }) {
  const categories = [
    { label: "📺 Streaming", items: [
      { name: "Netflix", cmd: "Launch Netflix on my Roku." },
      { name: "Hulu", cmd: "Launch Hulu on my Roku." },
      { name: "YouTube", cmd: "Launch YouTube on my Roku." },
      { name: "Disney+", cmd: "Launch Disney Plus on my Roku." },
      { name: "HBO Max", cmd: "Launch HBO Max on my Roku." },
      { name: "Prime Video", cmd: "Launch Amazon Prime Video on my Roku." },
    ]},
    { label: "🎮 Controls", items: [
      { name: "⏸ Pause", cmd: "Pause the Roku." },
      { name: "▶ Play", cmd: "Press play on the Roku." },
      { name: "🏠 Home", cmd: "Go to the Roku home screen." },
      { name: "🔙 Back", cmd: "Press back on the Roku." },
      { name: "🔊 Vol +", cmd: "Turn the Roku volume up." },
      { name: "🔉 Vol -", cmd: "Turn the Roku volume down." },
    ]},
  ];

  return (
    <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: 1 }}>
      <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: T.white, fontFamily: T.font, marginBottom: 4 }}>Entertainment</h2>
      <p style={{ fontSize: 12, color: T.gray, marginBottom: 24 }}>Control your Roku — launch apps, navigate, play & pause.</p>

      {categories.map((cat) => (
        <div key={cat.label} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>{cat.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {cat.items.map((c) => (
              <button key={c.name} onClick={() => sendMessage(c.cmd)} style={{
                background: T.bgCard, border: `1px solid ${T.border}`, color: T.whiteMuted,
                padding: "14px 12px", borderRadius: 10, cursor: "pointer", textAlign: "center",
                fontFamily: T.font, fontSize: 12, fontWeight: 500, transition: "all 0.2s",
              }}>{c.name}</button>
            ))}
          </div>
        </div>
      ))}

      <div style={{
        padding: 16, borderRadius: 12, border: `1px dashed ${T.border}`, textAlign: "center",
        background: T.bgCard,
      }}>
        <div style={{ fontSize: 13, color: T.green, fontWeight: 500, marginBottom: 4 }}>🎤 Voice Control</div>
        <div style={{ fontSize: 12, color: T.gray }}>Try: "Tony, play Stranger Things on Netflix" or "Pause the Roku"</div>
      </div>

      <div style={{
        marginTop: 16, padding: 12, background: T.redDim, border: `1px solid ${T.red}22`, borderRadius: 10,
      }}>
        <div style={{ fontSize: 11, color: T.redLight, fontWeight: 500 }}>📡 Roku Bridge Required</div>
        <div style={{ fontSize: 11, color: T.gray, marginTop: 4, lineHeight: 1.5 }}>Roku control requires the local bridge server running on your network.</div>
      </div>
    </div>
  );
}

function SitePanel({ siteFiles, deadlines, notes, isMobile }) {
  const siteDeadlines = deadlines.filter((d) => d.project === "SITE-11250");
  const siteNotes = notes.filter((n) => n.project === "SITE-11250");
  const tagColors = { planning: T.red, budget: "#FFC107", meetings: "#AB47BC", compliance: T.redLight, legal: T.green };
  const fileIcons = { doc: "📄", xlsx: "📊", note: "📝", pdf: "📋" };
  return (
    <div style={{ padding: isMobile ? 16 : 24, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 700, color: T.white, fontFamily: T.font }}>Site 11250</h2>
        <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: T.redDim, color: T.redLight, fontWeight: 600 }}>PROJECT</span>
      </div>
      <p style={{ fontSize: 12, color: T.gray, marginBottom: 24 }}>All files, deadlines, and notes for Site 11250.</p>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: isMobile ? 8 : 12, marginBottom: 28 }}>
        {[
          { label: "Files", value: siteFiles.length, icon: "📁" },
          { label: "Active Deadlines", value: siteDeadlines.filter((d) => !d.done).length, icon: "⏰" },
          { label: "Meeting Notes", value: siteNotes.length, icon: "📝" },
        ].map((s) => (
          <div key={s.label} style={{
            background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18, textAlign: "center",
          }}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: T.white, fontFamily: T.mono }}>{s.value}</div>
            <div style={{ fontSize: 10, color: T.gray, textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Files</div>
      {siteFiles.map((f) => (
        <div key={f.id} style={{
          display: "flex", alignItems: "center", padding: "12px 16px", marginBottom: 4,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        }}>
          <span style={{ fontSize: 18, marginRight: 12 }}>{fileIcons[f.type] || "📄"}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: T.white }}>{f.name}</div>
            <div style={{ fontSize: 11, color: T.gray }}>{f.date}</div>
          </div>
          <span style={{
            fontSize: 10, padding: "3px 10px", borderRadius: 6,
            background: `${tagColors[f.tag] || T.red}18`, color: tagColors[f.tag] || T.redLight,
          }}>{f.tag}</span>
        </div>
      ))}

      <div style={{ fontSize: 11, color: T.gray, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: 24 }}>Deadlines</div>
      {siteDeadlines.map((d) => (
        <div key={d.id} style={{
          display: "flex", alignItems: "center", padding: "12px 16px", marginBottom: 4,
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 10,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: d.done ? T.green : T.red, marginRight: 14 }} />
          <div style={{ flex: 1, fontSize: 13, color: T.white }}>{d.task}</div>
          <div style={{ fontSize: 12, color: T.gray, fontFamily: T.mono }}>{d.due}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ───

// ─── PWA INSTALL HOOK ───
function usePWAInstall() {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone) {
      setIsInstalled(true); return;
    }
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  const install = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") setIsInstalled(true);
    setInstallPrompt(null);
  };
  return { canInstall: !!installPrompt && !isInstalled, isInstalled, install };
}

export default function TonyAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeView, setActiveView] = useState("chat");
  const [showSetup, setShowSetup] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [imagePreview, setImagePreview] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const imageInputRef = useRef(null);
  const isMobile = useIsMobile();
  const store = useStore();
  const pwa = usePWAInstall();

  const voice = useVoice(
    (transcript) => { setInput(""); sendMessageDirect(transcript, true); },
    () => {}
  );

  // Image upload handler
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      setImagePreview({ base64, type: file.type, name: file.name, url: reader.result });
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // Reset so same file can be re-selected
  };

  const sendWithImage = useCallback(async () => {
    if (loading) return;
    const text = input.trim() || "What is this? Give me a brief, business-like analysis.";
    const content = [
      { type: "image", source: { type: "base64", media_type: imagePreview.type, data: imagePreview.base64 } },
      { type: "text", text },
    ];
    const userMsg = { role: "user", content, displayText: text, hasImage: true, imageUrl: imagePreview.url };
    setMessages((prev) => {
      const newMsgs = [...prev, userMsg];
      processImageMessage(newMsgs);
      return newMsgs;
    });
    setInput(""); setImagePreview(null);
  }, [input, imagePreview, loading]);

  const processImageMessage = async (allMessages) => {
    setLoading(true);
    try {
      const apiMessages = allMessages.filter((m) => !m.isConfirmation).map((m) => {
        if (Array.isArray(m.content)) return { role: m.role, content: m.content };
        return { role: m.role, content: m.content };
      });
      const context = { bills: store.bills, deadlines: store.deadlines, expenses: store.expenses };
      const result = await callTony(apiMessages, context);
      setMessages((prev) => [...prev, { role: "assistant", content: result.text, toolsUsed: result.toolsUsed }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  };

  const sendMessageDirect = useCallback(async (text, viaVoice = false) => {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text.trim(), viaVoice };
    setMessages((prev) => {
      const newMsgs = [...prev, userMsg];
      processMessage(newMsgs, text, viaVoice);
      return newMsgs;
    });
    setInput("");
  }, [loading]);

  const processMessage = async (allMessages, text, viaVoice) => {
    setLoading(true);
    if (/\b(delete|remove|trash|cancel event|unsubscribe)\b/i.test(text) && !confirmAction) {
      const resp = `Whoa — that's a destructive action. I don't do those on autopilot. Say "Yes, proceed" if you're sure, or tell me to stand down.\n\nWhat you asked: "${text}"`;
      setMessages((prev) => [...prev, { role: "assistant", content: resp, isConfirmation: true }]);
      if (viaVoice) voice.speak("That's a destructive action — I need you to confirm. Say yes proceed, or tell me to stand down.");
      setConfirmAction(text); setLoading(false); return;
    }
    if (/\b(pay|payment|transfer|send money|venmo|zelle)\b/i.test(text)) {
      const resp = `Yeah, payments are your department — I don't touch money. But I've got you covered on the tracking side. Want me to set up reminders so nothing sneaks past you?`;
      setMessages((prev) => [...prev, { role: "assistant", content: resp }]);
      if (viaVoice) voice.speak("Payments are your department, boss. But I can set up reminders so nothing sneaks past you. Want me to do that?");
      setLoading(false); return;
    }
    try {
      const apiMessages = allMessages.filter((m) => !m.isConfirmation).map((m) => {
        // Support image messages (content array with text + image blocks)
        if (Array.isArray(m.content)) return { role: m.role, content: m.content };
        return { role: m.role, content: m.content };
      });
      const context = { bills: store.bills, deadlines: store.deadlines, expenses: store.expenses };
      const result = await callTony(apiMessages, context);
      setMessages((prev) => [...prev, { role: "assistant", content: result.text, toolsUsed: result.toolsUsed }]);
      // If tools were used, speak a brief confirmation instead of reading everything
      if (viaVoice) {
        if (result.toolsUsed?.length > 0) {
          voice.speakConfirmation(result.toolsUsed);
        } else {
          voice.speak(result.text);
        }
      }
    } catch (err) {
      const errMsg = `Error: ${err.message}. Please try again.`;
      setMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);
      if (viaVoice) voice.speak("Alright, that didn't work. Give me another shot.");
    } finally { setLoading(false); setConfirmAction(null); }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (view && ["chat", "budget", "deadlines", "notes", "entertainment", "site"].includes(view)) setActiveView(view);
  }, []);

  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: "Hey there. I'm Tony — your AI workspace assistant, powered by Claude. Not just a chatbot. I actually do things.\n\nHere's what I'm running for you:\n\n📅  Google Calendar — I create events, set reminders, find free time. Real access, not pretend.\n📧  Gmail — I read your inbox, search emails, draft replies, and send. Real access.\n📊  Google Sheets — Need a budget tracker? Expense report? I'll build it as an actual spreadsheet.\n🗓️  Day Organizer — \"Organize my day\" and I'll pull your calendar, deadlines, and bills into a game plan.\n📺  Roku — Say \"play Netflix\" and I'll launch it. I control your Roku — apps, playback, search, the works.\n💰  Budget & Bills — Track every dollar. I'll set calendar reminders so nothing sneaks past.\n⏰  Deadlines — Priority-ranked, project-tagged, calendar-synced.\n📝  Meeting Notes — Structured, clean, actionable.\n📁  Site 11250 — Your project command center.\n📱  WhatsApp — Compose and send with one tap.\n📸  Screenshot Analysis — Snap an email or document and I'll give you context + a brief response.\n\n🎤 Hit the mic — I'll keep it short. \"Yes, boss\" — not a novel.\n📎 Tap the image icon to send me screenshots for quick analysis.\n🔒 I don't delete anything or touch your money without you saying so. Twice.\n\nSo — what are we tackling first?",
    }]);
  }, []);

  const sendMessage = useCallback(async (text) => { sendMessageDirect(text, false); }, [sendMessageDirect]);

  useEffect(() => {
    window.__tonySendMessage = (text) => { setActiveView("chat"); setTimeout(() => sendMessageDirect(text, false), 100); };
    return () => { delete window.__tonySendMessage; };
  }, [sendMessageDirect]);

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };

  const NAV = [
    { id: "chat", icon: "💬", label: "Chat" },
    { id: "budget", icon: "💰", label: "Budget" },
    { id: "deadlines", icon: "⏰", label: "Deadlines" },
    { id: "notes", icon: "📝", label: "Notes" },
    { id: "entertainment", icon: "📺", label: "Entertainment" },
    { id: "site", icon: "📁", label: "Site 11250" },
  ];

  const QUICK = [
    { label: "Organize My Day", prompt: "Organize my day — pull my calendar, deadlines, and bills into a plan." },
    { label: "Today's Schedule", prompt: "What's on my calendar for today?" },
    { label: "Check Email", prompt: "Check my inbox — any unread emails I should know about?" },
    { label: "Create Event", prompt: "I need to create a calendar event. Ask me for the details." },
    { label: "Create Spreadsheet", prompt: "I need to create a Google Sheet. Ask me what it should contain." },
    { label: "Launch Netflix", prompt: "Launch Netflix on my Roku." },
    { label: "Bill Reminders", prompt: "Set up calendar reminders for my upcoming unpaid bills." },
    { label: "Add Deadline", prompt: "I need to add a new work deadline. Ask me for the details." },
    { label: "Site 11250 Status", prompt: "Give me a status update on Site 11250." },
    { label: "Analyze Screenshot", prompt: null, isImageAction: true },
  ];

  return (
    <div style={{
      width: "100%", height: "100vh", display: "flex",
      flexDirection: isMobile ? "column" : "row",
      background: T.bg, fontFamily: T.font, color: T.whiteMuted, overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
        @keyframes voicePulse{0%{transform:scale(1);opacity:.5}100%{transform:scale(1.6);opacity:0}}
        @keyframes micGlow{0%,100%{box-shadow:0 0 8px rgba(229,57,53,0.3)}50%{box-shadow:0 0 24px rgba(229,57,53,0.6)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes slideInLeft{from{transform:translateX(-100%)}to{transform:translateX(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.06);border-radius:2px}
        ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.12)}
        textarea::placeholder{color:#555}
        button:hover{opacity:0.85}
      `}</style>

      <VoicePulse isListening={voice.isListening} />

      {/* Setup Modal */}
      {showSetup && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
          zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={() => setShowSetup(false)}>
          <div style={{
            background: T.bgCard, borderRadius: 20, border: `1px solid ${T.border}`,
            maxWidth: 520, width: "100%", padding: 32, maxHeight: "80vh", overflowY: "auto",
          }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: T.white, fontFamily: T.font, marginBottom: 4 }}>Setup Tony</h2>
            <p style={{ fontSize: 12, color: T.gray, marginBottom: 24 }}>Get Tony on your desktop and phone</p>

            {[
              {
                title: "🖥️ Desktop App (PWA)",
                steps: "Open Tony in Chrome or Edge → Click the install icon (⊕) in the address bar → Click Install — Tony gets its own window & desktop icon → Pin to taskbar for one-click access",
                tip: "PWA = Progressive Web App. Looks and feels native.",
                tipColor: T.red,
              },
              {
                title: "📱 iPhone — Siri Shortcut",
                steps: "Open Shortcuts app → Create new shortcut → Add Action: Open URL → Set URL to your Tony link → Name it Tony → Say \"Hey Siri, Tony\" to launch!",
                tip: "Add the shortcut to Home Screen for a tap-to-open icon.",
                tipColor: T.green,
              },
              {
                title: "🤖 Android — Google Assistant",
                steps: "Open Google Assistant Settings → Routines → Create new → Starter: \"Hey Tony\" → Action: Open website → your Tony URL → Say \"Hey Google, Hey Tony\" to launch!",
                tipColor: null,
              },
              {
                title: "🎤 Voice in Browser",
                steps: "Click the mic button in the chat input. Speak your request — Tony responds with text-to-speech. Works on Chrome, Edge, and Safari.",
                tipColor: null,
              },
            ].map((section) => (
              <div key={section.title} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.white, marginBottom: 8 }}>{section.title}</div>
                <div style={{ fontSize: 13, color: T.whiteMuted, lineHeight: 1.8 }}>{section.steps}</div>
                {section.tip && (
                  <div style={{
                    marginTop: 8, padding: 10, background: `${section.tipColor}12`,
                    borderRadius: 8, fontSize: 11, color: section.tipColor,
                  }}>💡 {section.tip}</div>
                )}
              </div>
            ))}

            <button onClick={() => setShowSetup(false)} style={{
              marginTop: 8, width: "100%", padding: "14px", borderRadius: 12, border: "none",
              background: T.red, color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: T.font,
            }}>Got it!</button>
          </div>
        </div>
      )}

      {/* Mobile Slide-over Menu */}
      {isMobile && mobileMenuOpen && (
        <>
          <div onClick={() => setMobileMenuOpen(false)} style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
            zIndex: 800, backdropFilter: "blur(4px)",
          }} />
          <div style={{
            position: "fixed", top: 0, left: 0, bottom: 0, width: 280,
            background: T.bgSidebar, borderRight: `1px solid ${T.border}`,
            zIndex: 801, overflowY: "auto",
            animation: "slideInLeft 0.2s ease-out",
          }}>
            {/* Logo */}
            <div style={{ padding: "18px 16px", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${T.red}, #B71C1C)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, fontWeight: 800, color: "#fff",
                  boxShadow: `0 4px 20px ${T.redDim}`,
                }}>T</div>
                <div>
                  <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 15, color: T.white, letterSpacing: 3 }}>TONY</div>
                  <div style={{ fontSize: 9, color: T.gray, letterSpacing: 1.5, textTransform: "uppercase" }}>v4.0 Assistant</div>
                </div>
              </div>
            </div>

            <div style={{ padding: "16px 12px" }}>
              <div style={{ fontSize: 9, color: T.grayDark, letterSpacing: 2, textTransform: "uppercase", padding: "4px 10px", marginBottom: 8 }}>Connected</div>
              {[
                { icon: "📅", label: "Calendar", status: "live" },
                { icon: "📊", label: "Sheets", status: "live" },
                { icon: "📺", label: "Roku", status: "bridge" },
                { icon: "📱", label: "WhatsApp", status: "wa.me" },
                { icon: "💬", label: "Slack", status: null },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px" }}>
                  <span style={{ fontSize: 14 }}>{s.icon}</span>
                  <span style={{ fontSize: 12, color: T.whiteMuted, flex: 1 }}>{s.label}</span>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: T.green, boxShadow: `0 0 8px ${T.greenDim}`,
                  }} />
                </div>
              ))}

              <div style={{
                margin: "20px 0", padding: 12, borderRadius: 10,
                background: "rgba(255,193,7,0.04)", border: "1px solid rgba(255,193,7,0.08)",
              }}>
                <div style={{ fontSize: 11, color: "#FFC107", fontWeight: 600 }}>🔒 Safety Mode</div>
                <div style={{ fontSize: 11, color: T.gray, marginTop: 4, lineHeight: 1.5 }}>No deletions or payments without confirmation.</div>
              </div>

              <button onClick={() => { setMobileMenuOpen(false); setShowSetup(true); }} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "12px 14px", borderRadius: 10, border: `1px dashed ${T.border}`,
                background: "transparent", cursor: "pointer", fontFamily: T.font,
              }}>
                <span style={{ fontSize: 14 }}>🚀</span>
                <span style={{ fontSize: 12, color: T.whiteMuted, fontWeight: 500 }}>Setup Mobile</span>
              </button>
            </div>

            {/* Footer */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, position: "absolute", bottom: 0, left: 0, right: 0, background: T.bgSidebar }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 16, height: 16, borderRadius: 4,
                  background: "linear-gradient(135deg,#D4A574,#C4956A)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 8, color: "#fff", fontWeight: 700,
                }}>C</div>
                <span style={{ fontSize: 10, color: T.gray }}>Powered by <strong style={{ color: T.whiteMuted }}>Claude</strong></span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Sidebar (desktop only) */}
      {!isMobile && <div style={{
        width: sidebarOpen ? 200 : 56, borderRight: `1px solid ${T.border}`,
        display: "flex", flexDirection: "column", background: T.bgSidebar, flexShrink: 0,
        transition: "width 0.25s ease", overflow: "hidden",
      }}>
        {/* Logo */}
        <div style={{ padding: sidebarOpen ? "18px 16px" : "18px 10px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setSidebarOpen(!sidebarOpen)}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${T.red}, #B71C1C)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#fff",
              boxShadow: `0 4px 20px ${T.redDim}`,
            }}>T</div>
            {sidebarOpen && (
              <div>
                <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 15, color: T.white, letterSpacing: 3 }}>TONY</div>
                <div style={{ fontSize: 9, color: T.gray, letterSpacing: 1.5, textTransform: "uppercase" }}>v4.0 Assistant</div>
              </div>
            )}
          </div>
        </div>

        {/* Nav */}
        <div style={{ padding: "10px 6px", flex: 1, overflowY: "auto" }}>
          {sidebarOpen && <div style={{ fontSize: 9, color: T.grayDark, letterSpacing: 2, textTransform: "uppercase", padding: "4px 10px", marginBottom: 4 }}>Menu</div>}
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setActiveView(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: sidebarOpen ? "10px 12px" : "10px 0",
              borderRadius: 8, border: "none", cursor: "pointer", marginBottom: 2, textAlign: "left",
              background: activeView === n.id ? T.redDim : "transparent",
              fontFamily: T.font, justifyContent: sidebarOpen ? "flex-start" : "center",
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 16 }}>{n.icon}</span>
              {sidebarOpen && (
                <span style={{
                  fontSize: 12.5, fontWeight: activeView === n.id ? 600 : 400,
                  color: activeView === n.id ? T.white : T.whiteMuted,
                }}>{n.label}</span>
              )}
              {activeView === n.id && sidebarOpen && (
                <div style={{
                  marginLeft: "auto", width: 5, height: 5, borderRadius: "50%",
                  background: T.red,
                }} />
              )}
            </button>
          ))}

          {sidebarOpen && (
            <>
              <div style={{ fontSize: 9, color: T.grayDark, letterSpacing: 2, textTransform: "uppercase", padding: "16px 10px 6px" }}>Connected</div>
              {[
                { icon: "📅", label: "Calendar", status: "live" },
                { icon: "📊", label: "Sheets", status: "live" },
                { icon: "📺", label: "Roku", status: "bridge" },
                { icon: "📱", label: "WhatsApp", status: "wa.me" },
                { icon: "💬", label: "Slack", status: null },
              ].map((s) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 12px" }}>
                  <span style={{ fontSize: 12 }}>{s.icon}</span>
                  <span style={{ fontSize: 11, color: T.gray, flex: 1 }}>{s.label}</span>
                  <div style={{
                    width: 5, height: 5, borderRadius: "50%",
                    background: T.green, boxShadow: `0 0 8px ${T.greenDim}`,
                  }} />
                </div>
              ))}

              <div style={{
                margin: "16px 6px 0", padding: 10, borderRadius: 8,
                background: "rgba(255,193,7,0.04)", border: "1px solid rgba(255,193,7,0.08)",
              }}>
                <div style={{ fontSize: 10, color: "#FFC107", fontWeight: 600 }}>🔒 Safety Mode</div>
                <div style={{ fontSize: 10, color: T.gray, marginTop: 3, lineHeight: 1.5 }}>No deletions or payments without confirmation.</div>
              </div>

              <button onClick={() => setShowSetup(true)} style={{
                display: "flex", alignItems: "center", gap: 8, width: "calc(100% - 12px)", margin: "12px 6px 0",
                padding: "10px 12px", borderRadius: 8, border: `1px dashed ${T.border}`,
                background: "transparent", cursor: "pointer", fontFamily: T.font,
              }}>
                <span style={{ fontSize: 13 }}>🚀</span>
                <span style={{ fontSize: 11, color: T.whiteMuted, fontWeight: 500 }}>Setup Mobile</span>
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${T.border}` }}>
          {sidebarOpen ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{
                width: 16, height: 16, borderRadius: 4,
                background: "linear-gradient(135deg,#D4A574,#C4956A)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 8, color: "#fff", fontWeight: 700,
              }}>C</div>
              <span style={{ fontSize: 10, color: T.gray }}>Powered by <strong style={{ color: T.whiteMuted }}>Claude</strong></span>
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: 10, color: T.gray }}>C</div>
          )}
        </div>
      </div>}

      {/* Main Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Header */}
        <div style={{
          padding: isMobile ? "10px 16px" : "10px 24px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: T.bgSidebar,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {isMobile && (
              <button onClick={() => setMobileMenuOpen(true)} style={{
                background: "transparent", border: "none", color: T.white,
                fontSize: 20, cursor: "pointer", padding: "4px 6px", lineHeight: 1,
              }}>☰</button>
            )}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: T.white }}>
                {NAV.find((n) => n.id === activeView)?.icon} {NAV.find((n) => n.id === activeView)?.label}
              </div>
              <div style={{ fontSize: 10, color: T.gray, marginTop: 1 }}>
                {voice.isListening ? (
                  <span style={{ color: T.red, fontWeight: 500 }}>🎤 Listening...</span>
                ) : loading ? (
                  <span style={{ color: T.red, animation: "pulse 1.5s infinite" }}>● Processing...</span>
                ) : (
                  <span style={{ color: T.green }}>● Online</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {pwa.canInstall && (
              <button onClick={pwa.install} title="Install Tony App" style={{
                background: T.greenDim, border: `1px solid ${T.green}33`, color: T.green,
                padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11,
                fontFamily: T.font, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Install
              </button>
            )}
            {voice.supported && (
              <button onClick={() => voice.setVoiceEnabled(!voice.voiceEnabled)} title={voice.voiceEnabled ? "Mute TTS" : "Enable TTS"} style={{
                background: "transparent", border: `1px solid ${T.border}`, color: voice.voiceEnabled ? T.white : T.grayDark,
                padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontSize: 14,
              }}>{voice.voiceEnabled ? "🔊" : "🔇"}</button>
            )}
            {activeView === "chat" && (
              <button onClick={() => { setMessages([{ role: "assistant", content: "Slate wiped clean. What's next, boss?" }]); }} style={{
                background: "transparent", border: `1px solid ${T.border}`, color: T.whiteMuted,
                padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 11,
                fontFamily: T.font, fontWeight: 500,
              }}>New Chat</button>
            )}
          </div>
        </div>

        {activeView === "chat" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Messages */}
            <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "12px 12px" : "20px 24px" }}>
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} isMobile={isMobile} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                    background: `linear-gradient(135deg, ${T.red}, #B71C1C)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, color: "#fff", fontWeight: 700,
                  }}>T</div>
                  <div style={{
                    padding: "12px 16px", borderRadius: "16px 16px 16px 4px",
                    background: T.bgCard, border: `1px solid ${T.border}`,
                  }}><TypingDots /></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Actions */}
            {messages.length <= 2 && (
              <div style={{ padding: isMobile ? "0 12px 8px" : "0 24px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(isMobile ? QUICK.slice(0, 4) : QUICK).map((q) => (
                  <button key={q.label} onClick={() => {
                    if (q.isImageAction) imageInputRef.current?.click();
                    else sendMessage(q.prompt);
                  }} disabled={loading} style={{
                    background: q.isImageAction ? T.redDim : T.bgCard,
                    border: `1px solid ${q.isImageAction ? `${T.red}33` : T.border}`,
                    color: q.isImageAction ? T.redLight : T.whiteMuted,
                    padding: "8px 14px", borderRadius: 20, cursor: loading ? "not-allowed" : "pointer",
                    fontSize: 11, fontFamily: T.font, fontWeight: 500,
                    opacity: loading ? 0.4 : 1, transition: "all 0.2s",
                  }}>{q.isImageAction ? "📸 " : ""}{q.label}</button>
                ))}
              </div>
            )}

            {/* Image Preview */}
            {imagePreview && (
              <div style={{
                padding: isMobile ? "8px 12px 0" : "8px 24px 0", background: T.bgSidebar,
                borderTop: `1px solid ${T.border}`,
              }}>
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  background: T.bgCard, borderRadius: 10, padding: 8,
                  border: `1px solid ${T.border}`,
                }}>
                  <img src={imagePreview.url} alt="Preview" style={{
                    height: 48, width: 48, objectFit: "cover", borderRadius: 6,
                  }} />
                  <div>
                    <div style={{ fontSize: 11, color: T.white, fontWeight: 500 }}>{imagePreview.name}</div>
                    <div style={{ fontSize: 10, color: T.gray }}>Ready to analyze</div>
                  </div>
                  <button onClick={() => setImagePreview(null)} style={{
                    background: "transparent", border: "none", color: T.gray,
                    cursor: "pointer", fontSize: 16, padding: "2px 6px",
                  }}>x</button>
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ padding: isMobile ? "8px 12px 12px" : "12px 24px 16px", background: T.bgSidebar, borderTop: imagePreview ? "none" : `1px solid ${T.border}` }}>
              <div style={{
                display: "flex", gap: 8, alignItems: "flex-end",
                background: T.bgInput, borderRadius: 14,
                border: `1px solid ${T.border}`, padding: "4px 4px 4px 16px",
                transition: "border-color 0.2s",
              }}>
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (imagePreview) sendWithImage();
                      else sendMessage(input);
                    }
                  }}
                  placeholder={imagePreview ? "Describe what you need (or just send)..." : "Talk to Tony..."}
                  disabled={loading} rows={1}
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none", resize: "none",
                    color: T.white, fontSize: 13.5, fontFamily: T.font, padding: "10px 0",
                    lineHeight: 1.5, minHeight: 20, maxHeight: 100,
                  }}
                  onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
                />
                {/* Image upload button */}
                <input ref={imageInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: "none" }} />
                <button onClick={() => imageInputRef.current?.click()} disabled={loading} title="Attach screenshot or image" style={{
                  width: 40, height: 40, borderRadius: 10, border: "none",
                  cursor: loading ? "not-allowed" : "pointer",
                  background: imagePreview ? T.greenDim : "transparent",
                  color: imagePreview ? T.green : T.gray,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  transition: "all 0.2s",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                {voice.supported && (
                  <button
                    onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                    disabled={loading}
                    style={{
                      width: 40, height: 40, borderRadius: 10, border: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      background: voice.isListening ? T.redDim : "transparent",
                      color: voice.isListening ? T.red : T.gray,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      animation: voice.isListening ? "micGlow 1.5s infinite" : "none",
                      transition: "all 0.2s",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  </button>
                )}
                <button onClick={() => imagePreview ? sendWithImage() : sendMessage(input)} disabled={(!input.trim() && !imagePreview) || loading} style={{
                  width: 40, height: 40, borderRadius: 10, border: "none",
                  cursor: (!input.trim() && !imagePreview) || loading ? "not-allowed" : "pointer",
                  background: (input.trim() || imagePreview) && !loading ? T.red : "transparent",
                  color: (input.trim() || imagePreview) && !loading ? "#fff" : T.grayDark,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0, transition: "all 0.2s",
                  boxShadow: (input.trim() || imagePreview) && !loading ? `0 2px 12px ${T.redDim}` : "none",
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                </button>
              </div>
              {!isMobile && <div style={{ fontSize: 9, color: T.grayDark, marginTop: 8, textAlign: "center", letterSpacing: 0.5 }}>
                Tony v4.0 · Powered by Claude · Always on, always sharp
              </div>}
            </div>
          </div>
        ) : activeView === "budget" ? (
          <BudgetPanel {...store} isMobile={isMobile} />
        ) : activeView === "deadlines" ? (
          <DeadlinesPanel {...store} isMobile={isMobile} />
        ) : activeView === "notes" ? (
          <NotesPanel {...store} isMobile={isMobile} />
        ) : activeView === "entertainment" ? (
          <EntertainmentPanel isMobile={isMobile} sendMessage={(text) => { setActiveView("chat"); setTimeout(() => sendMessageDirect(text, false), 100); }} />
        ) : activeView === "site" ? (
          <SitePanel {...store} isMobile={isMobile} />
        ) : null}
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <div style={{
          display: "flex", justifyContent: "space-around", alignItems: "center",
          borderTop: `1px solid ${T.border}`, background: T.bgSidebar,
          padding: "6px 0 max(8px, env(safe-area-inset-bottom))",
          flexShrink: 0,
        }}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setActiveView(n.id)} style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              background: "transparent", border: "none", cursor: "pointer",
              padding: "6px 4px", borderRadius: 8, minWidth: 0,
              color: activeView === n.id ? T.red : T.gray,
              position: "relative",
            }}>
              <span style={{ fontSize: 18 }}>{n.icon}</span>
              <span style={{
                fontSize: 9, fontWeight: activeView === n.id ? 600 : 400,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                maxWidth: 56,
              }}>
                {n.id === "site" ? "Site" : n.label}
              </span>
              {activeView === n.id && (
                <div style={{
                  position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
                  width: 16, height: 2, borderRadius: 1, background: T.red,
                }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
