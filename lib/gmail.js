// ─── GMAIL API ───
// Uses REST API directly with OAuth refresh token — same pattern as Calendar & Sheets.
import * as XLSX from "xlsx";

async function getAccessToken() {
  console.log(`[Gmail] Token refresh - client_id exists: ${!!process.env.GOOGLE_CLIENT_ID}, secret exists: ${!!process.env.GOOGLE_CLIENT_SECRET}, refresh exists: ${!!process.env.GOOGLE_REFRESH_TOKEN}, refresh length: ${(process.env.GOOGLE_REFRESH_TOKEN || '').length}`);
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (data.error) {
    console.error(`[Gmail] Auth error: ${data.error} - ${data.error_description}`);
    throw new Error(`Google auth error: ${data.error_description || data.error}`);
  }
  console.log(`[Gmail] Got access token, length: ${data.access_token?.length}`);
  return data.access_token;
}

async function gmailFetch(path, options = {}) {
  const token = await getAccessToken();
  const baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";
  const url = `${baseUrl}${path}`;
  console.log(`[Gmail] Fetching: ${url}`);
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await resp.json();
  if (data.error) {
    console.error(`[Gmail] API Error:`, JSON.stringify(data.error));
    throw new Error(data.error.message || "Gmail API error");
  }
  return data;
}

// ─── Helpers ───

function decodeBase64Url(str) {
  if (!str) return "";
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return str;
  }
}

function getHeader(headers, name) {
  const h = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function extractBody(payload) {
  // Simple text body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  // Multipart — find text/plain or text/html
  if (payload.parts) {
    const textPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (textPart?.body?.data) return decodeBase64Url(textPart.body.data);
    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) {
      const html = decodeBase64Url(htmlPart.body.data);
      // Strip HTML tags for a clean text version
      return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    }
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "(No readable body)";
}

function buildRawEmail({ to, subject, body, replyTo, threadId, inReplyTo, references }) {
  const lines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (inReplyTo) lines.splice(1, 0, `In-Reply-To: ${inReplyTo}`);
  if (references) lines.splice(1, 0, `References: ${references}`);
  lines.push("", body);
  const raw = lines.join("\r\n");
  return Buffer.from(raw).toString("base64url");
}

// ─── Attachment Helpers ───

function extractAttachmentInfo(payload) {
  const attachments = [];
  function walkParts(parts) {
    if (!parts) return;
    for (const part of parts) {
      if (part.filename && part.filename.length > 0) {
        attachments.push({
          partId: part.partId,
          filename: part.filename,
          mimeType: part.mimeType,
          size: part.body?.size || 0,
          attachmentId: part.body?.attachmentId || null,
        });
      }
      if (part.parts) walkParts(part.parts);
    }
  }
  if (payload.parts) walkParts(payload.parts);
  // Single-part message with attachment
  if (payload.filename && payload.filename.length > 0) {
    attachments.push({
      partId: payload.partId || "0",
      filename: payload.filename,
      mimeType: payload.mimeType,
      size: payload.body?.size || 0,
      attachmentId: payload.body?.attachmentId || null,
    });
  }
  return attachments;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length === 0) return { headers: [], rows: [], summary: "Empty CSV" };

  // Simple CSV parser (handles quoted fields)
  function parseLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return {
    headers,
    rows: rows.slice(0, 50), // Cap at 50 rows for context window
    total_rows: rows.length,
    summary: `${headers.length} columns, ${rows.length} rows`,
  };
}

function parseTextContent(buffer, mimeType, filename) {
  const text = buffer.toString("utf-8");
  const ext = filename.toLowerCase().split(".").pop();

  // CSV / TSV
  if (mimeType === "text/csv" || ext === "csv") {
    return { type: "csv", ...parseCSV(text) };
  }
  if (mimeType === "text/tab-separated-values" || ext === "tsv") {
    const tsvText = text.replace(/\t/g, ",");
    return { type: "tsv", ...parseCSV(tsvText) };
  }
  // JSON
  if (mimeType === "application/json" || ext === "json") {
    try {
      const parsed = JSON.parse(text);
      const preview = JSON.stringify(parsed, null, 2).slice(0, 5000);
      return { type: "json", preview, keys: Array.isArray(parsed) ? `Array[${parsed.length}]` : Object.keys(parsed) };
    } catch {
      return { type: "json_error", preview: text.slice(0, 2000) };
    }
  }
  // Plain text / HTML
  if (mimeType.startsWith("text/") || ext === "txt" || ext === "html" || ext === "xml") {
    const cleaned = mimeType === "text/html"
      ? text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
      : text;
    return { type: "text", content: cleaned.slice(0, 5000), total_length: cleaned.length };
  }

  return null;
}

