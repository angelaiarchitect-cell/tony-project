// ─── GMAIL API ───
// Uses REST API directly with OAuth refresh token — same pattern as Calendar & Sheets.

async function getAccessToken() {
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
  if (data.error) throw new Error(`Google auth error: ${data.error_description || data.error}`);
  return data.access_token;
}

async function gmailFetch(path, options = {}) {
  const token = await getAccessToken();
  const baseUrl = "https://gmail.googleapis.com/gmail/v1/users/me";
  const resp = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message || "Gmail API error");
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

// ─── Exported Functions ───

export async function listEmails({ query, max_results }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("maxResults", String(max_results || 10));
  const list = await gmailFetch(`/messages?${params}`);
  if (!list.messages?.length) return { emails: [], count: 0 };

  // Fetch headers for each message (batch of metadata)
  const emails = await Promise.all(
    list.messages.slice(0, max_results || 10).map(async (msg) => {
      const detail = await gmailFetch(`/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
      return {
        id: detail.id,
        threadId: detail.threadId,
        snippet: detail.snippet,
        from: getHeader(detail.payload?.headers, "From"),
        subject: getHeader(detail.payload?.headers, "Subject"),
        date: getHeader(detail.payload?.headers, "Date"),
        labels: detail.labelIds || [],
        isUnread: detail.labelIds?.includes("UNREAD"),
      };
    })
  );

  return { emails, count: emails.length, totalEstimate: list.resultSizeEstimate };
}

export async function readEmail({ message_id }) {
  const msg = await gmailFetch(`/messages/${message_id}?format=full`);
  const headers = msg.payload?.headers || [];
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    cc: getHeader(headers, "Cc"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    messageId: getHeader(headers, "Message-ID"),
    body: extractBody(msg.payload).slice(0, 3000), // Cap body length
    labels: msg.labelIds || [],
    isUnread: msg.labelIds?.includes("UNREAD"),
    snippet: msg.snippet,
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

export async function getProfile() {
  const profile = await gmailFetch("/profile");
  return {
    email: profile.emailAddress,
    totalMessages: profile.messagesTotal,
    totalThreads: profile.threadsTotal,
  };
}
