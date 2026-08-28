// Whose preference it is, and whether it has any business shaping a given trip.
//
// A saved preference is either one person's or the family's — the same rule the
// packing list and the checklist already follow, because "Mark & Steph" is a
// value nothing can filter on. Two names is a shared thing.
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
 * The name to show beside a preference: one person, or "Shared".
 *
 * An owner who has since been deleted reads as Shared rather than as a blank —
 * the preference is still true of the family, and there is nobody left to file it
 * under.
 */
export function whoseName(pref, travelers = []) {
  const wanted = idOf(pref?.traveler_id);
  if (!wanted) return SHARED_LABEL;
  const found = (travelers || []).find((t) => idOf(t?.id) === wanted);
  const name = String(found?.name || "").trim();
  return name || SHARED_LABEL;
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
 * Shared always does. A personal one does when its owner is going, and — see the
 * note at the top — when nobody has been added to the trip at all.
 */
export function appliesToTrip(pref, going) {
  const owner = idOf(pref?.traveler_id);
  if (!owner) return true;
  const set = going instanceof Set ? going : new Set(going || []);
  if (set.size === 0) return true;
  return set.has(owner);
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
      count: (preferences || []).filter((p) => !idOf(p?.traveler_id)).length,
    },
  ];
  for (const t of travelers || []) {
    const id = idOf(t?.id);
    if (!id) continue;
    rows.push({
      id,
      name: String(t.name || "").trim() || SHARED_LABEL,
      count: (preferences || []).filter((p) => idOf(p?.traveler_id) === id)
        .length,
    });
  }
  return rows;
}
