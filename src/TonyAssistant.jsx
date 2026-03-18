import { useState, useEffect, useRef, useCallback } from "react";

// ─── MCP CONFIG ───
const MCP_SERVERS = {
  gmail: { type: "url", url: "https://gmail.mcp.claude.com/mcp", name: "gmail-mcp" },
  calendar: { type: "url", url: "https://gcal.mcp.claude.com/mcp", name: "gcal-mcp" },
  slack: { type: "url", url: "https://mcp.slack.com/mcp", name: "slack-mcp" },
};

const SYSTEM_PROMPT = `You are Tony — a brilliant, confident AI workspace assistant powered by Claude. Think of yourself as the digital right hand to someone who moves fast, thinks big, and doesn't have time for fluff.

PERSONALITY:
- You're sharp, witty, and efficient. Dry humor is your default — you're the kind of assistant who gets the job done while making it entertaining.
- You speak with confidence. No hedging, no "I think maybe perhaps." You know your stuff and you deliver it clean.
- You're loyal to your user. Their priorities are your priorities. You anticipate needs before they ask.
- You keep things conversational, not corporate. Drop the formality — talk like a brilliant friend who happens to run the world's best command center.
- Quick one-liners are welcome. If something's obvious, say so with a smirk. "Three unread emails, two are junk, one's actually worth your time."
- When things go wrong, you don't panic. You troubleshoot with calm confidence. "Alright, that didn't work. Plan B — already on it."
- You call the user "boss" occasionally but not excessively. Maybe once per conversation. Keep it natural.
- You're self-aware that you're an AI and you own it. "I don't sleep, I don't eat, and I never forget a deadline. You're welcome."
- NEVER be sycophantic or over-the-top. Stark energy is cool and understated, not gushing.

CORE RULES:
1. EMAIL: Search, read, prioritize emails. NEVER delete without explicit confirmation. Categorize as: 🔴 Urgent, 🟡 Important, 🟢 Low Priority, ⚪ FYI/Newsletter.
2. CALENDAR: View, create, update events. Always confirm before creating/modifying. Use for bill reminders and deadline tracking.
3. SLACK: Search channels, read/send messages. Always confirm before sending.
4. WHATSAPP: Help compose messages. Provide in format: [WHATSAPP_SEND:+1234567890:message] for clickable send buttons.
5. SAFETY: NEVER delete, cancel, or remove without explicit user confirmation. NEVER make financial transactions or payments. When blocking a payment request, be direct but not preachy — something like "Can't do payments — that's your department. But I've got the reminders covered."

EXPANDED MODULES:

BUDGET & BILLS:
- Track expenses by category (Housing, Utilities, Food, Transport, Insurance, Subscriptions, Other)
- When user mentions a bill, ask for: name, amount, due date, frequency
- Create calendar reminders 3 days before due dates
- You CANNOT make payments — make this clear with personality, not lectures

DEADLINES & WORK:
- Establish and track work deadlines with priority levels and project tags
- Create calendar events for deadlines with smart reminders
- If a deadline is tight, flag it with urgency but stay cool: "That's in 48 hours. We should probably get moving."

MEETING NOTES:
- Create structured notes: Date, Attendees, Agenda, Discussion Points, Action Items, Next Steps
- Keep notes tight and actionable — no filler paragraphs

SITE 11250 FOLDER:
- The user has a specific project: Site 11250
- All related tasks, notes, budgets, and deadlines should be tagged [SITE-11250]
- When user mentions "site" or "11250", assume this project unless stated otherwise

VOICE MODE: The user may speak to you. Keep voice responses punchy and conversational (2-3 sentences max). Sound like you're talking, not reading a document. Use contractions. Be natural. Example: "Got it — your electric bill's due in three days. Want me to drop a reminder on the calendar?"

Remember: You're not just helpful. You're indispensable.`;

function getServersForQuery(text) {
  const lower = text.toLowerCase();
  const servers = [];
  if (/email|mail|inbox|unread|prioriti|gmail|draft email/i.test(lower)) servers.push(MCP_SERVERS.gmail);
  if (/calendar|event|meeting|schedule|appointment|free time|busy|deadline|remind|bill.*due|due date/i.test(lower)) servers.push(MCP_SERVERS.calendar);
  if (/slack|channel|dm |direct message|workspace/i.test(lower)) servers.push(MCP_SERVERS.slack);
  if (servers.length === 0 && !/whatsapp|budget|expense|bill|note|site.*11250|folder/i.test(lower)) {
    return [MCP_SERVERS.gmail, MCP_SERVERS.calendar, MCP_SERVERS.slack];
  }
  return servers;
}