// ─── Exported Functions ───

export async function listEmails({ query, max_results }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("maxResults", String(max_results || 10));
  const list = await gmailFetch(`/messages?${params}`);
  if (!list.messages?.length) return { emails: [], count: 0 };

  // Fetch headers + attachment info for each message
  const emails = await Promise.all(
    list.messages.slice(0, max_results || 10).map(async (msg) => {
      const detail = await gmailFetch(`/messages/${msg.id}?format=full`);
      const attachments = extractAttachmentInfo(detail.payload);
      return {
        id: detail.id,
        threadId: detail.threadId,
        snippet: detail.snippet,
        from: getHeader(detail.payload?.headers, "From"),
        subject: getHeader(detail.payload?.headers, "Subject"),
        date: getHeader(detail.payload?.headers, "Date"),
        labels: detail.labelIds || [],
        isUnread: detail.labelIds?.includes("UNREAD"),
        hasAttachments: attachments.length > 0,
        attachments: attachments.map(a => ({ filename: a.filename, mimeType: a.mimeType, size: a.size })),
      };
    })
  );

  return { emails, count: emails.length, totalEstimate: list.resultSizeEstimate };
}

export async function readEmail({ message_id }) {
  const msg = await gmailFetch(`/messages/${message_id}?format=full`);
  const headers = msg.payload?.headers || [];
  const attachments = extractAttachmentInfo(msg.payload);
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    messageId: getHeader(headers, "Message-ID"),
    body: extractBody(msg.payload).slice(0, 3000),
    labels: msg.labelIds || [],
    isUnread: msg.labelIds?.includes("UNREAD"),
    snippet: msg.snippet,
    hasAttachments: attachments.length > 0,
    attachments: attachments.map(a => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      attachmentId: a.attachmentId,
    })),
  };
}

export async function searchEmails({ query, max_results }) {
  return await listEmails({ query, max_results: max_results || 5 });
}

export async function createDraft({ to, subject, body, reply_to_message_id }) {
  let threadId, inReplyTo, references;

  // If replying, get the original message for threading
  if (reply_to_message_id) {
    const original = await gmailFetch(`/messages/${reply_to_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`);
    threadId = original.threadId;
    inReplyTo = getHeader(original.payload?.headers, "Message-ID");
    references = inReplyTo;
    if (!subject) {
      const origSubject = getHeader(original.payload?.headers, "Subject");
      subject = origSubject.startsWith("Re:") ? origSubject : `Re: ${origSubject}`;
    }
  }

  const raw = buildRawEmail({ to, subject, body, inReplyTo, references });
  const draft = await gmailFetch("/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: { raw, ...(threadId ? { threadId } : {}) },
    }),
  });

  return {
    success: true,
    draft_id: draft.id,
    message: `Draft created${reply_to_message_id ? " (reply)" : ""}: "${subject}" to ${to}`,
    note: "Draft saved — you can review and send it from Gmail.",
  };
}

export async function sendEmail({ to, subject, body, reply_to_message_id }) {
  let threadId, inReplyTo, references;

  if (reply_to_message_id) {
    const original = await gmailFetch(`/messages/${reply_to_message_id}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject`);
    threadId = original.threadId;
    inReplyTo = getHeader(original.payload?.headers, "Message-ID");
    references = inReplyTo;
    if (!subject) {
      const origSubject = getHeader(original.payload?.headers, "Subject");
      subject = origSubject.startsWith("Re:") ? origSubject : `Re: ${origSubject}`;
    }
  }

  const raw = buildRawEmail({ to, subject, body, inReplyTo, references });
  const sent = await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify({
      raw,
      ...(threadId ? { threadId } : {}),
    }),
  });

  return {
    success: true,
    message_id: sent.id,
    threadId: sent.threadId,
    message: `Email sent: "${subject}" to ${to}`,
  };
}

