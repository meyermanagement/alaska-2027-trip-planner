// A place whose last look came back empty, and nothing about it has changed.
//
// Most tip looks answer {"tips":[]}. Measured on the ledger, 51 of 63 tips.write
// calls returned nine tokens after reading 7-10 thousand and thinking for up to
// two thousand more, and a trip look asks five places at once, so a button
// pressed twice in a week paid for ten of those. The model's answer depends on
// the brief it is sent, so an empty answer to the same brief is worth reusing:
// the place is skipped until something in the brief changes, the week runs out,
// or the trip is close enough that the web may say something new by tomorrow.
//
// What counts as "the same" is the whole brief minus its first line, which is
// the date. Anything else in it that moves with the date moves the key too,
// which only ever means asking when it might not have been needed -- never
// skipping a place whose brief is different.
//
// Stored per trip in trip_facts.empty_looks, keyed by place, written through
// note_empty_look() so four places answering at once cannot overwrite each other.
// Until that column exists the read finds nothing and every place is asked, as
// before.

import { createHash } from "node:crypto";
import { tipBrief } from "./brief";

/** How long an empty answer stands, when the trip is not close. */
export const EMPTY_LOOK_DAYS = 7;
/** Within this many days of the start, an empty answer stands for today only. */
export const CLOSE_DAYS = 14;

/** The place a look is aimed at, as a key. */
export function lookPlace(scope, itemId) {
  return scope === "item" ? `item:${itemId}` : String(scope || "trip");
}

/** A short fingerprint of everything the model reads except today's date. */
export function lookKey(brief) {
  const text = tipBrief(brief).split("\n").slice(1).join("\n");
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

const DAY = 86400000;
const dayNumber = (iso) => {
  const at = Date.parse(`${String(iso || "").slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(at) ? Math.floor(at / DAY) : null;
};

/**
 * Should this look skip the model?
 *
 * @param {object} input
 * @param {object|null} input.looks   trip_facts.empty_looks
 * @param {string} input.place        lookPlace(scope, itemId)
 * @param {string} input.key          lookKey(brief)
 * @param {string} input.today        YYYY-MM-DD
 * @param {string|null} input.tripStart
 * @returns {boolean}
 */
export function skipLook({ looks, place, key, today, tripStart = null }) {
  const last = looks && typeof looks === "object" ? looks[place] : null;
  if (!last || last.key !== key) return false;
  const on = dayNumber(last.on);
  const now = dayNumber(today);
  if (on == null || now == null || on > now) return false;
  const start = dayNumber(tripStart);
  if (start != null && start - now <= CLOSE_DAYS) return on === now;
  return now - on < EMPTY_LOOK_DAYS;
}

/**
 * What to remember after the model answered: the key when nothing was kept,
 * and nothing (clearing it) when something was.
 */
export function emptyLookEntry({ kept, key, today }) {
  return kept > 0 ? null : { key, on: today };
}