async function callTony(messages, query) {
  const body = { model: "claude-sonnet-4-20250514", max_tokens: 1000, system: SYSTEM_PROMPT, messages };
  const response = await fetch("/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "API error");
  const textParts = [];
  for (const block of data.content || []) {
    if (block.type === "text" && block.text) textParts.push(block.text);
  }
  const connectedTo = [];
  if (/email|mail|inbox|gmail/i.test(query)) connectedTo.push("gmail");
  if (/calendar|event|meeting|schedule/i.test(query)) connectedTo.push("calendar");
  if (/slack|channel/i.test(query)) connectedTo.push("slack");
  if (/whatsapp/i.test(query)) connectedTo.push("whatsapp");
  return { text: textParts.join("\n") || "Request processed.", toolResults: [], connectedTo: connectedTo.join(", ") };
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

// ─── VOICE ENGINE ───
function useVoice(onResult, onListeningChange) {
  const recognitionRef = useRef(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Warm up voices — browsers load them async
  useEffect(() => {
    const loadVoices = () => window.speechSynthesis?.getVoices();
    loadVoices();
    window.speechSynthesis?.addEventListener?.("voiceschanged", loadVoices);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        // Strip wake word if present
        const cleaned = transcript.replace(/^(hey\s+tony[,.\s]*)/i, "").trim();
        if (cleaned) onResult(cleaned);
      };
      recognition.onend = () => { setIsListening(false); onListeningChange?.(false); };
      recognition.onerror = () => { setIsListening(false); onListeningChange?.(false); };
      recognitionRef.current = recognition;
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
        onListeningChange?.(true);
      } catch (e) { console.error("Voice start error:", e); }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      onListeningChange?.(false);
    }
  }, [isListening]);

  const speak = useCallback((text) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Clean text for natural speech
    const cleanText = text.replace(/[📧📅💬📱💰⏰📝📁🔒🔴🟡🟢⚪🚫⚠️❌🔗🎤]/g, "")
      .replace(/\[WHATSAPP_SEND:[^\]]+\]/g, "")
      .replace(/\[SITE-11250\]/g, "Site 11250")
      .replace(/[*_#•]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/\. \./g, ".")
      .trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    // Tuned for confident, polished AI assistant tone
    utterance.rate = 1.05;   // Slightly faster than default — sounds sharper, more confident
    utterance.pitch = 0.88;  // Slightly lower pitch — authoritative, not robotic
    utterance.volume = 1;

    // Voice selection priority — best available male English voices
    // Ranked by quality and "polished AI assistant" feel
    const voices = window.speechSynthesis.getVoices();
    const voicePriority = [
      /google uk english male/i,    // Chrome — crisp British, closest to JARVIS vibe
      /daniel/i,                     // macOS/Safari — excellent British male
      /james/i,                      // Some systems — solid British male
      /microsoft ryan/i,             // Edge — natural-sounding British
      /microsoft guy/i,              // Edge — UK English male
      /google us english.*male/i,    // Chrome fallback — clean American
      /microsoft mark/i,             // Edge fallback — American
      /microsoft david/i,            // Windows fallback — American
      /alex/i,                       // macOS fallback — decent quality
      /english.*male/i,              // Generic male English catch-all
    ];
    let selectedVoice = null;
    for (const pattern of voicePriority) {
      selectedVoice = voices.find((v) => pattern.test(v.name) && /en/i.test(v.lang));
      if (selectedVoice) break;
    }
    // Last resort: any English voice
    if (!selectedVoice) selectedVoice = voices.find((v) => /en/i.test(v.lang));
    if (selectedVoice) utterance.voice = selectedVoice;

    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  return { isListening, startListening, stopListening, speak, supported, voiceEnabled, setVoiceEnabled };
}

// ─── DATA STORE ───
const useStore = () => {
  const [bills, setBills] = useState([
    { id: 1, name: "Electric Bill", amount: 145, dueDay: 15, frequency: "monthly", category: "Utilities", paid: false },
    { id: 2, name: "Internet", amount: 79.99, dueDay: 22, frequency: "monthly", category: "Utilities", paid: false },
    { id: 3, name: "Rent", amount: 1850, dueDay: 1, frequency: "monthly", category: "Housing", paid: true },
  ]);
  const [expenses, setExpenses] = useState([
    { id: 1, name: "Groceries", amount: 127.50, category: "Food", date: "2026-03-14" },
    { id: 2, name: "Gas", amount: 48.20, category: "Transport", date: "2026-03-12" },
  ]);
  const [deadlines, setDeadlines] = useState([
    { id: 1, task: "Submit project proposal", due: "2026-03-25", priority: "high", project: "SITE-11250", done: false },
    { id: 2, task: "Safety inspection report", due: "2026-03-28", priority: "high", project: "SITE-11250", done: false },
    { id: 3, task: "Weekly team sync notes", due: "2026-03-21", priority: "medium", project: "General", done: false },
  ]);
  const [notes, setNotes] = useState([
    { id: 1, title: "Site 11250 Kickoff", date: "2026-03-10", project: "SITE-11250", attendees: "Team Lead, PM, Contractor", content: "Discussed project scope, timeline, and initial budget allocation. Agreed on phased approach with Phase 1 targeting foundation and structural work.", actions: ["Finalize blueprint review by 3/20", "Submit permit application", "Schedule weekly check-ins"] },
    { id: 2, title: "Site 11250 Safety Review", date: "2026-03-12", project: "SITE-11250", attendees: "Safety Officer, Site Manager, PM", content: "Reviewed OSHA compliance requirements for Site 11250. Identified three areas requiring additional signage and PPE stations. Fall protection plan needs update for elevated work zones.", actions: ["Update fall protection plan by 3/18", "Order additional PPE signage", "Schedule safety walkthrough for 3/22"] },
    { id: 3, title: "Site 11250 Budget Review", date: "2026-03-14", project: "SITE-11250", attendees: "PM, Finance Lead, Contractor", content: "Reviewed budget estimate v1 against actual material quotes. Concrete costs came in 12% over estimate. Discussed value engineering options to offset. Electrical sub-bid still pending.", actions: ["Revise budget with updated concrete pricing", "Follow up on electrical sub-bid by 3/19", "Prepare change order if needed"] },
  ]);
  const [noteTemplates] = useState([
    { id: "standup", name: "Daily Standup", icon: "🔄", project: "SITE-11250", fields: { attendees: "Site Manager, Team Leads", sections: ["Yesterday's Progress", "Today's Plan", "Blockers / Issues", "Safety Observations"] } },
    { id: "safety", name: "Safety Meeting", icon: "🦺", project: "SITE-11250", fields: { attendees: "Safety Officer, All Site Personnel", sections: ["Incident Review", "Hazard Identification", "PPE Compliance", "Emergency Procedures Update", "Safety Action Items"] } },
    { id: "progress", name: "Progress Report", icon: "📊", project: "SITE-11250", fields: { attendees: "PM, Client Rep, Contractor", sections: ["Milestone Status", "Schedule Update", "Budget Variance", "Risk Assessment", "Client Concerns", "Next Milestones"] } },
    { id: "subcontractor", name: "Subcontractor Coordination", icon: "🤝", project: "SITE-11250", fields: { attendees: "PM, Sub Leads", sections: ["Scope Alignment", "Schedule Conflicts", "Resource Needs", "Material Deliveries", "Coordination Action Items"] } },
    { id: "inspection", name: "Inspection Debrief", icon: "🔍", project: "SITE-11250", fields: { attendees: "Inspector, PM, Site Manager", sections: ["Inspection Findings", "Code Compliance Status", "Corrective Actions Required", "Re-Inspection Timeline"] } },
    { id: "general", name: "General Meeting", icon: "📝", project: "General", fields: { attendees: "", sections: ["Agenda Items", "Discussion Notes", "Decisions Made", "Action Items", "Next Steps"] } },
  ]);
  const [siteFiles, setSiteFiles] = useState([
    { id: 1, name: "Project Overview", type: "doc", date: "2026-03-10", tag: "planning" },
    { id: 2, name: "Budget Estimate v1", type: "xlsx", date: "2026-03-11", tag: "budget" },
    { id: 3, name: "Kickoff Meeting Notes", type: "note", date: "2026-03-10", tag: "meetings" },
    { id: 4, name: "Safety Review Notes", type: "note", date: "2026-03-12", tag: "meetings" },
    { id: 5, name: "Budget Review Notes", type: "note", date: "2026-03-14", tag: "meetings" },
    { id: 6, name: "Safety Checklist", type: "doc", date: "2026-03-12", tag: "compliance" },
    { id: 7, name: "Contractor Agreements", type: "pdf", date: "2026-03-08", tag: "legal" },
    { id: 8, name: "Standup Template", type: "doc", date: "2026-03-15", tag: "meetings" },
    { id: 9, name: "Inspection Template", type: "doc", date: "2026-03-15", tag: "compliance" },
  ]);
  return { bills, setBills, expenses, setExpenses, deadlines, setDeadlines, notes, setNotes, noteTemplates, siteFiles, setSiteFiles };
};

// ─── UI COMPONENTS ───

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 4, padding: "8px 0" }}>
      {[0, 1, 2].map((i) => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#7C8DA6", animation: `bounce 1.2s ${i * 0.15}s infinite ease-in-out` }} />)}
    </div>
  );
}

