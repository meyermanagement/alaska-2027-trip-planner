import {
  isArchivedTrip,
  isCurrentTrip,
  isDraftTrip,
  isPastTrip,
} from "@/lib/format";
import { cleanMonths, MONTHS_FULL, monthsSaid } from "@/lib/someday/months";
import { daysBetween, SOON_DAYS } from "./home";

// What the home screen is about when the next departure is still weeks away.
//
// Inside two weeks the screen has real work on it: a day to open, a list to
// pack. Past that both of those are false comfort -- nobody packs for November in
// September -- and the screen would fall back to a list of chores with no
// picture on it. What is genuinely live at thirty to ninety days is dates: a
// fare that expires Thursday, a passport that will not survive the six-month
// rule, a cruise balance, the morning excursions open. So the far state leads
// with a countdown and then says, once, every date that will not wait.
//
// Everything here is pure. Rows and a date in, rows out, so the band and the
// notification cannot disagree about what is close.

/**
 * How far ahead a deadline is worth printing on the home screen. Two months is
 * the span a family can act inside: a passport renewal, a cruise balance and a
 * fare hold all fall in it, and nothing beyond it can be done today.
 */
export const AHEAD_DAYS = 60;

/** The most dates the band carries before it stops being readable as dates. */
export const AHEAD_MAX = 5;

/** How many months ahead a saved place's season is worth mentioning. */
export const SEASON_MONTHS = 6;

/**
 * The nearest trip that is further out than the two-week window, with the number
 * of days to it. Null when a trip is happening today or leaving soon, because
 * those already lead the screen with more to say than a countdown.
 *
 * Drafts, cancelled trips, archived trips and anything over are left out, on the
 * same rules the near window uses.
 */
export function nextAhead(trips = [], today) {
  let best = null;
  for (const trip of trips) {
    if (!trip || isDraftTrip(trip) || isArchivedTrip(trip) || trip.archived_at)
      continue;
    if (["cancelled", "canceled"].includes(trip.status)) continue;
    if (isCurrentTrip(trip, today)) return null;
    if (isPastTrip(trip, today)) continue;
    const days = daysBetween(today, trip.start_date);
    if (days === null || days <= SOON_DAYS) {
      // A trip inside the near window is the near window's business.
      if (days !== null && days > 0) return null;
      continue;
    }
    if (!best || days < best.days) best = { trip, days };
  }
  return best;
}

/** A countdown said the way a family says it, on the plate's own chip. */
export function countdownSaid(days) {
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 14) return `In ${days} days`;
  const weeks = Math.round(days / 7);
  return `In ${days} days · about ${weeks} weeks`;
}

/**
 * The dates that will not wait, soonest first.
 *
 * Callers hand over rows already said in their own words -- a fare knows how to
 * title itself, a task carries the sentence somebody typed -- and this decides
 * which of them are close enough to print, in what order, and how many. Undated
 * rows are dropped rather than floated to the bottom: a band whose promise is
 * dates cannot carry a line with no date on it.
 *
 * @param {Array} rows  {id, on, title, why?, scope?, href?}
 * @param {string} today YYYY-MM-DD in the household's zone
 */
export function aheadDates(rows = [], today, days = AHEAD_DAYS) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row?.on || !row.title) continue;
    const left = daysBetween(today, row.on);
    if (left === null || left < 0 || left > days) continue;
    const key = row.id ?? `${row.on}:${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...row, id: key, days: left });
  }
  out.sort(
    (a, b) => a.on.localeCompare(b.on) || String(a.id).localeCompare(String(b.id)),
  );
  return out.slice(0, AHEAD_MAX);
}

/** The month a date is in, 1 to 12. Null when the date is unusable. */
function monthOf(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}/.test(date)) return null;
  const month = Number(date.slice(5, 7));
  return month >= 1 && month <= 12 ? month : null;
}

/**
 * Saved places whose season is in view, soonest first.
 *
 * A place with no months ticked is left out. That is not a gap to fill with a
 * guess -- it means nobody has said when it is worth going, and inventing a
 * window would put a date on the screen the family never agreed to.
 *
 * @returns {Array} {place, month, monthName, inMonths, months}
 */
export function seasonAhead(places = [], today, ahead = SEASON_MONTHS) {
  const now = monthOf(today);
  if (!now) return [];
  const out = [];
  for (const place of places) {
    if (!place || place.status === "done" || place.status === "dropped") continue;
    const months = cleanMonths(place.months);
    if (!months.length || months.length === 12) continue;
    let soonest = null;
    for (let step = 0; step <= ahead; step += 1) {
      const month = ((now - 1 + step) % 12) + 1;
      if (months.includes(month)) {
        soonest = { month, inMonths: step };
        break;
      }
    }
    if (!soonest) continue;
    out.push({
      place,
      month: soonest.month,
      monthName: MONTHS_FULL[soonest.month - 1],
      inMonths: soonest.inMonths,
      months,
    });
  }
  out.sort(
    (a, b) =>
      a.inMonths - b.inMonths ||
      String(a.place.place || "").localeCompare(String(b.place.place || "")),
  );
  return out;
}

/**
 * Why this saved place, and not another one, is on the home screen.
 *
 * The card used to print the family's own note when the place had one. That note
 * says why they want to go, which is not the question a card appearing
 * unprompted raises -- the question is why now, and the answer is always the
 * season they themselves ticked. So the season is said every time, the note is
 * kept underneath it, and when there is more than one place in view the card
 * also says that nothing on the list comes round sooner.
 */
export function seasonReason(season, total = 1) {
  if (!season) return "";
  const ticked =
    season.months.length > 1 ? ` \u2014 you ticked ${monthsSaid(season.months)}` : "";
  const when =
    season.inMonths === 0
      ? `Its season is on now, through ${season.monthName}${ticked}`
      : season.inMonths === 1
        ? `Its season opens next month, in ${season.monthName}${ticked}`
        : `Its season opens in ${season.monthName}, ${season.inMonths} months off${ticked}`;
  const only =
    total > 1 ? ", and nothing else on your bucket list comes round sooner" : "";
  return `${when}${only}.`;
}
