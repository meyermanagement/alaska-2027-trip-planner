/**
 * Where each item of a day sits relative to right now.
 *
 * A day on a trip is not a list of equals. At two in the afternoon the morning's
 * excursion is a receipt and the seven o'clock dinner is a decision, and a screen
 * that draws them identically makes the reader do the sorting. So each item gets a
 * phase, and the day view leans on it: what is next gets the room, what has gone
 * gets a line.
 *
 * The clock is the device's, not home's, for the same reason the day rail follows
 * the device: the question is what happens next where the family is standing.
 *
 * One deliberate refusal. An item with no start time is never called past while
 * its day is still running. With nothing recorded, the event is the whole day, and
 * dimming somebody's afternoon at breakfast because it happened to sort first
 * would be the app inventing a fact. Those wait until tomorrow, same rule the
 * review affordance uses.
 */

/** "HH:MM" or null. Accepts "19:30:00" from Postgres time columns. */
export function hm(value) {
  const s = String(value || "").slice(0, 5);
  return /^\d{2}:\d{2}$/.test(s) ? s : null;
}

/** Minutes since midnight, or null when there is no time to read. */
export function minutesOf(value) {
  const t = hm(value);
  if (!t) return null;
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

/** "HH:MM" from minutes since midnight, wrapping at both ends of the day. */
export function hmOf(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
    m % 60,
  ).padStart(2, "0")}`;
}

/**
 * Phase for one item.
 *
 * - `past`   — over. Minimized.
 * - `next`   — the soonest thing still ahead today. Highlighted. Exactly one.
 * - `later`  — ahead of that, or undated-in-the-day and so not yet placed.
 * - `future` — belongs to a day after the one being viewed.
 * - `done`   — the viewed day is behind us entirely.
 *
 * @param item an itinerary row
 * @param opts.today  the day being lived, YYYY-MM-DD
 * @param opts.nowHM  "HH:MM" on the device, or null before the browser reports
 * @param opts.viewing the day being looked at, YYYY-MM-DD (defaults to today)
 */
export function phaseOf(item, { today, nowHM = null, viewing } = {}) {
  if (!item || !today) return "later";
  const day = viewing || today;

  if (item.status === "cancelled") return "past";

  // A day that is not today is simple: all of it has happened, or none of it has.
  if (day < today) return "done";
  if (day > today) return "future";

  const start = minutesOf(item.start_time);
  // Nothing recorded: the event is the whole day, and the day is not over.
  if (start === null) return "later";

  const now = minutesOf(nowHM);
  // Before the browser says what time it is, nothing today is called past. The
  // server would give a different answer, and a row that renders dim and then
  // brightens is worse than one that waits a beat.
  if (now === null) return "later";

  return start <= now ? "past" : "later";
}

/**
 * The whole day, sorted, with phases filled in and exactly one `next`.
 *
 * `next` has to be chosen across the day rather than per item -- "is anything
 * sooner than me" is not a question one row can answer about itself. Timed items
 * win it: an untimed row cannot be the next thing at a particular hour. If the
 * day has nothing timed left, the first untimed row not yet ticked off takes it,
 * because a day of unscheduled plans should still say where to start.
 *
 * @returns { items: [{ item, phase }], next, past, ahead }
 */
export function planDay(items, opts = {}) {
  const { today, nowHM = null, viewing } = opts;
  const day = viewing || today;
  const rows = (items || []).map((item) => ({
    item,
    phase: phaseOf(item, { today, nowHM, viewing: day }),
  }));

  const isToday = Boolean(today) && day === today;
  if (isToday) {
    const timed = rows
      .filter(
        (r) => r.phase === "later" && minutesOf(r.item.start_time) !== null,
      )
      .sort(
        (a, b) => minutesOf(a.item.start_time) - minutesOf(b.item.start_time),
      );

    const pick =
      timed[0] ||
      rows.find(
        (r) =>
          r.phase === "later" &&
          minutesOf(r.item.start_time) === null &&
          !r.item.is_done,
      );

    if (pick) pick.phase = "next";
  }

  return {
    items: rows,
    next: rows.find((r) => r.phase === "next")?.item ?? null,
    past: rows.filter((r) => r.phase === "past").length,
    ahead: rows.filter((r) => r.phase === "next" || r.phase === "later").length,
  };
}

/** Minutes from now until this item, or null when either end is unknown. */
export function minutesUntil(item, { nowHM } = {}) {
  const start = minutesOf(item?.start_time);
  const now = minutesOf(nowHM);
  if (start === null || now === null) return null;
  return start - now;
}

/**
 * "in 20 minutes", "in 2 hours", "at 7:30 PM" -- how long until a thing.
 *
 * Switches to naming the hour past three hours out, because "in 7 hours" is a
 * number nobody converts back into a time they can plan around.
 */
export function untilSaid(minutes, timeLabel) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 0) return null;
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 180) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (m === 0) return `in ${h} hr`;
    return `in ${h} hr ${m} min`;
  }
  return timeLabel ? `at ${timeLabel}` : null;
}

/**
 * How each phase looks.
 *
 * "Minimize" for something already done has to stop short of hiding it: the
 * family still checks a confirmation number for a hotel they are standing in, and
 * a row faded to the point of being unreadable is a row they will scroll past
 * three times looking for it. So the past keeps full-size text and loses its
 * emphasis -- a flatter border, a lighter card -- rather than shrinking.
 *
 * The next thing gets the only ring on the screen. One ring is a signal; a ring on
 * every card is wallpaper.
 */
export const PHASE_CLASS = {
  next: "border-teal/50 ring-1 ring-teal/25 shadow-sm",
  later: "",
  past: "border-[var(--line)] bg-sand/40 opacity-70",
  done: "border-[var(--line)] bg-sand/40 opacity-70",
  future: "",
};

/** A word for the phase, for anyone who cannot see the ring. */
export const PHASE_LABEL = {
  next: "Next",
  // Short on purpose. "Already happened" is clearer read once and unbearable read
  // six times down a day that is mostly behind the family, and the fading says
  // most of it already.
  past: "Done",
  done: "Done",
};
