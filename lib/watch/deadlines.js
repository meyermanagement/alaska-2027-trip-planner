// Which deadlines are close enough to interrupt somebody about.
//
// Pure on purpose, like the morning run's rules and the fare verdicts: turning
// "here are some rows and here is today's date" into "this one is worth a
// notification and that one is not" is the part that decides whether the app is
// useful or is a nuisance, and it is the part worth reading on its own.
//
// The whole file turns on one judgement. An alert has to be about something that
// is running out, that the family can still act on, and that they have not already
// been told. Everything else -- a fare with three weeks left, a trip that is
// months away, a task with no date -- belongs in the morning email, which people
// read when they choose to. A notification is a tap on the shoulder, and the way
// to keep people reading them is to earn every one.
//
// Two stages, never more. One warning when the deadline comes into view, and one
// on the last day. A deadline that moves produces its own alerts, because the
// ledger keys on the date as well as the stage: an offer extended by a week is
// genuinely news again.

import { formatDay } from "@/lib/format";

// How many days out a deadline first becomes worth saying out loud. Three is a
// weekend plus a working day: long enough to do something about a fare, short
// enough that the message is not filed away and forgotten.
export const SOON_DAYS = 3;

export const SOON = "soon";
export const LAST_CALL = "last_call";

export const FARE = "fare";
export const OFFER = "offer";

/**
 * Every deadline in view, in the order it lands.
 *
 * @param {object} input
 * @param {Array} [input.deals]   flight_deals rows, any status
 * @param {Array} [input.offers]  card_offers rows, any status
 * @param {string} input.today    YYYY-MM-DD in the household's zone
 * @param {string} [input.siteUrl] used to build the link the notification opens
 * @returns {{alerts: Array, expired: Array}}
 *   alerts: {kind, id, stage, deadlineOn, daysLeft, title, body, path, familyId}
 *   expired: fare ids whose book-by date has passed and are still marked open
 */
export function deadlinesInView({
  deals = [],
  offers = [],
  today,
  siteUrl = "",
} = {}) {
  const alerts = [];
  const expired = [];

  for (const deal of deals || []) {
    if (!deal || deal.status !== "open" || !deal.book_by) continue;
    const left = daysUntil(deal.book_by, today);
    if (left === null) continue;
    if (left < 0) {
      // A date worked out from the sender's own guess -- "this will last less
      // than a day" -- is not grounds for retiring the fare. It might well be
      // gone, and it might not, and the card already says which of those this
      // is. Retiring it here would use a number nobody wrote down to delete a
      // price the family can still check.
      if (deal.book_by_inferred) continue;
      // Nobody is told about this. The fare is simply retired so the open list
      // stops presenting a dead price as something to act on.
      expired.push(deal.id);
      continue;
    }
    const stage = stageFor(left);
    if (!stage) continue;
    alerts.push({
      kind: FARE,
      id: deal.id,
      familyId: deal.family_id,
      stage,
      deadlineOn: deal.book_by,
      daysLeft: left,
      title: fareTitle(deal, left),
      body: fareBody(deal, left),
      path: "/someday",
      url: link(siteUrl, "/someday"),
    });
  }

  for (const offer of offers || []) {
    if (!offer || offer.status !== "open" || !offer.offer_ends_on) continue;
    const left = daysUntil(offer.offer_ends_on, today);
    if (left === null || left < 0) continue;
    const stage = stageFor(left);
    if (!stage) continue;
    alerts.push({
      kind: OFFER,
      id: offer.id,
      familyId: offer.family_id,
      stage,
      deadlineOn: offer.offer_ends_on,
      daysLeft: left,
      title: offerTitle(offer, left),
      body: offerBody(offer, left),
      path: "/wallet",
      url: link(siteUrl, "/wallet"),
    });
  }

  alerts.sort((a, b) => a.daysLeft - b.daysLeft);
  return { alerts, expired };
}

/**
 * Whole days from today to a date, or null if the date cannot be read. Both sides
 * are plain YYYY-MM-DD, so this is calendar arithmetic and not a clock: a fare due
 * tomorrow is one day away at any hour of today.
 */
export function daysUntil(deadline, today) {
  const a = Date.parse(`${String(deadline).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(today).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function stageFor(daysLeft) {
  if (daysLeft === 0) return LAST_CALL;
  if (daysLeft > 0 && daysLeft <= SOON_DAYS) return SOON;
  return null;
}

function fareTitle(deal, left) {
  const where = deal.destination || deal.destination_code || "somewhere";
  if (deal.book_by_inferred)
    return `${money(deal.price)} to ${where} may be running out`;
  if (left === 0) return `Last day for ${money(deal.price)} to ${where}`;
  return `${countdown(left)} on ${money(deal.price)} to ${where}`;
}

function fareBody(deal, left) {
  const bits = [
    `${deal.origin} to ${deal.destination}, ${money(deal.price)} each`,
  ];
  if (deal.seats) bits.push(`${deal.seats} seats left at that price`);
  const day = formatDay(deal.book_by) || deal.book_by;
  // Said as the sender's expectation when that is all it is, so a tap on the
  // shoulder never invents a deadline on the family's behalf.
  if (deal.book_by_inferred) {
    const who = deal.source_name || "The sender";
    const said = deal.deadline_said
      ? ` They wrote: "${deal.deadline_said}".`
      : "";
    return `${bits.join(". ")}. ${who} expected it gone ${left === 0 ? "by today" : `by ${day}`}; no booking date was written.${said}`;
  }
  const when =
    left === 0 ? "has to be booked today" : `has to be booked by ${day}`;
  const from = deal.source_name ? ` Found on ${deal.source_name}.` : "";
  return `${bits.join(". ")}. It ${when}.${from}`;
}

function offerTitle(offer, left) {
  const card = offer.card_name || offer.issuer || "the card offer";
  if (left === 0) return `Last day to apply for ${card}`;
  return `${countdown(left)} to apply for ${card}`;
}

function offerBody(offer, left) {
  const bits = [];
  if (offer.bonus_text) bits.push(offer.bonus_text);
  if (offer.min_spend)
    bits.push(
      `after ${money(offer.min_spend)}${
        offer.spend_window_days ? ` in ${offer.spend_window_days} days` : ""
      }`,
    );
  const when =
    left === 0
      ? "The offer ends today"
      : `The offer ends ${formatDay(offer.offer_ends_on) || offer.offer_ends_on}`;
  const head = bits.length ? `${bits.join(" ")}. ` : "";
  return `${head}${when}. Nothing has been applied for; this is the family's own record of it.`;
}

function countdown(left) {
  if (left === 1) return "One day left";
  return `${left} days left`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function link(siteUrl, path) {
  const base = String(siteUrl || "").replace(/\/+$/, "");
  return base ? `${base}${path}` : path;
}