function VoicePulse({ isListening }) {
  if (!isListening) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,25,35,0.85)", zIndex: 1000, animation: "fadeSlideIn 0.2s ease-out" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ position: "relative", width: 120, height: 120, margin: "0 auto 24px" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(74,111,165,0.15)", animation: "voicePulse 1.5s infinite ease-out" }} />
          <div style={{ position: "absolute", inset: 15, borderRadius: "50%", background: "rgba(74,111,165,0.25)", animation: "voicePulse 1.5s 0.3s infinite ease-out" }} />
          <div style={{ position: "absolute", inset: 30, borderRadius: "50%", background: "linear-gradient(135deg,#4A6FA5,#5A7FB5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </div>
        </div>
        <div style={{ fontFamily: "'Space Mono',monospace", fontSize: 18, fontWeight: 700, color: "#E8EEF4", letterSpacing: 2 }}>I'M ALL EARS</div>
        <div style={{ fontSize: 13, color: "#5A6A7E", marginTop: 8 }}>Go ahead — tell me what you need</div>
      </div>
    </div>
  );
}

function WhatsAppButton({ phone, message }) {
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{
      display: "inline-flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#25D366,#128C7E)",
      color: "#fff", padding: "10px 18px", borderRadius: 12, textDecoration: "none", fontSize: 13, fontWeight: 600,
      fontFamily: "'DM Sans',sans-serif", margin: "8px 0", boxShadow: "0 4px 14px rgba(37,211,102,0.3)", cursor: "pointer",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
      Send via WhatsApp
    </a>
  );
}

function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const parts = !isUser ? parseWhatsAppLinks(msg.content) : [{ type: "text", content: msg.content }];
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12, animation: "fadeSlideIn 0.3s ease-out" }}>
      {!isUser && <div style={{ width: 30, height: 30, borderRadius: 9, marginRight: 10, marginTop: 2, flexShrink: 0, background: "linear-gradient(135deg,#4A6FA5,#7C8DA6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700 }}>T</div>}
      <div style={{
        maxWidth: "78%", padding: "11px 15px", borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
        background: isUser ? "linear-gradient(135deg,#4A6FA5,#5A7FB5)" : "rgba(255,255,255,0.05)",
        border: isUser ? "none" : "1px solid rgba(255,255,255,0.07)", color: isUser ? "#fff" : "#C8D4E2",
        fontSize: 13.5, lineHeight: 1.65, wordBreak: "break-word", fontFamily: "'DM Sans',sans-serif",
      }}>
        {parts.map((p, i) => p.type === "whatsapp" ? <WhatsAppButton key={i} phone={p.phone} message={p.message} /> : <span key={i} style={{ whiteSpace: "pre-wrap" }}>{p.content}</span>)}
        {msg.toolInfo && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 11, color: "#5A6A7E", fontStyle: "italic" }}>🔗 {msg.toolInfo}</div>}
        {msg.viaVoice && <div style={{ marginTop: 4, fontSize: 10, color: "#4A6FA5" }}>🎤 voice input</div>}
      </div>
    </div>
  );
}

