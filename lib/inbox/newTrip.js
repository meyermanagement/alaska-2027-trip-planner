// A forwarded confirmation whose dates fall outside every trip the family has.
//
// lib/inbox/matcher.js already recognises this case -- it is the
// "no trip covers the dates" refusal -- and leaves the message pending so a
// person can file it. The gap this module closes is what that person could do
// about it: until now the file-it picker only offered trips that already
// existed, so a cruise booked for a week nobody had entered yet had nowhere to
// go. These helpers answer two questions, both pure so the screen, the header
// and the API can never disagree:
//
//   needsTrip()      -- is this message about a trip the family does not have?
//   tripFromItems()  -- what trip would we make from it?
//
// Deliberately looser than the auto-file matcher in one way and stricter in
// another. Looser: an undated row (a parser that could not read a check-in
// time) does not disqualify the message, because the dated rows still say
// which week this is about. Stricter: nothing is offered unless a date is in
// the future, so a stale forward of last year's holiday does not invite the
// family to create a trip they have already taken.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Earliest and latest date across the parsed rows, or null when undated. */
export function datedSpan(items) {
  const dates = (items || [])
    .flatMap((r) => [r?.item_date, r?.end_date])
    .filter((d) => typeof d === "string" && ISO.test(d));
  if (dates.length === 0) return null;
  return {
    start: dates.reduce((a, b) => (a < b ? a : b)),
    end: dates.reduce((a, b) => (a > b ? a : b)),
  };
}

/** Does any dated trip's window contain the whole span? */
export function tripCovers(trips, span) {
  if (!span) return false;
  return (trips || []).some(
    (t) =>
      typeof t?.start_date === "string" &&
      typeof t?.end_date === "string" &&
      t.start_date <= span.start &&
      t.end_date >= span.end,
  );
}

/**
 * The span a message is about when that span belongs to no trip yet, else null.
 *
 * @param {{ items: any[], trips: any[], todayISO: string }} args
 */
export function needsTrip({ items, trips, todayISO }) {
  const span = datedSpan(items);
  if (!span) return null;
  // A confirmation for dates that have already passed is far more likely to be
  // a stale forward than a trip to create.
  if (todayISO && span.end < todayISO) return null;
  if (tripCovers(trips, span)) return null;
  return span;
}

/** Which message ids are about a trip the family does not have. */
export function messagesNeedingTrip({ messages, items, trips, todayISO }) {
  const byMessage = new Map();
  for (const row of items || []) {
    const list = byMessage.get(row.message_id) || [];
    list.push(row);
    byMessage.set(row.message_id, list);
  }
  const out = new Map();
  for (const message of messages || []) {
    const span = needsTrip({
      items: byMessage.get(message.id) || [],
      trips,
      todayISO,
    });
    if (span) out.set(message.id, span);
  }
  return out;
}

// What the trip is called. A booking confirmation is usually specific about
// one thing -- the ship, the hotel, the resort -- and vague about everything
// else, so the name comes from the most trip-shaped row in the parse rather
// than from the email's subject line, which is mostly the sender's marketing.
const NAME_ORDER = ["cruise", "lodging", "excursion", "activity", "flight"];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthYear(iso) {
  const [y, m] = String(iso).split("-");
  const name = MONTHS[Number(m) - 1];
  return name ? `${name} ${y}` : y;
}

/**
 * The trip row to insert for a message whose dates match nothing.
 *
 * `status: "planning"` rather than draft: a confirmation in hand is a trip the
 * family has decided to take, which is exactly what planning means here. The
 * name is theirs to change on Trip details afterwards, which is why nothing
 * tries to be clever beyond naming the thing that was booked and when.
 *
 * @param {{ items: any[], span: {start: string, end: string} }} args
 * @returns {{ name: string, destination: string|null, start_date: string, end_date: string, status: string }|null}
 */
export function tripFromItems({ items, span }) {
  if (!span) return null;
  const rows = (items || []).filter((r) => r && (r.title || r.location));
  let lead = null;
  for (const category of NAME_ORDER) {
    lead = rows.find((r) => r.category === category) || null;
    if (lead) break;
  }
  if (!lead) lead = rows[0] || null;

  const subject = (lead?.title || lead?.location || "").trim();
  const place = (lead?.location || "").trim();
  const when = monthYear(span.start);
  const name = subject ? `${subject}, ${when}` : `Trip, ${when}`;

  return {
    name: name.slice(0, 120),
    destination: place || null,
    start_date: span.start,
    end_date: span.end,
    status: "planning",
  };
}
