// The trip, as a calendar.
//
// Two ways to want this. One is "put that one deadline in my calendar", which is
// a file you open once. The other is "I want the whole thing to appear in my
// calendar and stay right", which is a subscription: one URL, added once, that
// every calendar app on earth re-reads on its own schedule. The second is the one
// worth having, and it is the same text either way — a .ics body, which is why all
// of it lives here.
//
// Everything is an all-day event. A pre-departure task is due on a day, not at a
// time, and an itinerary item with no time is a day as well. Where an item does
// have a time it becomes a timed event in the family's own zone, because "6:15am
// Denali shuttle" is useless as a day-long band across the top of a Thursday.
//
// Pure: rows in, text out. No clock except the one it is handed, no network.

import { tripPath, tripRef } from "@/lib/trips/route";
const FOLD_AT = 73;

/** Escape the four characters iCalendar cares about. */
export function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold a long line at 75 octets, the way RFC 5545 insists.
 *
 * Folded on characters rather than bytes, conservatively, so a line of emoji or
 * accented text cannot push a fold past the limit.
 */
export function fold(line) {
  const raw = String(line ?? "");
  if (raw.length <= FOLD_AT) return raw;
  const parts = [raw.slice(0, FOLD_AT)];
  let rest = raw.slice(FOLD_AT);
  while (rest.length > FOLD_AT - 1) {
    parts.push(` ${rest.slice(0, FOLD_AT - 1)}`);
    rest = rest.slice(FOLD_AT - 1);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join("\r\n");
}

const dateOnly = (value) => {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.replace(/-/g, "") : null;
};

/** The day after an ISO date, because an all-day DTEND is exclusive. */
export function dayAfter(value) {
  const raw = typeof value === "string" ? value.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const at = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  return new Date(at + 86400000).toISOString().slice(0, 10);
}

/** A time as HHMMSS, from "6:15am", "18:30" or "06:15:00". */
export function clockOf(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(raw);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3] || 0);
  const half = (m[4] || "").toLowerCase();
  if (half === "pm" && hour < 12) hour += 12;
  if (half === "am" && hour === 12) hour = 0;
  if (hour > 23 || min > 59 || sec > 59) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(hour)}${pad(min)}${pad(sec)}`;
}

/**
 * One event, as lines.
 *
 * @param {object} input
 * @param {string} input.uid       stable, so a re-read updates rather than duplicates
 * @param {string} input.date      ISO date
 * @param {string} [input.time]    local time, when there is one
 * @param {string} [input.endDate] ISO date, for something spanning days
 * @param {string} input.title
 * @param {string} [input.detail]
 * @param {string} [input.location]
 * @param {string} [input.url]
 * @param {string} [input.zone]    IANA zone for timed events
 * @param {string} input.stamp     DTSTAMP, as YYYYMMDDTHHMMSSZ
 * @returns {string[]|null}
 */
export function eventLines({
  uid,
  date,
  time = "",
  endDate = "",
  title,
  detail = "",
  location = "",
  url = "",
  zone = "America/Chicago",
  stamp,
}) {
  const start = dateOnly(date);
  if (!start || !uid || !title) return null;

  const lines = ["BEGIN:VEVENT", `UID:${escapeText(uid)}`, `DTSTAMP:${stamp}`];

  const clock = clockOf(time);
  if (clock) {
    // An hour long by default. A calendar refuses a zero-length event in places,
    // and "how long is the shuttle" is not a thing this app knows.
    const endClock = String(Number(clock.slice(0, 2)) + 1).padStart(2, "0");
    lines.push(`DTSTART;TZID=${zone}:${start}T${clock}`);
    lines.push(`DTEND;TZID=${zone}:${start}T${endClock}${clock.slice(2)}`);
  } else {
    const last = dateOnly(endDate) ? endDate : date;
    lines.push(`DTSTART;VALUE=DATE:${start}`);
    lines.push(`DTEND;VALUE=DATE:${dateOnly(dayAfter(last))}`);
  }

  lines.push(`SUMMARY:${escapeText(title)}`);
  if (detail) lines.push(`DESCRIPTION:${escapeText(detail)}`);
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (url) lines.push(`URL:${escapeText(url)}`);
  lines.push("END:VEVENT");
  return lines;
}

/**
 * A whole calendar.
 *
 * @param {object} input
 * @param {string} input.name    what the subscriber sees it called
 * @param {Array<string[]>} input.events  from eventLines
 * @returns {string}
 */
export function calendar({ name, events }) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Alyeska//Family travel planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `NAME:${escapeText(name)}`,
    // How often a subscriber should come back. Calendar apps treat this as a
    // hint and mostly ignore it, but the ones that honor it are the ones people
    // complain about being stale.
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const event of events || []) {
    if (event) lines.push(...event);
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

/** Now, as iCalendar says it. */
export function stampOf(when = new Date()) {
  return `${when.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/**
 * The whole family's calendar: every dated task, every dated itinerary item, and
 * a band across each trip.
 *
 * @param {object} input
 * @param {Array} input.trips
 * @param {Array} input.tasks       predeparture_tasks rows, with trip_id
 * @param {Array} input.itinerary   itinerary_items rows, with trip_id
 * @param {string} input.origin     for links back into the app
 * @param {string} [input.zone]
 * @param {string} [input.stamp]
 */
export function familyCalendar({
  trips = [],
  tasks = [],
  itinerary = [],
  origin = "",
  zone = "America/Chicago",
  stamp = stampOf(),
}) {
  const byId = new Map((trips || []).map((trip) => [trip.id, trip]));
  // These URLs end up inside a file that lives in somebody's calendar app for
  // months, which makes them the links that most need to survive a rename.
  const link = (trip) =>
    tripRef(trip) && origin ? `${origin}${tripPath(trip)}` : "";
  const events = [];

  for (const trip of trips) {
    if (!trip?.start_date) continue;
    events.push(
      eventLines({
        uid: `trip-${trip.id}@alyeska`,
        date: trip.start_date,
        endDate: trip.end_date || trip.start_date,
        title: trip.name || "Trip",
        detail: trip.destination ? `${trip.destination}` : "",
        url: link(trip),
        zone,
        stamp,
      }),
    );
  }

  for (const item of itinerary) {
    if (!item?.item_date) continue;
    const trip = byId.get(item.trip_id);
    events.push(
      eventLines({
        uid: `item-${item.id}@alyeska`,
        date: item.item_date,
        time: item.start_time || "",
        endDate: item.end_date || "",
        title: trip?.name ? `${item.title} · ${trip.name}` : item.title,
        detail: item.notes || "",
        location: item.location || "",
        url: link(trip),
        zone,
        stamp,
      }),
    );
  }

  for (const task of tasks) {
    // Only the ones with a real date. A task whose "when" is a stage belongs on
    // the checklist and in the morning email, not as a guess in somebody's
    // calendar.
    if (!task?.due_date || task.is_done) continue;
    const trip = byId.get(task.trip_id);
    events.push(
      eventLines({
        uid: `task-${task.id}@alyeska`,
        date: task.due_date,
        title: `${task.title}${trip?.name ? ` · ${trip.name}` : ""}`,
        detail: [task.detail, task.assignee ? `For: ${task.assignee}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        url: link(trip),
        zone,
        stamp,
      }),
    );
  }

  return calendar({ name: "Alyeska — family travel", events });
}