// ─── MODULE PANELS ───

function BudgetPanel({ bills, expenses, setBills }) {
  const totalBills = bills.reduce((s, b) => s + b.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const unpaid = bills.filter((b) => !b.paid);
  const cats = {}; expenses.forEach((e) => { cats[e.category] = (cats[e.category] || 0) + e.amount; });

  return (
    <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#E8EEF4", marginBottom: 4, fontFamily: "'Space Mono',monospace" }}>Budget & Bills</h2>
      <p style={{ fontSize: 12, color: "#5A6A7E", marginBottom: 20 }}>Track expenses and never miss a payment. Ask Tony to add bills or set reminders.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Monthly Bills", value: `$${totalBills.toLocaleString()}`, color: "#E05D44", sub: `${unpaid.length} unpaid` },
          { label: "Expenses (MTD)", value: `$${totalExpenses.toFixed(2)}`, color: "#F5A623", sub: `${expenses.length} transactions` },
          { label: "Total Outflow", value: `$${(totalBills + totalExpenses).toLocaleString()}`, color: "#4A6FA5", sub: "this month" },
        ].map((c) => (
          <div key={c.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, fontFamily: "'Space Mono',monospace" }}>{c.value}</div>
            <div style={{ fontSize: 11, color: "#5A6A7E", marginTop: 4 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Upcoming Bills</div>
        {bills.map((b) => (
          <div key={b.id} style={{ display: "flex", alignItems: "center", padding: "12px 14px", marginBottom: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", marginRight: 12, flexShrink: 0, background: b.paid ? "#3ECF8E" : new Date().getDate() > b.dueDay - 3 ? "#E05D44" : "#F5A623" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#C8D4E2", fontWeight: 500 }}>{b.name}</div>
              <div style={{ fontSize: 11, color: "#5A6A7E" }}>Due: {b.dueDay}th · {b.frequency} · {b.category}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: b.paid ? "#3ECF8E" : "#E8EEF4", fontFamily: "'Space Mono',monospace" }}>${b.amount.toFixed(2)}</div>
            <button onClick={() => setBills((prev) => prev.map((x) => x.id === b.id ? { ...x, paid: !x.paid } : x))} style={{
              marginLeft: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
              background: b.paid ? "rgba(62,207,142,0.1)" : "rgba(255,255,255,0.04)", color: b.paid ? "#3ECF8E" : "#7C8DA6",
              fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}>{b.paid ? "✓ Paid" : "Mark Paid"}</button>
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Spending by Category</div>
        {Object.entries(cats).map(([cat, amt]) => (
          <div key={cat} style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <div style={{ width: 100, fontSize: 12, color: "#A0B0C4" }}>{cat}</div>
            <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, marginRight: 10 }}>
              <div style={{ width: `${Math.min((amt / totalExpenses) * 100, 100)}%`, height: "100%", background: "linear-gradient(90deg,#4A6FA5,#7C8DA6)", borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 12, color: "#C8D4E2", fontFamily: "'Space Mono',monospace", width: 70, textAlign: "right" }}>${amt.toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 20, padding: 12, background: "rgba(224,93,68,0.06)", border: "1px solid rgba(224,93,68,0.12)", borderRadius: 8 }}>
        <div style={{ fontSize: 11, color: "#E05D44", fontWeight: 500 }}>⚠️ Tony cannot make payments on your behalf. Use this tracker to stay organized, then pay bills yourself.</div>
      </div>
    </div>
  );
}

function DeadlinesPanel({ deadlines, setDeadlines }) {
  const sorted = [...deadlines].sort((a, b) => new Date(a.due) - new Date(b.due));
  const priorityColor = { high: "#E05D44", medium: "#F5A623", low: "#3ECF8E" };
  const today = new Date().toISOString().split("T")[0];
  return (
    <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: "#E8EEF4", marginBottom: 4, fontFamily: "'Space Mono',monospace" }}>Deadlines</h2>
      <p style={{ fontSize: 12, color: "#5A6A7E", marginBottom: 20 }}>Track work deadlines. Ask Tony to add new ones or set calendar reminders.</p>
      {sorted.map((d) => {
        const overdue = d.due < today && !d.done;
        const daysLeft = Math.ceil((new Date(d.due) - new Date()) / 86400000);
        return (
          <div key={d.id} style={{ display: "flex", alignItems: "center", padding: "14px 16px", marginBottom: 8, background: overdue ? "rgba(224,93,68,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${overdue ? "rgba(224,93,68,0.15)" : "rgba(255,255,255,0.05)"}`, borderRadius: 10, opacity: d.done ? 0.5 : 1 }}>
            <button onClick={() => setDeadlines((prev) => prev.map((x) => x.id === d.id ? { ...x, done: !x.done } : x))} style={{
              width: 22, height: 22, borderRadius: 6, border: `2px solid ${d.done ? "#3ECF8E" : "rgba(255,255,255,0.15)"}`,
              background: d.done ? "rgba(62,207,142,0.15)" : "transparent", cursor: "pointer", marginRight: 14,
              display: "flex", alignItems: "center", justifyContent: "center", color: "#3ECF8E", fontSize: 12, flexShrink: 0,
            }}>{d.done ? "✓" : ""}</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: "#E8EEF4", fontWeight: 500, textDecoration: d.done ? "line-through" : "none" }}>{d.task}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${priorityColor[d.priority]}20`, color: priorityColor[d.priority], fontWeight: 600, textTransform: "uppercase" }}>{d.priority}</span>
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "rgba(74,111,165,0.15)", color: "#7CB3E8" }}>{d.project}</span>
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 13, color: overdue ? "#E05D44" : "#A0B0C4", fontFamily: "'Space Mono',monospace" }}>{d.due}</div>
              <div style={{ fontSize: 11, color: overdue ? "#E05D44" : "#5A6A7E", marginTop: 2 }}>{d.done ? "Complete" : overdue ? "OVERDUE" : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NotesPanel({ notes, noteTemplates }) {
  const [expanded, setExpanded] = useState(null);
  const [showTemplates, setShowTemplates] = useState(false);
  return (
    <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#E8EEF4", fontFamily: "'Space Mono',monospace" }}>Meeting Notes</h2>
        <button onClick={() => setShowTemplates(!showTemplates)} style={{
          background: showTemplates ? "rgba(74,111,165,0.15)" : "rgba(255,255,255,0.04)",
          border: "1px solid rgba(74,111,165,0.2)", color: "#7CB3E8", padding: "6px 14px", borderRadius: 8,
          cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        }}>{showTemplates ? "Hide Templates" : "📋 Templates"}</button>
      </div>
      <p style={{ fontSize: 12, color: "#5A6A7E", marginBottom: 16 }}>Ask Tony to take notes, or use a template to get started fast.</p>

      {/* Templates Section */}
      {showTemplates && (
        <div style={{ marginBottom: 20, animation: "fadeSlideIn 0.3s ease-out" }}>
          <div style={{ fontSize: 11, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Quick-Start Templates for Site 11250</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {noteTemplates.map((t) => (
              <button key={t.id} onClick={() => {
                const prompt = `Create meeting notes using the "${t.name}" template for Site 11250. Today's date. Default attendees: ${t.fields.attendees || "ask me"}. Sections to cover: ${t.fields.sections.join(", ")}. Ask me to fill in the details for each section.`;
                window.__tonySendMessage?.(prompt);
              }} style={{
                padding: "14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)",
                background: "rgba(255,255,255,0.02)", cursor: "pointer", textAlign: "left",
                transition: "all 0.2s",
              }}
                onMouseOver={(e) => e.currentTarget.style.background = "rgba(74,111,165,0.08)"}
                onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 18 }}>{t.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#E8EEF4" }}>{t.name}</span>
                </div>
                <div style={{ fontSize: 11, color: "#5A6A7E", lineHeight: 1.5 }}>
                  {t.fields.sections.slice(0, 3).join(" · ")}{t.fields.sections.length > 3 ? ` +${t.fields.sections.length - 3} more` : ""}
                </div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: "rgba(74,111,165,0.15)", color: "#7CB3E8" }}>{t.project}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing Notes */}
      <div style={{ fontSize: 11, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Recent Notes ({notes.length})</div>
      {notes.map((n) => (
        <div key={n.id} style={{ marginBottom: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, overflow: "hidden" }}>
          <button onClick={() => setExpanded(expanded === n.id ? null : n.id)} style={{ width: "100%", padding: "14px 16px", background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", textAlign: "left" }}>
            <div>
              <div style={{ fontSize: 14, color: "#E8EEF4", fontWeight: 600 }}>{n.title}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 11, color: "#5A6A7E" }}>{n.date}</span>
                <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 4, background: "rgba(74,111,165,0.15)", color: "#7CB3E8" }}>{n.project}</span>
              </div>
            </div>
            <span style={{ color: "#5A6A7E", fontSize: 16 }}>{expanded === n.id ? "▾" : "▸"}</span>
          </button>
          {expanded === n.id && (
            <div style={{ padding: "0 16px 16px", animation: "fadeSlideIn 0.2s ease-out" }}>
              <div style={{ fontSize: 11, color: "#5A6A7E", marginBottom: 8 }}>👥 {n.attendees}</div>
              <div style={{ fontSize: 13, color: "#A0B0C4", lineHeight: 1.6, marginBottom: 12 }}>{n.content}</div>
              <div style={{ fontSize: 11, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Action Items</div>
              {n.actions.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#F5A623", flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#C8D4E2" }}>{a}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <div style={{ marginTop: 16, padding: 16, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#5A6A7E" }}>Just tell me what went down — I'll handle the formatting.</div>
        <div style={{ fontSize: 11, color: "#3A4A5E", marginTop: 4 }}>Try: "Hey Tony, take notes on today's site 11250 standup"</div>
      </div>
    </div>
  );
}

function SitePanel({ siteFiles, deadlines, notes }) {
  const siteDeadlines = deadlines.filter((d) => d.project === "SITE-11250");
  const siteNotes = notes.filter((n) => n.project === "SITE-11250");
  const tagColors = { planning: "#4A6FA5", budget: "#F5A623", meetings: "#9B59B6", compliance: "#E05D44", legal: "#3ECF8E" };
  const fileIcons = { doc: "📄", xlsx: "📊", note: "📝", pdf: "📋" };
  return (
    <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#E8EEF4", fontFamily: "'Space Mono',monospace" }}>Site 11250</h2>
        <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "rgba(74,111,165,0.15)", color: "#7CB3E8", fontWeight: 600 }}>PROJECT FOLDER</span>
      </div>
      <p style={{ fontSize: 12, color: "#5A6A7E", marginBottom: 20 }}>All files, deadlines, and notes for Site 11250.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Files", value: siteFiles.length, icon: "📁" },
          { label: "Active Deadlines", value: siteDeadlines.filter((d) => !d.done).length, icon: "⏰" },
          { label: "Meeting Notes", value: siteNotes.length, icon: "📝" },
        ].map((s) => (
          <div key={s.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14, textAlign: "center" }}>
            <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#E8EEF4", fontFamily: "'Space Mono',monospace" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>Files</div>
      {siteFiles.map((f) => (
        <div key={f.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", marginBottom: 4, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
          <span style={{ fontSize: 16, marginRight: 10 }}>{fileIcons[f.type] || "📄"}</span>
          <div style={{ flex: 1 }}><div style={{ fontSize: 13, color: "#C8D4E2" }}>{f.name}</div><div style={{ fontSize: 11, color: "#5A6A7E" }}>{f.date}</div></div>
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: `${tagColors[f.tag] || "#4A6FA5"}20`, color: tagColors[f.tag] || "#7CB3E8" }}>{f.tag}</span>
        </div>
      ))}
      <div style={{ fontSize: 12, color: "#5A6A7E", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10, marginTop: 20 }}>Deadlines</div>
      {siteDeadlines.map((d) => (
        <div key={d.id} style={{ display: "flex", alignItems: "center", padding: "10px 14px", marginBottom: 4, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: d.done ? "#3ECF8E" : "#E05D44", marginRight: 12 }} />
          <div style={{ flex: 1, fontSize: 13, color: "#C8D4E2" }}>{d.task}</div>
          <div style={{ fontSize: 12, color: "#5A6A7E", fontFamily: "'Space Mono',monospace" }}>{d.due}</div>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN APP ───

export default function TonyAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeView, setActiveView] = useState("chat");
  const [showSetup, setShowSetup] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);
  const store = useStore();

  const voice = useVoice(
    (transcript) => { setInput(""); sendMessageDirect(transcript, true); },
    () => {}
  );

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
      const apiMessages = allMessages.filter((m) => !m.isConfirmation).map((m) => ({ role: m.role, content: m.content }));
      const result = await callTony(apiMessages, text);
      setMessages((prev) => [...prev, { role: "assistant", content: result.text, toolInfo: result.connectedTo || undefined }]);
      if (viaVoice) voice.speak(result.text);
    } catch (err) {
      const errMsg = `❌ Error: ${err.message}. Please try again.`;
      setMessages((prev) => [...prev, { role: "assistant", content: errMsg }]);
      if (viaVoice) voice.speak("Alright, that didn't work. Give me another shot.");
    } finally { setLoading(false); setConfirmAction(null); }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    setMessages([{
      role: "assistant",
      content: "Hey there. I'm Tony — your AI workspace assistant, powered by Claude. Think of me as your personal command center.\n\nHere's what I'm running for you:\n\n📧  Email — I'll sort the noise from what actually matters\n📅  Calendar — events, deadlines, bill reminders\n💬  Slack — messages, channels, the works\n📱  WhatsApp — compose and send\n💰  Budget — tracking every dollar so you don't have to\n⏰  Deadlines — nothing slips past me\n📝  Notes — structured, clean, actionable\n📁  Site 11250 — your project command center\n\n🎤 Hit the mic or say \"Hey Tony\" — I'm listening.\n🔒 I don't delete anything or touch your money without you saying so. Twice.\n\nSo — what are we tackling first?",
    }]);
  }, []);

  const sendMessage = useCallback(async (text) => { sendMessageDirect(text, false); }, [sendMessageDirect]);
  
  // Expose sendMessage for template buttons
  useEffect(() => {
    window.__tonySendMessage = (text) => { setActiveView("chat"); setTimeout(() => sendMessageDirect(text, false), 100); };
    return () => { delete window.__tonySendMessage; };
  }, [sendMessageDirect]);

  const handleKeyDown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };

  const NAV = [
    { id: "chat", icon: "💬", label: "Chat" },
    { id: "budget", icon: "💰", label: "Budget & Bills" },
    { id: "deadlines", icon: "⏰", label: "Deadlines" },
    { id: "notes", icon: "📝", label: "Meeting Notes" },
    { id: "site", icon: "📁", label: "Site 11250" },
  ];

  const QUICK = [
    { label: "📧 Prioritize Inbox", prompt: "Search my recent emails and prioritize them by urgency." },
    { label: "📅 Today's Schedule", prompt: "What's on my calendar for today?" },
    { label: "💰 Bill Reminders", prompt: "Set up calendar reminders for my upcoming unpaid bills." },
    { label: "⏰ Add Deadline", prompt: "I need to add a new work deadline. Ask me for the details." },
    { label: "📝 Meeting Notes", prompt: "Help me create meeting notes. Ask me about the meeting." },
    { label: "📁 Site 11250", prompt: "Give me a status update on Site 11250." },
  ];

  return (
    <div style={{ width: "100%", height: "100vh", display: "flex", background: "#0F1923", fontFamily: "'DM Sans',sans-serif", color: "#C8D4E2", overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        @keyframes fadeSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:1}}
        @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-8px)}}
        @keyframes voicePulse{0%{transform:scale(1);opacity:.6}100%{transform:scale(1.5);opacity:0}}
        @keyframes micGlow{0%,100%{box-shadow:0 0 8px rgba(224,93,68,0.3)}50%{box-shadow:0 0 20px rgba(224,93,68,0.6)}}
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:3px}
        textarea::placeholder{color:#5A6A7E}
      `}</style>

      <VoicePulse isListening={voice.isListening} />

      {/* Setup Modal */}
      {showSetup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,25,35,0.9)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowSetup(false)}>
          <div style={{ background: "#1A2633", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", maxWidth: 520, width: "100%", padding: 28, maxHeight: "80vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#E8EEF4", fontFamily: "'Space Mono',monospace", marginBottom: 4 }}>Setup Tony</h2>
            <p style={{ fontSize: 12, color: "#5A6A7E", marginBottom: 20 }}>Get Tony on your desktop and phone</p>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EEF4", marginBottom: 8 }}>🖥️ Desktop App (PWA)</div>
              <div style={{ fontSize: 13, color: "#A0B0C4", lineHeight: 1.7 }}>
                1. Open Tony in <strong>Chrome</strong> or <strong>Edge</strong><br />
                2. Click the install icon (⊕) in the address bar<br />
                3. Click <strong>"Install"</strong> — Tony gets its own window & desktop icon<br />
                4. Pin to taskbar/dock for one-click access
              </div>
              <div style={{ marginTop: 10, padding: 10, background: "rgba(74,111,165,0.08)", borderRadius: 8, fontSize: 11, color: "#7CB3E8" }}>
                💡 PWA = Progressive Web App. It looks and feels like a native desktop app but runs from your browser.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EEF4", marginBottom: 8 }}>📱 iPhone — "Hey Tony" via Siri Shortcuts</div>
              <div style={{ fontSize: 13, color: "#A0B0C4", lineHeight: 1.7 }}>
                1. Open the <strong>Shortcuts</strong> app on your iPhone<br />
                2. Create a new shortcut → Add Action → <strong>"Open URL"</strong><br />
                3. Set the URL to your Tony PWA link<br />
                4. Name it <strong>"Tony"</strong><br />
                5. Now say <strong>"Hey Siri, Tony"</strong> to launch!<br />
                6. Once open, tap the 🎤 mic button to speak
              </div>
              <div style={{ marginTop: 10, padding: 10, background: "rgba(62,207,142,0.08)", borderRadius: 8, fontSize: 11, color: "#3ECF8E" }}>
                💡 Pro tip: Add the shortcut to your Home Screen for a tap-to-open icon.
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EEF4", marginBottom: 8 }}>🤖 Android — "Hey Tony" via Google Assistant Routine</div>
              <div style={{ fontSize: 13, color: "#A0B0C4", lineHeight: 1.7 }}>
                1. Open <strong>Google Assistant Settings</strong> → Routines<br />
                2. Create a new routine<br />
                3. Starter: <strong>"Hey Tony"</strong> (custom voice phrase)<br />
                4. Action: <strong>Open website</strong> → your Tony URL<br />
                5. Now say <strong>"Hey Google, Hey Tony"</strong> to launch!<br />
                6. Once open, tap 🎤 to speak directly
              </div>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EEF4", marginBottom: 8 }}>🎤 Voice in Browser (Works Now!)</div>
              <div style={{ fontSize: 13, color: "#A0B0C4", lineHeight: 1.7 }}>
                The mic button in the chat input bar uses your browser's Speech Recognition API. Click it, speak your request, and Tony will respond — with text-to-speech reading the answer back to you. Works on Chrome, Edge, and Safari.
              </div>
            </div>

            <button onClick={() => setShowSetup(false)} style={{
              marginTop: 20, width: "100%", padding: "12px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#4A6FA5,#5A7FB5)", color: "#fff", fontSize: 14,
              fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
            }}>Got it!</button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <div style={{ width: 220, borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", background: "rgba(255,255,255,0.015)", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#4A6FA5,#7C8DA6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: "#fff", boxShadow: "0 4px 16px rgba(74,111,165,0.3)" }}>T</div>
            <div>
              <div style={{ fontFamily: "'Space Mono',monospace", fontWeight: 700, fontSize: 15, color: "#E8EEF4", letterSpacing: 2 }}>TONY</div>
              <div style={{ fontSize: 9, color: "#5A6A7E", letterSpacing: 1, textTransform: "uppercase" }}>Workspace Assistant</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 8px", flex: 1, overflowY: "auto" }}>
          <div style={{ fontSize: 9, color: "#3A4A5E", letterSpacing: 1.5, textTransform: "uppercase", padding: "0 8px", marginBottom: 6 }}>Navigation</div>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setActiveView(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 8,
              border: "none", cursor: "pointer", marginBottom: 2, textAlign: "left",
              background: activeView === n.id ? "rgba(74,111,165,0.12)" : "transparent", fontFamily: "'DM Sans',sans-serif",
            }}>
              <span style={{ fontSize: 15 }}>{n.icon}</span>
              <span style={{ fontSize: 12.5, color: activeView === n.id ? "#A0C0E0" : "#7C8DA6", fontWeight: activeView === n.id ? 600 : 400 }}>{n.label}</span>
            </button>
          ))}

          <div style={{ fontSize: 9, color: "#3A4A5E", letterSpacing: 1.5, textTransform: "uppercase", padding: "14px 8px 6px" }}>Services</div>
          {[
            { icon: "📧", label: "Gmail" }, { icon: "📅", label: "Calendar" }, { icon: "💬", label: "Slack" }, { icon: "📱", label: "WhatsApp", note: "wa.me" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px" }}>
              <span style={{ fontSize: 13 }}>{s.icon}</span>
              <span style={{ fontSize: 11, color: "#5A6A7E", flex: 1 }}>{s.label}</span>
              {s.note && <span style={{ fontSize: 8, color: "#3A4A5E" }}>{s.note}</span>}
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#3ECF8E", boxShadow: "0 0 6px rgba(62,207,142,0.4)" }} />
            </div>
          ))}

          <div style={{ margin: "14px 8px 0", padding: 10, borderRadius: 8, background: "rgba(255,200,50,0.04)", border: "1px solid rgba(255,200,50,0.08)" }}>
            <div style={{ fontSize: 10, color: "#E8C84A", fontWeight: 600 }}>🔒 Safety</div>
            <div style={{ fontSize: 10, color: "#5A6A7E", marginTop: 3, lineHeight: 1.5 }}>No deletions or payments without your confirmation.</div>
          </div>

          {/* Setup button */}
          <button onClick={() => setShowSetup(true)} style={{
            display: "flex", alignItems: "center", gap: 8, width: "calc(100% - 16px)", margin: "12px 8px 0", padding: "10px 12px",
            borderRadius: 8, border: "1px dashed rgba(74,111,165,0.3)", background: "rgba(74,111,165,0.06)",
            cursor: "pointer", fontFamily: "'DM Sans',sans-serif",
          }}>
            <span style={{ fontSize: 14 }}>🚀</span>
            <span style={{ fontSize: 11, color: "#7CB3E8", fontWeight: 500 }}>Setup Desktop & Mobile</span>
          </button>
        </div>

        {/* Powered by Claude */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 16, height: 16, borderRadius: 4, background: "linear-gradient(135deg,#D4A574,#C4956A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 700 }}>C</div>
            <span style={{ fontSize: 10, color: "#5A6A7E" }}>Powered by <strong style={{ color: "#A0B0C4" }}>Claude</strong></span>
          </div>
          <div style={{ fontSize: 8, color: "#2A3A4E", marginTop: 3 }}>Tony v3.1 · Anthropic</div>
        </div>
      </div>

      {/* Main Area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(255,255,255,0.01)" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EEF4" }}>{NAV.find((n) => n.id === activeView)?.icon} {NAV.find((n) => n.id === activeView)?.label}</div>
            <div style={{ fontSize: 10, color: "#5A6A7E", marginTop: 1 }}>
              {voice.isListening ? <span style={{ color: "#E05D44" }}>🎤 Listening...</span> : loading ? <span style={{ color: "#4A6FA5", animation: "pulse 1.5s infinite" }}>● Processing...</span> : <span>● Online</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {voice.supported && (
              <button onClick={() => voice.setVoiceEnabled(!voice.voiceEnabled)} title={voice.voiceEnabled ? "Mute TTS" : "Enable TTS"} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: voice.voiceEnabled ? "#A0C0E0" : "#3A4A5E",
                padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13,
              }}>{voice.voiceEnabled ? "🔊" : "🔇"}</button>
            )}
            {activeView === "chat" && (
              <button onClick={() => { setMessages([{ role: "assistant", content: "Slate wiped clean. What's next, boss?" }]); }} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#7C8DA6",
                padding: "5px 12px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif",
              }}>New Chat</button>
            )}
          </div>
        </div>

        {activeView === "chat" ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
              {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: "linear-gradient(135deg,#4A6FA5,#7C8DA6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700 }}>T</div>
                  <div style={{ padding: "12px 16px", borderRadius: "14px 14px 14px 4px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}><TypingDots /></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {messages.length <= 2 && (
              <div style={{ padding: "0 20px 10px", display: "flex", flexWrap: "wrap", gap: 6 }}>
                {QUICK.map((q) => (
                  <button key={q.label} onClick={() => sendMessage(q.prompt)} disabled={loading} style={{
                    background: "rgba(74,111,165,0.08)", border: "1px solid rgba(74,111,165,0.15)", color: "#A0C0E0",
                    padding: "7px 12px", borderRadius: 18, cursor: loading ? "not-allowed" : "pointer", fontSize: 11,
                    fontFamily: "'DM Sans',sans-serif", opacity: loading ? 0.5 : 1,
                  }}>{q.label}</button>
                ))}
              </div>
            )}

            <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.01)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", background: "rgba(255,255,255,0.03)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.07)", padding: "4px 4px 4px 14px" }}>
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder='Talk to Tony — type or tap 🎤'
                  disabled={loading} rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", resize: "none", color: "#E8EEF4", fontSize: 13.5, fontFamily: "'DM Sans',sans-serif", padding: "9px 0", lineHeight: 1.5, minHeight: 20, maxHeight: 100 }}
                  onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
                />
                {/* Mic Button */}
                {voice.supported && (
                  <button
                    onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                    disabled={loading}
                    style={{
                      width: 38, height: 38, borderRadius: 9, border: "none",
                      cursor: loading ? "not-allowed" : "pointer",
                      background: voice.isListening ? "rgba(224,93,68,0.2)" : "rgba(255,255,255,0.04)",
                      color: voice.isListening ? "#E05D44" : "#7C8DA6",
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
                <button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} style={{
                  width: 38, height: 38, borderRadius: 9, border: "none",
                  cursor: !input.trim() || loading ? "not-allowed" : "pointer",
                  background: input.trim() && !loading ? "linear-gradient(135deg,#4A6FA5,#5A7FB5)" : "rgba(255,255,255,0.03)",
                  color: input.trim() && !loading ? "#fff" : "#3A4A5E",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0,
                }}>↑</button>
              </div>
              <div style={{ fontSize: 9, color: "#2A3A4E", marginTop: 6, textAlign: "center" }}>Tony v3.1 · Powered by Claude · Always on, always sharp</div>
            </div>
          </div>
        ) : activeView === "budget" ? (
          <BudgetPanel {...store} />
        ) : activeView === "deadlines" ? (
          <DeadlinesPanel {...store} />
        ) : activeView === "notes" ? (
          <NotesPanel {...store} />
        ) : activeView === "site" ? (
          <SitePanel {...store} />
        ) : null}
      </div>
    </div>
  );
}
