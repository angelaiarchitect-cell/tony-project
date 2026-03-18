// ─── TOOL EXECUTOR ───
// Dispatches Claude's tool_use calls to the appropriate handler.

import { listEvents, createEvent, createReminder, findFreeTime, deleteEvent } from "./google-calendar.js";
import { createSpreadsheet, addRows, readSheet } from "./google-sheets.js";
import { launchApp, searchContent, remoteCommand, getStatus, typeText } from "./roku.js";
import { organizeDay } from "./day-organizer.js";

export async function executeTool(name, input, context) {
  try {
    switch (name) {
      // Google Calendar
      case "google_calendar_list_events":
        return await listEvents(input);
      case "google_calendar_create_event":
        return await createEvent(input);
      case "google_calendar_create_reminder":
        return await createReminder(input);
      case "google_calendar_find_free_time":
        return await findFreeTime(input);
      case "google_calendar_delete_event":
        return await deleteEvent(input);

      // Google Sheets
      case "google_sheets_create":
        return await createSpreadsheet(input);
      case "google_sheets_add_rows":
        return await addRows(input);
      case "google_sheets_read":
        return await readSheet(input);

      // Day Organizer
      case "organize_my_day":
        return await organizeDay({ ...input, context });

      // Roku
      case "roku_launch_app":
        return await launchApp(input);
      case "roku_search_content":
        return await searchContent(input);
      case "roku_remote_command":
        return await remoteCommand(input);
      case "roku_get_status":
        return await getStatus();
      case "roku_type_text":
        return await typeText(input);

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || "Tool execution failed" };
  }
}