export async function getAttachment({ message_id, attachment_id, filename }) {
  const attachment = await gmailFetch(`/messages/${message_id}/attachments/${attachment_id}`);
  const buffer = Buffer.from(attachment.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const mimeType = filename ? (
    filename.endsWith(".csv") ? "text/csv" :
    filename.endsWith(".tsv") ? "text/tab-separated-values" :
    filename.endsWith(".json") ? "application/json" :
    filename.endsWith(".txt") ? "text/plain" :
    filename.endsWith(".html") ? "text/html" :
    filename.endsWith(".xml") ? "text/xml" :
    filename.endsWith(".pdf") ? "application/pdf" :
    filename.endsWith(".xlsx") || filename.endsWith(".xls") ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :
    filename.endsWith(".docx") || filename.endsWith(".doc") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" :
    "application/octet-stream"
  ) : "application/octet-stream";

  // Parse text-based formats directly
  const textContent = parseTextContent(buffer, mimeType, filename || "file");
  if (textContent) {
    return {
      success: true,
      filename,
      mimeType,
      size: buffer.length,
      parsed: true,
      data: textContent,
    };
  }

  // For images — return base64 for Claude vision analysis
  if (mimeType.startsWith("image/")) {
    const base64 = buffer.toString("base64");
    return {
      success: true,
      filename,
      mimeType,
      size: buffer.length,
      parsed: true,
      data: { type: "image", base64: base64.slice(0, 50000), mimeType }, // Cap for context
    };
  }

  // Excel files — parse with SheetJS
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") ||
      filename?.toLowerCase().endsWith(".xlsx") || filename?.toLowerCase().endsWith(".xls")) {
    try {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheets = {};
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        const headers = jsonData[0] || [];
        const rows = jsonData.slice(1, 51); // Cap at 50 rows
        sheets[sheetName] = {
          headers,
          rows,
          total_rows: jsonData.length - 1,
          summary: `${headers.length} columns, ${jsonData.length - 1} rows`,
        };
      }
      return {
        success: true,
        filename,
        mimeType,
        size: buffer.length,
        parsed: true,
        data: {
          type: "excel",
          sheet_names: workbook.SheetNames,
          sheets,
        },
      };
    } catch (err) {
      console.error(`[Gmail] Excel parse error:`, err.message);
    }
  }

  // For binary formats we can't parse serverside (PDF, DOCX, etc.)
  return {
    success: true,
    filename,
    mimeType,
    size: buffer.length,
    parsed: false,
    data: {
      type: "binary",
      message: `File "${filename}" (${(buffer.length / 1024).toFixed(1)} KB) is a binary ${mimeType} file. Download it from Gmail to view its contents.`,
    },
  };
}

export async function analyzeAttachment({ message_id }) {
  // Read the email to get attachment list
  const msg = await gmailFetch(`/messages/${message_id}?format=full`);
  const attachments = extractAttachmentInfo(msg.payload);

  if (attachments.length === 0) {
    return { success: false, message: "No attachments found on this email." };
  }

  // Fetch and parse each attachment
  const results = [];
  for (const att of attachments.slice(0, 5)) { // Max 5 attachments
    if (!att.attachmentId) continue;
    try {
      const result = await getAttachment({
        message_id,
        attachment_id: att.attachmentId,
        filename: att.filename,
      });
      results.push(result);
    } catch (err) {
      results.push({
        filename: att.filename,
        mimeType: att.mimeType,
        error: err.message,
      });
    }
  }

  return {
    success: true,
    email_subject: getHeader(msg.payload?.headers, "Subject"),
    email_from: getHeader(msg.payload?.headers, "From"),
    attachment_count: attachments.length,
    attachments: results,
  };
}

export async function getProfile() {
  const profile = await gmailFetch("/profile");
  return {
    email: profile.emailAddress,
    totalMessages: profile.messagesTotal,
    totalThreads: profile.threadsTotal,
  };
}
