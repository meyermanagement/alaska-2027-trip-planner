// Whether a booking task on the list is already about a given itinerary item.
//
// A task made from the itinerary carries that item's id, which is the only
// reliable answer and the one the Itinerary tab checks first. The trouble is the
// tasks nobody made from the itinerary: the seven booking tasks on the Alaska
// trip were typed by hand in August, carry no link to anything, and so were
// invisible to the control that offers to make tasks for everything still
// unbooked. It filed a second set of all seven beside them, and the morning
// email dutifully read out both.
//
// So a second, weaker test: does an existing title mean the same errand as this
// item. Weaker because titles are written by people -- "Pick up rental car" on
// the itinerary against "Book the August 5-8 rental car" on the list -- and
// because getting it wrong in the generous direction is worse than getting it
// wrong in the shy direction. A missed match costs one duplicate the family can
// delete. A false match silently swallows a booking nobody is tracking, which is
// how a flight goes unbooked.
//
// Hence the shape of it. Titles are reduced to the words that carry meaning:
// dates, months, weekdays, numbers and the vocabulary of booking itself all come
// out, because every one of them is noise here. What is left has to overlap
// substantially in both directions. And any word that was capitalized in either
// title -- a place, an airline, a park -- has to appear on the other side too,
// which is the rule that keeps an outbound flight from matching its own return.

const GENERIC = new Set([
  "a",
  "an",
  "and",
  "arrange",
  "at",
  "book",
  "booked",
  "booking",
  "bookings",
  "buy",
  "confirm",
  "day",
  "days",
  "drop",
  "for",
  "from",
  "get",
  "in",
  "my",
  "need",
  "needed",
  "needs",
  "night",
  "nights",
  "not",
  "of",
  "off",
  "on",
  "or",
  "our",
  "pick",
  "purchase",
  "reservation",
  "reservations",
  "reserve",
  "sort",
  "that",
  "the",
  "this",
  "ticket",
  "tickets",
  "time",
  "times",
  "to",
  "trip",
  "up",
  "with",
  "yet",
]);

// Words the two sides are likely to disagree about while meaning the same thing.
// Deliberately short: a synonym list is a place false matches come from, so it
// covers only the pairs seen on the family's own trips.
const SYNONYMS = new Map(
  Object.entries({
    accommodation: "stay",
    accommodations: "stay",
    air: "flight",
    airbnb: "stay",
    airfare: "flight",
    apartment: "stay",
    flights: "flight",
    fly: "flight",
    flying: "flight",
    hotel: "stay",
    hotels: "stay",
    inn: "stay",
    lodge: "stay",
    lodging: "stay",
    motel: "stay",
    resort: "stay",
    room: "stay",
    rooms: "stay",
    stays: "stay",
    vrbo: "stay",
  }),
);

const MONTHS =
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(uary|ruary|ch|il|e|y|ust|ember|ober|ober)?$/i;
const WEEKDAYS =
  /^(mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday)?$/i;

function words(title) {
  return (
    String(title || "")
      // "Flights to Curacao - not booked" and "(not booked)" are itinerary
      // bookkeeping, not part of the errand.
      .replace(/[\s—–-]*\(?not\s+booked\)?\.?\s*$/i, "")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
  );
}

function meaningful(word) {
  const lower = word.toLowerCase();
  if (lower.length < 3) return null;
  if (/\d/.test(lower)) return null;
  if (MONTHS.test(lower)) return null;
  if (WEEKDAYS.test(lower)) return null;
  if (GENERIC.has(lower)) return null;
  return SYNONYMS.get(lower) || lower;
}

/** The words of a title that say what the errand is, normalized. */
export function bookingTokens(title) {
  const set = new Set();
  for (const word of words(title)) {
    const token = meaningful(word);
    if (token) set.add(token);
  }
  return set;
}

/**
 * The meaningful words that were capitalized — places, parks, airlines. Names
 * both sides have to agree about.
 */
function properTokens(title) {
  const set = new Set();
  for (const word of words(title)) {
    if (
      word[0] !== word[0].toUpperCase() ||
      word[0] === word[0].toLowerCase()
    ) {
      continue;
    }
    const token = meaningful(word);
    if (token) set.add(token);
  }
  return set;
}

function missingFrom(names, tokens) {
  for (const name of names) if (!tokens.has(name)) return true;
  return false;
}

/**
 * Does this task title mean the same booking as this itinerary item's title.
 *
 * @param itemTitle  the itinerary item, e.g. "Pick up rental car"
 * @param taskTitle  a task already on the list, e.g. "Book the August 5-8 rental car"
 */
export function sameBooking(itemTitle, taskTitle) {
  const item = bookingTokens(itemTitle);
  const task = bookingTokens(taskTitle);
  if (item.size < 2 || task.size < 2) return false;

  // A name on one side and absent from the other means these are two different
  // things that happen to share a word: Vancouver against Anchorage, Denali
  // against an Airbnb.
  if (missingFrom(properTokens(itemTitle), task)) return false;
  if (missingFrom(properTokens(taskTitle), item)) return false;

  let shared = 0;
  for (const token of item) if (task.has(token)) shared += 1;
  if (shared < 2) return false;
  return shared / Math.min(item.size, task.size) >= 0.6;
}

/**
 * The task already covering this item, if one is.
 *
 * Linked tasks are the answer whenever they exist. Only when nothing is linked
 * does it fall back to reading titles.
 *
 * @param item   an itinerary row, {id, title}
 * @param tasks  every task on the trip, finished ones included
 */
export function taskCovering(item, tasks = []) {
  const linked = (tasks || []).find((t) => t?.itinerary_item_id === item?.id);
  if (linked) return linked;
  return (
    (tasks || []).find(
      (t) => !t?.itinerary_item_id && sameBooking(item?.title, t?.title),
    ) || null
  );
}
