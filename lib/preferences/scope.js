// Whose preference it is, and whether it has any business shaping a given trip.
//
// A preference belongs to nobody in particular, to one person, or to several.
// Nobody means the family, and that is what Shared is.
//
// It used to be nobody or exactly one, and "Mark & Steph, not Veda" had nowhere
// to go, so it went in as Shared. That did real damage, because Shared means
// "true on every trip": "we prefer a suite so Veda has her own bed" was being
// read on a trip Veda was not on, where it says a child is in the room and
// quietly rules out every adults-only hotel. The preference was right, the
// filing was wrong, and the family had no way to file it correctly. Hence a list
// of owners, and a trip is shaped by a preference when ANY of its owners is on
// the roster.
//
// The second half of this file is the part that changes what Aly says. Veda will
// not eat seafood is a fact about Veda, and on a trip Veda is not on it is not a
// fact about anything: it narrows a restaurant list for nobody. So a trip carries
// the family's shared preferences plus the preferences of the people actually on
// its roster, and the ones left out are counted rather than silently dropped, so
// a screen can say what it set aside.
//
// One deliberate exception: a trip with an empty roster is a trip nobody has been
// added to yet, not a trip nobody is going on. Filtering there would quietly
// throw away every personal preference the family has, so an empty roster filters
// nothing.

import { SHARED } from "../people";

/** How a preference with no owner is spelled, everywhere. */
export const SHARED_LABEL = SHARED;

const idOf = (value) => {
  const text = String(value || "").trim();
  return text || null;
};

/**
 * Everyone a preference belongs to, as ids. Empty means Shared.
 *
 * Reads the list, and falls back to the single owner for any row written before
 * there was a list — and for any code path still writing the old column, which
 * is why the fallback stays rather than being migrated away.
 */
export function ownerIds(pref) {
  const many = Array.isArray(pref?.traveler_ids) ? pref.traveler_ids : [];
  const out = [];
  for (const value of many) {
    const id = idOf(value);
    if (id && !out.includes(id)) out.push(id);
  }
  if (out.length) return out;
  const one = idOf(pref?.traveler_id);
  return one ? [one] : [];
}

/** Whether this preference is one of the family's, belonging to nobody in particular. */
export function isShared(pref) {
  return ownerIds(pref).length === 0;
}

/** Whether a particular person is one of its owners. */
export function ownedBy(pref, travelerId) {
  const wanted = idOf(travelerId);
  return wanted ? ownerIds(pref).includes(wanted) : isShared(pref);
}

/**
 * The names to show beside a preference, in roster order.
 *
 * An owner who has since been deleted drops out rather than showing as a blank.
 * A preference all of whose owners have been deleted has nobody left to file it
 * under, and it is still true of the family, so it reads as Shared.
 */
export function whoseNames(pref, travelers = []) {
  const owners = ownerIds(pref);
  if (!owners.length) return [];
  const out = [];
  for (const t of travelers || []) {
    const id = idOf(t?.id);
    if (!id || !owners.includes(id)) continue;
    const name = String(t.name || "").trim();
    if (name) out.push(name);
  }
  return out;
}

/**
 * The one line to print for whose it is: "Steph", "Mark & Steph", or "Shared".
 *
 * Ampersands rather than commas, because this is a label on a chip and not a
 * sentence, and everyone whose preference it is should be readable at a glance.
 */
export function whoseName(pref, travelers = []) {
  const names = whoseNames(pref, travelers);
  if (!names.length) return SHARED_LABEL;
  return names.join(" & ");
}

/**
 * Every traveler id on a trip's roster.
 *
 * Takes either shape the app has: flat `{ trip_id, traveler_id }` rows read
 * across all trips, or the nested `{ travelers: { id } }` rows a single trip's
 * query returns. Pass a tripId to narrow flat rows; leave it out when the rows
 * are already about one trip.
 */
export function goingIds(rosters = [], tripId = null) {
  const out = new Set();
  for (const row of rosters || []) {
    if (!row) continue;
    if (tripId && row.trip_id && idOf(row.trip_id) !== idOf(tripId)) continue;
    const direct = idOf(row.traveler_id);
    if (direct) out.add(direct);
    const nested = idOf(row.travelers?.id);
    if (nested) out.add(nested);
  }
  return out;
}

/** Ids straight off a list of traveler rows, for the same use. */
export function idsOf(travelers = []) {
  const out = new Set();
  for (const t of travelers || []) {
    const id = idOf(t?.id);
    if (id) out.add(id);
  }
  return out;
}

/**
 * Whether this preference has anything to say about a trip these people are on.
 *
 * Shared always does. One with owners does when any of them is going — "Mark and
 * Steph prefer adults-only" is still true of a trip Mark is on without Steph —
 * and, see the note at the top, when nobody has been added to the trip at all.
 */
export function appliesToTrip(pref, going) {
  const owners = ownerIds(pref);
  if (!owners.length) return true;
  const set = going instanceof Set ? going : new Set(going || []);
  if (set.size === 0) return true;
  return owners.some((id) => set.has(id));
}

/** The preferences a trip should be planned with. */
export function prefsForTrip(preferences = [], going) {
  return (preferences || []).filter((p) => p && appliesToTrip(p, going));
}

/** The ones it should not, which is what a screen needs to explain itself. */
export function setAsideForTrip(preferences = [], going) {
  return (preferences || []).filter((p) => p && !appliesToTrip(p, going));
}

/**
 * A plain sentence about what a trip filter left out, or "" when it left nothing.
 * Written as a count per person, because "2 of Veda's are not being used" is the
 * fact, and naming all four of them again is noise.
 */
export function setAsideSentence(preferences = [], going, travelers = []) {
  const out = setAsideForTrip(preferences, going);
  if (!out.length) return "";
  const counts = new Map();
  for (const p of out) {
    const who = whoseName(p, travelers);
    counts.set(who, (counts.get(who) || 0) + 1);
  }
  // "1 of Mark & Steph's" is right: the pair holds it together, and splitting it
  // into one apiece would count the same preference twice.
  const bits = [...counts.entries()].map(([who, n]) => `${n} of ${who}\u2019s`);
  const list =
    bits.length === 1
      ? bits[0]
      : bits.length === 2
        ? `${bits[0]} and ${bits[1]}`
        : `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
  return `${list} ${out.length === 1 ? "is" : "are"} set aside, because they are not on this trip.`;
}

/**
 * Shared first, then each person, each with how many preferences they hold.
 * Only people who have any, plus Shared, which is always worth offering because
 * it is where a new one lands by default.
 */
export function whoseCounts(preferences = [], travelers = []) {
  const rows = [
    {
      id: "",
      name: SHARED_LABEL,
      count: (preferences || []).filter((p) => isShared(p)).length,
    },
  ];
  for (const t of travelers || []) {
    const id = idOf(t?.id);
    if (!id) continue;
    rows.push({
      id,
      name: String(t.name || "").trim() || SHARED_LABEL,
      // A preference shared by two people is counted under both, because both
      // chips are true and a person's chip should show everything of theirs.
      count: (preferences || []).filter((p) => ownerIds(p).includes(id)).length,
    });
  }
  return rows;
}
