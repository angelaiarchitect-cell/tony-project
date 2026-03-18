// ─── DAY ORGANIZER ───
// Aggregates calendar events, deadlines, and bills into a structured daily plan.

import { listEvents } from "./google-calendar.js";

export async function organizeDay({ date, context }) {
  const targetDate = date || new Date().toISOString().split("T")[0];
  const results = { date: targetDate, calendar: null, deadlines: [], bills: [], plan: [] };

  // 1. Pull calendar events
  try {
    const dayStart = `${targetDate}T00:00:00Z`;
    const dayEnd = `${targetDate}T23:59:59Z`;
    results.calendar = await listEvents({ time_min: dayStart, time_max: dayEnd, max_results: 30 });
  } catch (err) {
    results.calendar = { error: err.message, events: [] };
  }

  // 2. Pull deadlines from context
  if (context?.deadlines) {
    const threeDaysOut = new Date(targetDate);
    threeDaysOut.setDate(threeDaysOut.getDate() + 3);
    results.deadlines = context.deadlines.filter((d) => {
      if (d.done) return false;
      const due = new Date(d.due);
      return due <= threeDaysOut;
    }).sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return (priority[a.priority] || 2) - (priority[b.priority] || 2);
    });
  }

  // 3. Pull bills from context
  if (context?.bills) {
    const today = new Date(targetDate).getDate();
    results.bills = context.bills.filter((b) => {
      if (b.paid) return false;
      const daysUntilDue = b.dueDay - today;
      return daysUntilDue >= 0 && daysUntilDue <= 5;
    });
  }

  // 4. Build structured plan
  const events = results.calendar?.events || [];
  const morningEvents = events.filter((e) => {
    const hour = new Date(e.start).getHours();
    return hour < 12;
  });
  const afternoonEvents = events.filter((e) => {
    const hour = new Date(e.start).getHours();
    return hour >= 12 && hour < 17;
  });
  const eveningEvents = events.filter((e) => {
    const hour = new Date(e.start).getHours();
    return hour >= 17;
  });

  results.plan = {
    morning: {
      events: morningEvents.map((e) => `${new Date(e.start).toTimeString().slice(0, 5)} — ${e.title}`),
      focus: results.deadlines.filter((d) => d.priority === "high").map((d) => d.task),
    },
    afternoon: {
      events: afternoonEvents.map((e) => `${new Date(e.start).toTimeString().slice(0, 5)} — ${e.title}`),
      focus: results.deadlines.filter((d) => d.priority === "medium").map((d) => d.task),
    },
    evening: {
      events: eveningEvents.map((e) => `${new Date(e.start).toTimeString().slice(0, 5)} — ${e.title}`),
    },
    urgent: {
      overdue_deadlines: results.deadlines.filter((d) => new Date(d.due) < new Date(targetDate)).map((d) => d.task),
      due_today: results.deadlines.filter((d) => d.due === targetDate).map((d) => d.task),
      bills_due_soon: results.bills.map((b) => `${b.name} — $${b.amount} (due ${b.dueDay}th)`),
    },
    total_meetings: events.length,
    total_deadlines: results.deadlines.length,
    total_bills_due: results.bills.length,
  };

  return results;
}
