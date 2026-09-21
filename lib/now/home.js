import {
  isArchivedTrip,
  isCurrentTrip,
  isDraftTrip,
  isPastTrip,
} from "@/lib/format";

// How Now decides what to put at the top of itself.
//
// The screen is the app's home, so it has to answer two questions at once and in
// this order: what is happening today, and what is about to happen. A family can
// be on a trip and packing for the next one on the same evening -- that is the
// whole reason this screen leads rather than a trip does -- so nothing here
// returns a single trip. Everything is a list, shortest fuse first.

// How far ahead a departure is worth a panel of its own. Two weeks is where
// packing starts to be a real answer to "what needs me"; further out than that
// and the trip's own screen is the right place to be.
export const SOON_DAYS = 14;

/**
 * Whole days from one calendar date to another, by the calendar rather than by
 * 24-hour arithmetic, so a daylight-saving change cannot make tomorrow read as
 * today. Negative when `to` is in the past. Null when either date is unusable.
 */
export function daysBetween(from, to) {
  if (!from || !to) return null;
  const a = new Date(`${from}T12:00:00Z`);
  const b = new Date(`${to}T12:00:00Z`);
  if (!Number.isFinite(+a) || !Number.isFinite(+b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * Split the family's trips into what Now leads with.
 *
 * `current` is every trip happening today, earliest start first. `soon` is every
 * trip leaving inside the next two weeks, nearest departure first, each with the
 * number of days until it starts. Drafts, cancelled trips, archived trips and
 * anything already over are left out -- they are not what needs anybody today.
 *
 * Callers pass only trips the reader is allowed to see; this never widens that.
 */
export function homeTrips(trips = [], today) {
  const current = [];
  const soon = [];
  for (const trip of trips) {
    // isArchivedTrip reads the status column; the timestamp is checked too,
    // because a trip put away by hand carries that and the opening rules already
    // honor it.
    if (!trip || isDraftTrip(trip) || isArchivedTrip(trip) || trip.archived_at)
      continue;
    if (["cancelled", "canceled"].includes(trip.status)) continue;
    if (isCurrentTrip(trip, today)) {
      current.push(trip);
      continue;
    }
    if (isPastTrip(trip, today)) continue;
    const days = daysBetween(today, trip.start_date);
    if (days !== null && days > 0 && days <= SOON_DAYS) soon.push({ trip, days });
  }
  current.sort(
    (a, b) =>
      (a.start_date || "").localeCompare(b.start_date || "") ||
      String(a.id).localeCompare(String(b.id)),
  );
  soon.sort(
    (a, b) => a.days - b.days || String(a.trip.id).localeCompare(String(b.trip.id)),
  );
  return { current, soon };
}

// A trip leaving this soon is opened for you rather than left folded. The case
// it exists for is the hard one: home on Sunday and gone again Monday, where the
// next trip's packing is tonight's work even though a different trip is on the
// screen above it.
export const OPEN_WITHIN_DAYS = 2;

/** Whether a stacked departure starts already open. */
export function opensByDefault(days) {
  return typeof days === "number" && days <= OPEN_WITHIN_DAYS;
}

/**
 * Which half of the day it is, in the words a person would use. Morning until
 * noon, afternoon until five, evening after that -- and no "good night", because
 * somebody checking the screen at one in the morning is working, not retiring.
 */
export function greetingFor(hour) {
  if (!Number.isFinite(hour)) return "Hello";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * How a departure is said. Counted in sleeps, because that is how a family
 * counts: a trip that starts tomorrow is one day away whatever time it leaves.
 */
export function departureSaid(days) {
  if (days === null || days === undefined) return "";
  if (days <= 0) return "Leaves today";
  if (days === 1) return "Leaves tomorrow";
  return `Leaves in ${days} days`;
}

/**
 * What is on for a given day, in the order it happens.
 *
 * Anything spanning the day counts -- a hotel booked from Friday to Monday is on
 * every one of those days, which is why the end date is consulted and not only
 * the start. Cancelled items are dropped; done items are kept, because a morning
 * you have already had is still what the day was.
 */
export function todaysPlan(items = [], today) {
  if (!today) return [];
  return items
    .filter(
      (item) =>
        item?.item_date &&
        item.item_date <= today &&
        today <= (item.end_date || item.item_date) &&
        item.status !== "cancelled",
    )
    .sort(
      (a, b) =>
        String(a.start_time || "99:99:99").localeCompare(
          String(b.start_time || "99:99:99"),
        ) || (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );
}

/**
 * Done out of total for one trip, from rows fetched for every trip at once.
 * `total` of zero means there is no list yet, which the screen says differently
 * from a list nobody has started.
 */
export function progressOf(rows = [], tripId, key = "is_packed") {
  let done = 0;
  let total = 0;
  for (const row of rows) {
    if (row?.trip_id !== tripId) continue;
    total += 1;
    if (row[key]) done += 1;
  }
  return { done, total };
}
