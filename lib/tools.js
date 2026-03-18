// ─── TOOL DEFINITIONS FOR CLAUDE ───
// These define what Tony can actually DO — not just talk about.

export const TOOLS = [
  // ═══ GOOGLE CALENDAR ═══
  {
    name: "google_calendar_list_events",
    description: "List upcoming calendar events. Use when the user asks about their schedule, upcoming meetings, what's on their calendar, or free time. Always use this before organizing the day.",
    input_schema: {
      type: "object",
      properties: {
        time_min: { type: "string", description: "Start of time range in ISO 8601 format (e.g. 2026-03-17T00:00:00Z). Defaults to now." },
        time_max: { type: "string", description: "End of time range in ISO 8601 format. Defaults to end of today." },
        max_results: { type: "number", description: "Maximum number of events to return. Default 20." },
      },
    },
  },
  {
    name: "google_calendar_create_event",
    description: "Create a new calendar event. Use when the user wants to schedule a meeting, appointment, or block time. Always confirm details with the user BEFORE calling this tool.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event description/notes" },
        location: { type: "string", description: "Event location" },
        start_time: { type: "string", description: "Start time in ISO 8601 format" },
        end_time: { type: "string", description: "End time in ISO 8601 format" },
        all_day: { type: "boolean", description: "If true, creates an all-day event using start_date/end_date" },
        reminders_minutes: {
          type: "array",
          items: { type: "number" },
          description: "Array of reminder times in minutes before event (e.g. [10, 60] for 10min and 1hr before)",
        },
        recurrence: { type: "string", description: "RRULE string for recurring events (e.g. RRULE:FREQ=WEEKLY;BYDAY=MO)" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Array of email addresses to invite",
        },
      },
      required: ["summary", "start_time", "end_time"],
    },
  },
  {
    name: "google_calendar_create_reminder",
    description: "Create a reminder as a calendar event with alerts. Use for bill reminders, deadline reminders, or any time-based reminder. Creates an event with popup notifications.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Reminder title (e.g. 'Electric bill due in 3 days')" },
        date: { type: "string", description: "Date for the reminder in YYYY-MM-DD format" },
        time: { type: "string", description: "Time for the reminder in HH:MM format (24hr). If omitted, creates all-day event." },
        alert_minutes_before: {
          type: "array",
          items: { type: "number" },
          description: "When to alert, in minutes before (e.g. [0, 1440] for at-time and 1 day before). Default [0, 60].",
        },
        notes: { type: "string", description: "Additional notes for the reminder" },
      },
      required: ["title", "date"],
    },
  },
  {
    name: "google_calendar_find_free_time",
    description: "Find available time slots on a given date. Use when the user asks when they're free, wants to find a meeting time, or needs to know open slots.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date to check in YYYY-MM-DD format" },
        duration_minutes: { type: "number", description: "Minimum duration of free slot in minutes. Default 30." },
        work_hours_start: { type: "string", description: "Start of working hours in HH:MM format. Default '09:00'." },
        work_hours_end: { type: "string", description: "End of working hours in HH:MM format. Default '17:00'." },
      },
      required: ["date"],
    },
  },
  {
    name: "google_calendar_delete_event",
    description: "Delete a calendar event. ONLY use this after explicit user confirmation. Never delete without asking first.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string", description: "The event ID to delete" },
      },
      required: ["event_id"],
    },
  },

  // ═══ GOOGLE SHEETS ═══
  {
    name: "google_sheets_create",
    description: "Create a new Google Spreadsheet with optional headers and data. Use when the user wants to create a spreadsheet, tracker, budget sheet, or any tabular data.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Spreadsheet title" },
        sheet_name: { type: "string", description: "Name of the first sheet tab. Default 'Sheet1'." },
        headers: {
          type: "array",
          items: { type: "string" },
          description: "Column headers (e.g. ['Name', 'Amount', 'Date', 'Category'])",
        },
        data: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "2D array of row data (e.g. [['Rent', '1850', '2026-04-01', 'Housing']])",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "google_sheets_add_rows",
    description: "Add rows to an existing Google Spreadsheet. Use when the user wants to add data to a sheet.",
    input_schema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "The spreadsheet ID" },
        sheet_name: { type: "string", description: "Sheet tab name. Default 'Sheet1'." },
        data: {
          type: "array",
          items: { type: "array", items: { type: "string" } },
          description: "2D array of rows to append",
        },
      },
      required: ["spreadsheet_id", "data"],
    },
  },
  {
    name: "google_sheets_read",
    description: "Read data from a Google Spreadsheet. Use when the user wants to see or analyze spreadsheet data.",
    input_schema: {
      type: "object",
      properties: {
        spreadsheet_id: { type: "string", description: "The spreadsheet ID" },
        range: { type: "string", description: "A1 notation range (e.g. 'Sheet1!A1:D10'). Default reads all data." },
      },
      required: ["spreadsheet_id"],
    },
  },

  // ═══ GMAIL ═══
  {
    name: "gmail_list_emails",
    description: "List recent emails from the user's Gmail inbox. Use when the user asks about their email, inbox, unread messages, or wants to check mail. Returns subject, sender, date, and snippet for each email.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (e.g. 'is:unread', 'from:boss@company.com', 'subject:invoice'). Default returns recent emails." },
        max_results: { type: "number", description: "Number of emails to return. Default 10, max 20." },
      },
    },
  },
  {
    name: "gmail_read_email",
    description: "Read the full content of a specific email by its message ID. Use after listing emails to get the full body, or when the user wants to read a specific message.",
    input_schema: {
      type: "object",
      properties: {
        message_id: { type: "string", description: "The Gmail message ID to read" },
      },
      required: ["message_id"],
    },
  },
  {
    name: "gmail_search",
    description: "Search emails with Gmail query syntax. Use when the user wants to find specific emails by sender, subject, date, label, or content. Supports Gmail operators like from:, to:, subject:, has:attachment, after:, before:, label:, is:unread.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (e.g. 'from:john subject:project has:attachment')" },
        max_results: { type: "number", description: "Number of results. Default 5." },
      },
      required: ["query"],
    },
  },
  {
    name: "gmail_create_draft",
    description: "Create a draft email in Gmail. Use when the user wants to compose an email but review it before sending. Can also create reply drafts to existing emails.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text (plain text)" },
        reply_to_message_id: { type: "string", description: "If replying to an email, the message ID of the original. Subject and threading are handled automatically." },
      },
      required: ["to", "body"],
    },
  },
  {
    name: "gmail_send_email",
    description: "Send an email directly from Gmail. Use ONLY after the user has explicitly confirmed they want to send. Can send new emails or replies to existing threads.",
    input_schema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Email body text (plain text)" },
        reply_to_message_id: { type: "string", description: "If replying, the message ID of the original email" },
      },
      required: ["to", "subject", "body"],
    },
  },

  // ═══ DAY ORGANIZER ═══
  {
    name: "organize_my_day",
    description: "Create a structured daily plan by pulling calendar events, deadlines, and bills. Use when the user says 'organize my day', 'what should I focus on', 'daily briefing', or 'morning report'.",
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Date to organize in YYYY-MM-DD format. Default today." },
      },
    },
  },

  // ═══ ROKU / ENTERTAINMENT ═══
  {
    name: "roku_launch_app",
    description: "Launch an app on the Roku device. Use when the user wants to open Netflix, YouTube, Hulu, Disney+, etc. Common app names: Netflix, YouTube, Hulu, Disney+, Amazon Prime Video, HBO Max, Peacock, Apple TV+, Paramount+, Spotify, Plex.",
    input_schema: {
      type: "object",
      properties: {
        app_name: { type: "string", description: "Name of the app to launch (e.g. 'Netflix', 'YouTube')" },
        content_id: { type: "string", description: "Optional deep-link content ID to play specific content" },
      },
      required: ["app_name"],
    },
  },
  {
    name: "roku_search_content",
    description: "Search for a movie, TV show, or content across all Roku channels. Use when the user wants to find something to watch.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search keyword (movie title, show name, actor, etc.)" },
        type: { type: "string", enum: ["movie", "tv-show", "person", "channel", "game"], description: "Content type to search for" },
      },
      required: ["query"],
    },
  },
  {
    name: "roku_remote_command",
    description: "Send a remote control command to the Roku. Use for play/pause, navigation, volume, etc.",
    input_schema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: ["play", "pause", "home", "back", "up", "down", "left", "right", "select", "replay", "info", "rev", "fwd", "volume_up", "volume_down", "volume_mute", "power_off", "power_on"],
          description: "Remote control command to send",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "roku_get_status",
    description: "Get the current Roku status — what app is active, device info. Use to check what's currently playing.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "roku_type_text",
    description: "Type text on the Roku (useful for search fields). Use after launching an app when the user wants to search for specific content within the app.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to type character by character" },
      },
      required: ["text"],
    },
  },
];
