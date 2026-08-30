/**
 * The one order an itinerary is read in.
 *
 * Every screen used to ask the database for `item_date, sort_order` and print
 * whatever came back. That works right up to the moment two things on one day
 * carry the same sort_order -- and then the order is whatever Postgres happens to
 * hand over, which is physical row order, which is the order they were written.
 * The first day in Des Moines is a 10am drive and a 3pm hotel check-in, both
 * sort_order 0, and the hotel was written first, so the day read backwards.
 *
 * The deeper problem is that sort_order is a number the assistant invents and the
 * clock is a fact the family knows. The two can disagree outright: adding
 * something by hand stamps it 99, so a 4pm car pickup typed in after the fact sat
 * below a 7pm dinner. Whenever they disagree, the clock is right.
 *
 * So: untimed things first, because an all-day thing frames the day it belongs to
 * -- the horse show, the hotel nobody gave a check-in time for -- and then
 * everything with a time, in time order. sort_order still breaks ties among
 * things the clock cannot separate, and the title breaks ties after that, so the
 * order is the same on every screen and on every load rather than depending on
 * which row was written first.
 *
 * Pure and total: no clock, no database, and a row missing any of these fields
 * still lands somewhere predictable instead of throwing.
 */

/** A date that sorts, with missing dates last rather than first. */
function dateKey(item) {
  const d = String(item?.item_date || "").trim();
  return d || "9999-12-31";
}

/**
 * A time that sorts as a string, and "" for no time at all.
 *
 * Padded because "9:00" and "09:00:00" both turn up: the database stores the long
 * form, the forms on the screen send the short one, and comparing them as written
 * puts nine in the morning after ten at night.
 */
function timeKey(item) {
  const t = String(item?.start_time || "").trim();
  if (!t) return "";
  return t
    .split(":")
    .map((part) => part.padStart(2, "0"))
    .join(":")
    .padEnd(8, "0");
}

/**
 * The family's own arrangement, when there is one.
 *
 * Anything that is not a number sorts last rather than becoming zero -- the trap
 * being that Number(null) is 0, which would push a row nobody ordered to the
 * front of the ones somebody did.
 */
function orderKey(item) {
  const n = Number(item?.sort_order);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Which of two itinerary rows is read first. */
export function compareItems(a, b) {
  const da = dateKey(a);
  const db = dateKey(b);
  if (da !== db) return da < db ? -1 : 1;

  const ta = timeKey(a);
  const tb = timeKey(b);
  if (ta !== tb) return ta < tb ? -1 : 1;

  const sa = orderKey(a);
  const sb = orderKey(b);
  if (sa !== sb) return sa - sb;

  const na = String(a?.title || "");
  const nb = String(b?.title || "");
  if (na !== nb) return na.localeCompare(nb);

  // Last resort, so two rows that are alike in every readable way still come out
  // in the same order every time rather than in whatever order they were stored.
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

/** The same rows, in reading order. Never sorts the caller's array in place. */
export function sortItinerary(items = []) {
  return [...(items || [])].sort(compareItems);
}
