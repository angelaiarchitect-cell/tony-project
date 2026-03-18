// ─── GOOGLE CALENDAR API ───
// Uses REST API directly with OAuth refresh token — no SDK bloat.

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

async function calendarFetch(path, options = {}) {
  const token = await getAccessToken();
  const baseUrl = "https://www.googleapis.com/calendar/v3";
  const resp = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  const data = await resp.json();
  if (data.error) throw new Error(`Calendar API error: ${data.error.message}`);
  return data;
}

export async function listEvents({ time_min, time_max, max_results = 20 }) {
  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const params = new URLSearchParams({
    timeMin: time_min || now.toISOString(),
    timeMax: time_max || endOfDay.toISOString(),
    maxResults: String(max_results),
    singleEvents: "true",
    orderBy: "startTime",
  });

  const data = await calendarFetch(`/calendars/primary/events?${params}`);
  return {
    events: (data.items || []).map((e) => ({
      id: e.id,
      title: e.summary || "(No title)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      location: e.location || null,
      description: e.description || null,
      status: e.status,
      all_day: !!e.start?.date,
      link: e.htmlLink,
    })),
    count: data.items?.length || 0,
  };
}

export async function createEvent({ summary, description, location, start_time, end_time, all_day, reminders_minutes, recurrence, attendees }) {
  const event = { summary };
  if (description) event.description = description;
  if (location) event.location = location;

  if (all_day) {
    event.start = { date: start_time.split("T")[0] };
    event.end = { date: end_time ? end_time.split("T")[0] : start_time.split("T")[0] };
  } else {
    event.start = { dateTime: start_time, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York" };
    event.end = { dateTime: end_time, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York" };
  }

  if (reminders_minutes && reminders_minutes.length > 0) {
    event.reminders = {
      useDefault: false,
      overrides: reminders_minutes.map((m) => ({ method: "popup", minutes: m })),
    };
  }

  if (recurrence) {
    event.recurrence = [recurrence];
  }

  if (attendees && attendees.length > 0) {
    event.attendees = attendees.map((email) => ({ email }));
  }

  const data = await calendarFetch("/calendars/primary/events", {
    method: "POST",
    body: JSON.stringify(event),
  });

  return {
    success: true,
    event_id: data.id,
    title: data.summary,
    start: data.start?.dateTime || data.start?.date,
    end: data.end?.dateTime || data.end?.date,
    link: data.htmlLink,
    message: `Event "${data.summary}" created successfully.`,
  };
}

export async function createReminder({ title, date, time, alert_minutes_before, notes }) {
  const alerts = alert_minutes_before || [0, 60];

  let start_time, end_time, all_day;
  if (time) {
    start_time = `${date}T${time}:00`;
    const endDate = new Date(`${date}T${time}:00`);
    endDate.setMinutes(endDate.getMinutes() + 30);
    end_time = endDate.toISOString().replace("Z", "");
    all_day = false;
  } else {
    start_time = date;
    end_time = date;
    all_day = true;
  }

  return await createEvent({
    summary: `⏰ ${title}`,
    description: notes || `Reminder: ${title}`,
    start_time,
    end_time,
    all_day,
    reminders_minutes: alerts,
  });
}

export async function findFreeTime({ date, duration_minutes = 30, work_hours_start = "09:00", work_hours_end = "17:00" }) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  const dayStart = `${date}T${work_hours_start}:00`;
  const dayEnd = `${date}T${work_hours_end}:00`;

  const token = await getAccessToken();
  const resp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: new Date(dayStart).toISOString(),
      timeMax: new Date(dayEnd).toISOString(),
      timeZone: tz,
      items: [{ id: "primary" }],
    }),
  });
  const data = await resp.json();
  const busy = data.calendars?.primary?.busy || [];

  // Calculate free slots
  const slots = [];
  let current = new Date(dayStart);
  const end = new Date(dayEnd);

  for (const block of busy) {
    const busyStart = new Date(block.start);
    if (current < busyStart) {
      const gap = (busyStart - current) / 60000;
      if (gap >= duration_minutes) {
        slots.push({
          start: current.toTimeString().slice(0, 5),
          end: busyStart.toTimeString().slice(0, 5),
          duration_minutes: Math.round(gap),
        });
      }
    }
    current = new Date(Math.max(current, new Date(block.end)));
  }
  if (current < end) {
    const gap = (end - current) / 60000;
    if (gap >= duration_minutes) {
      slots.push({
        start: current.toTimeString().slice(0, 5),
        end: end.toTimeString().slice(0, 5),
        duration_minutes: Math.round(gap),
      });
    }
  }

  return {
    date,
    work_hours: `${work_hours_start} - ${work_hours_end}`,
    busy_blocks: busy.map((b) => ({
      start: new Date(b.start).toTimeString().slice(0, 5),
      end: new Date(b.end).toTimeString().slice(0, 5),
    })),
    free_slots: slots,
    total_free_minutes: slots.reduce((s, slot) => s + slot.duration_minutes, 0),
  };
}

export async function deleteEvent({ event_id }) {
  const token = await getAccessToken();
  const resp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${event_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resp.status === 204 || resp.status === 200) {
    return { success: true, message: `Event ${event_id} deleted.` };
  }
  const data = await resp.json();
  throw new Error(data.error?.message || "Failed to delete event");
}
