/**
 * When a place on an itinerary is ready to be reviewed, and which row the review
 * belongs on.
 *
 * The rule used to be "the whole trip is over," which is why reviews only ever
 * appeared on the Preferences & Reviews tab. That is the wrong moment twice over:
 * a sixteen-day trip means waiting two weeks to say anything about the second
 * night's dinner, and by then the detail worth writing down is gone. What people
 * actually want to do is say it on the walk back.
 *
 * So the unit is the item, not the trip. This module is the only place that
 * decides, because the itinerary screen, the Preferences tab and the assistant all
 * have to agree about it -- three screens quietly disagreeing about whether dinner
 * has happened is worse than any one of them being wrong.
 */

/**
 * The four kinds of thing that are a place you can have an opinion about. A flight
 * or a car transfer is not.
 *
 * Also the filter the Preferences tab reads with. Anything outside this list would
 * accept a review and then never show it anywhere -- a write into a hole -- so the
 * button is only ever offered for these.
 */
export const REVIEWABLE_CATEGORIES = [
  "lodging",
  "dining",
  "excursion",
  "activity",
];

/** Is this the kind of thing worth an opinion? */
export function isReviewable(item) {
  return REVIEWABLE_CATEGORIES.includes(item?.category);
}

/**
 * Has this actually happened?
 *
 * @param item an itinerary row
 * @param today YYYY-MM-DD, the day being lived — the device's day when the family
 *   is away and it is one of the trip's days, otherwise home's. Worked out by the
 *   caller, because only the itinerary screen knows the trip's day keys.
 * @param nowHM "HH:MM" on the device, or null before the browser is awake. Null
 *   means today's timed items are not counted as done yet, which is what keeps the
 *   server's first frame and the browser's first frame identical.
 *
 * Four deliberate refusals:
 *
 * - A cancelled item never happened, whatever its date says.
 * - An undated item has no moment to have passed.
 * - A stay used to be treated as over at checkout rather than at check-in, on the
 *   argument that the end date is the honest answer to "has this passed". It is,
 *   and it was still the wrong rule. A hotel is judged in the first ten minutes:
 *   the room, the noise, the smell of the corridor. Making the family wait until
 *   the morning they are dragging cases to a taxi -- three nights after they
 *   formed the opinion, and on the one day nobody is looking at the app -- is how
 *   the opinion never gets written down. A stay now passes the same way anything
 *   else does, on its own date and time, so a hotel can be rated from the lobby
 *   like everything else on the day.
 * - An untimed item on today waits for tomorrow. With no start time recorded the
 *   event is the whole day, and the whole day has not passed. Guessing an hour
 *   would invent a fact about somebody's dinner.
 */
export function hasHappened(item, { today, nowHM = null } = {}) {
  if (!item || !today) return false;
  if (item.status === "cancelled") return false;

  const start = item.item_date;
  if (!start) return false;

  if (start < today) return true;
  if (start > today) return false;

  // Today. Only a recorded time can say the moment has gone by.
  const time = String(item.start_time || "").slice(0, 5);
  if (!time || !nowHM) return false;
  return time <= nowHM;
}

/** Reviewable kind, and it has happened. */
export function canReviewNow(item, when) {
  return isReviewable(item) && hasHappened(item, when);
}

/** trip + name, lowercased: what makes two rows the same place. */
function placeKey(item) {
  return `${item?.trip_id}|${String(item?.title || "")
    .trim()
    .toLowerCase()}`;
}

/**
 * Which row a review about this place should be written to.
 *
 * A hotel is sometimes one row with an end date and sometimes one row per night,
 * depending on who typed it in. The Preferences tab collapses those into one card,
 * so a review written against the wrong night would be saved successfully and then
 * be invisible on the page built to show it.
 *
 * The answer is the latest-dated row for the place, matching the card the
 * Preferences tab shows, with any row that already carries an opinion winning
 * outright -- editing a note has to find the note it is editing rather than start a
 * second one on a different night.
 *
 * @param item the row the person pressed
 * @param items every row on the trip
 * @returns the row to read from and write to; the item itself if it stands alone
 */
export function reviewTarget(item, items = []) {
  if (!item) return null;
  const key = placeKey(item);
  const group = (items || []).filter((i) => placeKey(i) === key);
  if (group.length < 2) return item;

  const scored = group.slice().sort((a, b) => {
    const aHas = a.rating || String(a.review || "").trim() ? 1 : 0;
    const bHas = b.rating || String(b.review || "").trim() ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    const byDate = String(b.item_date || "").localeCompare(
      String(a.item_date || ""),
    );
    if (byDate !== 0) return byDate;
    // Only to make the answer the same on every render.
    return String(a.id).localeCompare(String(b.id));
  });
  return scored[0];
}
