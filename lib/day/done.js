/**
 * When a day on a trip is over, and what to say about it.
 *
 * The itinerary already knows how to say "here is what is next." It had nothing
 * to say at the other end of the day, so at ten at night the screen still
 * offered a weather forecast for hours that had gone and a box asking what to do
 * with them. This module is the other bookend: it decides that the day is behind
 * the family, and it writes the sentence that says so.
 *
 * The sentence is assembled from the day's own rows rather than asked of a
 * model. That is a deliberate trade. A model would write something warmer, and
 * it would also cost a call, a wait, and the small but real chance of telling a
 * family they had a lovely dinner at a restaurant they cancelled. This version
 * can only ever say things that are written on the itinerary, it says them the
 * instant the day turns, and it says the same thing every time it is asked.
 */

import { hm, minutesOf } from "./phase";

/** Rows that are not really events: cancelled plans and bare notes. */
function counts(item) {
  return item && item.status !== "cancelled" && item.category !== "note";
}

/**
 * Is the day being viewed behind the family?
 *
 * Two ways to be finished, because two kinds of row live on a day.
 *
 * Anything with a time on it is simple: the hour has gone by. Anything without
 * one is not, and the app's standing rule is that a row with no time is the
 * whole day and so cannot be called past while the day is still running -- which
 * is right at breakfast and silly at eleven at night, when it would keep a day
 * of untimed plans permanently unfinished.
 *
 * So untimed rows are forgiven after the evening cutoff. Late enough that
 * nothing much is starting, early enough to still be the same evening the family
 * is sitting in. It is a judgement, not a fact, which is why it is only ever
 * used to close a day and never to dim a single row.
 *
 * @param rows [{ item, phase }] from planDay
 * @param opts.isToday whether the day being viewed is the day being lived
 * @param opts.nowHM "HH:MM" on the device, or null before the browser reports
 */
export const EVENING_HM = "20:00";

export function dayIsDone(rows, { isToday, nowHM = null } = {}) {
  const real = (rows || []).filter((r) => counts(r.item));
  if (real.length === 0) return false;

  // A day that is not today has already been decided, either way.
  if (!isToday) return real.every((r) => r.phase === "done");

  // Before the browser says what time it is, nothing is over. The server would
  // answer differently, and a day that renders finished and then unfinishes
  // itself is worse than one that waits a beat.
  if (!nowHM) return false;
  const evening = minutesOf(nowHM) >= minutesOf(EVENING_HM);

  return real.every((r) => {
    if (r.phase === "past") return true;
    return evening && !hm(r.item.start_time);
  });
}

/** breakfast, lunch or dinner, from the hour it was booked for. */
function mealAt(time) {
  const m = minutesOf(time);
  if (m === null) return "a meal";
  if (m < 630) return "breakfast";
  if (m < 900) return "lunch";
  return "dinner";
}

/** How one row wants to be named inside a sentence about the day. */
function said(item) {
  const title = String(item.title || "").trim();
  if (!title) return null;
  if (item.category === "dining")
    return `${mealAt(item.start_time)} at ${title}`;
  if (item.category === "flight" || item.category === "transport") return title;
  return title;
}

/** "a, b and c" — an Oxford-comma-free list, because it is being read aloud. */
function listed(parts) {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

const COUNTED = [
  "nothing",
  "One thing",
  "Two things",
  "Three things",
  "Four things",
  "Five things",
  "Six things",
];

/**
 * What the family did today, in one or two sentences built from their own rows.
 *
 * Long days are summarized rather than recited. Naming nine things is a list,
 * and a list is what the itinerary above already is; the point of this sentence
 * is to be the shape of the day rather than a second copy of it.
 *
 * @param rows [{ item, phase }] from planDay, in the order the day ran
 * @returns { count, sentence } — sentence is "" when there is nothing honest to
 *   say, which the caller should treat as "show the heading alone"
 */
export function dayRecap(rows) {
  const items = (rows || []).map((r) => r.item).filter(counts);
  // The stay is where they slept, not something they did. It gets its own line.
  const doings = items.filter((i) => i.category !== "lodging");
  const named = doings.map(said).filter(Boolean);
  const count = doings.length;

  if (named.length === 0) return { count, sentence: "" };

  if (named.length <= 4) {
    const head = COUNTED[named.length] || `${named.length} things`;
    return {
      count,
      sentence: `${head} behind you: ${listed(named)}.`,
    };
  }

  const first = named.slice(0, 3);
  const rest = named.length - 3;
  return {
    count,
    sentence: `${named.length} things behind you, starting with ${listed(
      first,
    )} — and ${rest} more after that.`,
  };
}
