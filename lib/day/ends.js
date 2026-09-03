/**
 * Both ends of a travel day.
 *
 * The band above a day showed one forecast: the first located thing on the
 * itinerary, which is where the family wakes up. On an ordinary day that is the
 * whole truth. On the day they fly Anchorage to Juneau, or drive out of Denali,
 * it is the weather they are leaving -- and the reader is packing for the place
 * they are arriving at. Same numbers, wrong town, and nothing on the screen said
 * which town it was.
 *
 * So a day that ends somewhere meaningfully different reports both, each named.
 * "Meaningfully" is the whole design decision here: two hotels in one city share
 * an afternoon and printing them twice is noise, while sixty kilometres apart is
 * two different skies. The threshold is deliberately generous -- being quiet on a
 * day that only half-moves is better than crying travel day over a long lunch.
 *
 * Pure: itinerary rows and already-clustered points in, indices and labels out.
 * No fetching, no clock. The route does the asking.
 */

import { sameAddress } from "@/lib/places/home";

/** Kilometres between two points. Local for the same reason it is in forecast.js. */
function kmApart(a, b) {
  const R = 6371;
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * What to call a place on the band.
 *
 * The family's own words, not a reverse geocode: they wrote "Denali Bluffs Hotel"
 * and that is what they will recognize at a glance. A location with commas is cut
 * at the first one, because "Ted Stevens International, Anchorage, AK 99502" in a
 * weather line is an address where a name belongs. Falls back to the title, which
 * is how "Fly to Juneau" ends up naming its own leg.
 */
export function placeLabel(item, home = "") {
  // The house is called Home. It is the one place on any itinerary the family does
  // not need the street name of, and "908 Windsor Ct" in a weather line is an
  // address where a word belongs.
  if (home && sameAddress(home, item?.location)) return "Home";
  const loc = String(item?.location || "").trim();
  const title = String(item?.title || "").trim();
  const base = loc || title;
  if (!base) return null;
  const first = base.split(",")[0].trim();
  return (first || base).slice(0, 40);
}

/**
 * The two ends of a day, or null when the day stays put.
 *
 * @param items itinerary rows in the order they happen
 * @param sky   the {points, byItem} clustering the forecast was fetched for
 * @returns {{startIndex, endIndex, startLabel, endLabel}|null}
 */
export function dayEnds(
  items = [],
  sky = null,
  { farKm = 60, home = "" } = {},
) {
  const points = sky?.points || [];
  const byItem = sky?.byItem;
  if (!byItem || points.length < 2) return null;

  // The first and last things on the day that we actually have a point for.
  // Anything in between is where they stopped for lunch; the ends are the story.
  let first = null;
  let last = null;
  for (const item of items) {
    const at = byItem.get(item?.id);
    if (at === undefined) continue;
    if (first === null) first = { at, item };
    last = { at, item };
  }
  if (!first || !last || first.at === last.at) return null;

  const a = points[first.at];
  const b = points[last.at];
  if (!a || !b) return null;
  if (kmApart(a, b) < farKm) return null;

  const startLabel = placeLabel(first.item, home);
  const endLabel = placeLabel(last.item, home);
  // Two identical labels tell the reader nothing about which is which, so the
  // day is reported as one place rather than as a riddle. This happens when both
  // ends are "Airport" or the family typed the trip name into both rows.
  if (!startLabel || !endLabel) return null;
  if (startLabel.toLowerCase() === endLabel.toLowerCase()) return null;

  return {
    startIndex: first.at,
    endIndex: last.at,
    startLabel,
    endLabel,
  };
}
