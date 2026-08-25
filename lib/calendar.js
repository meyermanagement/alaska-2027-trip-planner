import { formatDay, formatTime } from "./format";
import { dueInfo } from "./reminders";

/**
 * Getting a trip out of this app and into whatever calendar someone actually
 * lives in. There is no account to connect and no permission to grant: an
 * itinerary item or a task is turned into a plain calendar event, and from
 * there it either opens prefilled in Google or Outlook on the web, or comes
 * down as an .ics file, which is the one language every calendar speaks —
 * Apple Calendar, Outlook on a desktop, Fastmail, Thunderbird, all of them.
 *
 * Times are deliberately written without a timezone. A 9am tour in Skagway is
 * 9am where you are standing, not 9am in Missouri, and a floating time is how
 * the calendar format says exactly that.
 */

const PRODID = "-//Alyeska//Family Travel Planner//EN";
const DEFAULT_MINUTES = 60;

/** YYYY-MM-DD → YYYYMMDD. */
function compactDate(iso) {
  return String(iso || "").replace(/-/g, "");
}

/** HH:MM(:SS) → HHMMSS, and nothing at all if there is no time. */
function compactTime(time) {
  if (!time) return null;
  const [h = "0", m = "0", s = "0"] = String(time).split(":");
  return (
    String(Number(h)).padStart(2, "0") +
    String(Number(m)).padStart(2, "0") +
    String(Number(s)).padStart(2, "0")
  );
}

/** The day after, so an all-day event ends where the calendar expects. */
export function nextDay(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** HH:MM plus n minutes, staying inside the same day. */
function addMinutes(time, minutes) {
  const [h, m] = String(time).split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(
    total % 60,
  ).padStart(2, "0")}`;
}

function joinLines(parts) {
  return parts.filter(Boolean).join("\n");
}

/**
 * An itinerary item as a calendar event. With a time it becomes an hour-long
 * appointment; without one it becomes an all-day entry, which is right for a
 * "we are in Denali today" kind of row.
 */
export function eventFromItem(item, trip) {
  if (!item?.item_date) return null;
  const bits = [
    trip?.name ? `Trip: ${trip.name}` : null,
    item.confirmation_number
      ? `Confirmation: ${item.confirmation_number}`
      : null,
    item.notes || null,
  ];
  return {
    uid: `item-${item.id}@alyeska`,
    title: item.title || "Itinerary item",
    date: item.item_date,
    startTime: item.start_time ? String(item.start_time).slice(0, 5) : null,
    endTime: item.start_time
      ? addMinutes(String(item.start_time).slice(0, 5), DEFAULT_MINUTES)
      : null,
    location: item.location || null,
    description: joinLines(bits),
  };
}

/**
 * A task as a calendar event. It lands on the day the Reminders page says it
 * wants doing — an explicit due date if it has one, otherwise the date implied
 * by its timing against the trip. Tasks are always all-day: "book the excursion"
 * is a day's job, not a 3pm appointment.
 */
export function eventFromTask(task, trip, today) {
  const due = dueInfo(task, trip, today);
  if (!due.date) return null;
  const bits = [
    trip?.name ? `Trip: ${trip.name}` : null,
    task.assignee ? `Owner: ${task.assignee}` : null,
    !due.exact && due.note ? `Timing: ${due.note}` : null,
    task.priority === "high" ? "High priority" : null,
    task.detail || null,
  ];
  return {
    uid: `task-${task.id}@alyeska`,
    title: task.title || "Trip task",
    date: due.date,
    startTime: null,
    endTime: null,
    location: null,
    description: joinLines(bits),
  };
}

/** Escape the four characters the calendar format treats as punctuation. */
function esc(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Long lines have to be folded at 75 octets, continued with a leading space. */
function fold(line) {
  if (line.length <= 74) return line;
  const out = [];
  let rest = line;
  out.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length) {
    out.push(` ${rest.slice(0, 73)}`);
    rest = rest.slice(73);
  }
  return out.join("\r\n");
}

function stamp(now = new Date()) {
  return `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** One VEVENT. Timed events float; dated ones use DATE values. */
function vevent(event, now) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${esc(event.uid)}`,
    `DTSTAMP:${stamp(now)}`,
  ];
  if (event.startTime) {
    lines.push(
      `DTSTART:${compactDate(event.date)}T${compactTime(event.startTime)}`,
    );
    lines.push(
      `DTEND:${compactDate(event.date)}T${compactTime(
        event.endTime || addMinutes(event.startTime, DEFAULT_MINUTES),
      )}`,
    );
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(nextDay(event.date))}`);
  }
  lines.push(`SUMMARY:${esc(event.title)}`);
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
  lines.push("END:VEVENT");
  return lines;
}

/** A whole calendar file, ready to hand to any calendar app. */
export function buildIcs(events, calendarName = "Alyeska", now = new Date()) {
  const list = (events || []).filter((e) => e && e.date);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
  ];
  list.forEach((event) => lines.push(...vevent(event, now)));
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** Google's prefilled-event link. Naive times land in the calendar's own zone. */
export function googleUrl(event) {
  const dates = event.startTime
    ? `${compactDate(event.date)}T${compactTime(event.startTime)}/${compactDate(
        event.date,
      )}T${compactTime(event.endTime || addMinutes(event.startTime, DEFAULT_MINUTES))}`
    : `${compactDate(event.date)}/${compactDate(nextDay(event.date))}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates,
  });
  if (event.description) params.set("details", event.description);
  if (event.location) params.set("location", event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook on the web, same idea. Works for both personal and work accounts. */
export function outlookUrl(event, flavour = "live") {
  const host =
    flavour === "office"
      ? "https://outlook.office.com"
      : "https://outlook.live.com";
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
  });
  if (event.startTime) {
    params.set("startdt", `${event.date}T${event.startTime}:00`);
    params.set(
      "enddt",
      `${event.date}T${event.endTime || addMinutes(event.startTime, DEFAULT_MINUTES)}:00`,
    );
  } else {
    params.set("startdt", event.date);
    params.set("enddt", nextDay(event.date));
    params.set("allday", "true");
  }
  if (event.description) params.set("body", event.description);
  if (event.location) params.set("location", event.location);
  return `${host}/calendar/0/deeplink/compose?${params.toString()}`;
}

/** A filename someone can find again in their downloads folder. */
export function icsFilename(label) {
  const base = String(label || "alyeska")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
  return `${base || "alyeska"}.ics`;
}

/** Plain-language summary of when an event lands, for the menu header. */
export function whenLabel(event) {
  if (!event?.date) return "";
  const day = formatDay(event.date);
  return event.startTime ? `${day} at ${formatTime(event.startTime)}` : day;
}
