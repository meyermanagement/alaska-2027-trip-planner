/**
 * Putting a point on each thing on the itinerary.
 *
 * Weather, distance and travel time all need coordinates, and the family types
 * addresses. Photon is free and public, which is exactly why this caches: looking
 * up the same six places on every page load is slow for the reader and rude to a
 * service that is not charging us.
 *
 * The point is stored on the item along with the string it came from. When
 * somebody corrects the address, the stored query no longer matches and the point
 * is known to be about the old one -- rather than the app silently measuring the
 * distance to a place the family is no longer going.
 */

import { fetchJson, pointFrom, searchUrl } from "@/lib/places/photon";

/**
 * What to feed the geocoder for an item.
 *
 * The location field alone is often "Crescent Harbor dock", which is ambiguous
 * anywhere but Sitka, so the destination is appended when the location does not
 * already look like a full address. The title is a last resort: hotel and
 * restaurant names geocode well, "Breakfast" does not.
 */
export function geoQuery(item, destination = "") {
  const loc = String(item?.location || "").trim();
  const title = String(item?.title || "").trim();
  const where = String(destination || "").trim();

  const base = loc || title;
  if (!base) return null;

  // Already carries a city, a postcode or a country: leave it alone.
  const looksComplete = /\d{5}|,\s*[A-Z]{2}\b|,.*,/.test(base);
  if (looksComplete || !where) return base.slice(0, 160);
  return `${base}, ${where}`.slice(0, 160);
}

/** Does the stored point still describe what the item says now? */
export function needsLocating(item, destination = "") {
  const wanted = geoQuery(item, destination);
  if (!wanted) return false;
  if (item.lat === null || item.lat === undefined) return true;
  if (item.lon === null || item.lon === undefined) return true;
  return item.geo_query !== wanted;
}

/**
 * Locate the items that need it and write the points back.
 *
 * Deliberately serial with a small cap. A day view opening should not fire twelve
 * simultaneous requests at a free geocoder, and the ones that matter -- the timed
 * items of today -- are at the front of the list. Anything past the cap keeps its
 * blank and gets picked up next time.
 *
 * @returns a Map of item id to {lat, lon}, including points already stored.
 */
export async function locateItems(
  supabase,
  items = [],
  { destination = "", max = 8, signal } = {},
) {
  const points = new Map();
  const todo = [];

  for (const item of items) {
    if (
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lon) &&
      !needsLocating(item, destination)
    ) {
      points.set(item.id, { lat: item.lat, lon: item.lon });
    } else if (needsLocating(item, destination)) {
      todo.push(item);
    }
  }

  for (const item of todo.slice(0, max)) {
    const query = geoQuery(item, destination);
    let found = null;
    try {
      const json = await fetchJson(searchUrl({ q: query, limit: 1 }), {
        timeoutMs: 5000,
      });
      // No query check against the text: an itinerary location is a venue name
      // more often than an address, and plausibleStop is built for matching
      // destination strings. A single best hit for a name plus a city is the
      // answer we want, and a wrong one is corrected the moment somebody edits
      // the field.
      found = pointFrom(json);
    } catch {
      found = null;
    }
    if (signal?.aborted) break;
    if (!found) continue;

    points.set(item.id, { lat: found.lat, lon: found.lon });
    // Best effort. A failed write means we look it up again next time, which is
    // wasteful but not wrong, and is not worth failing the day view over.
    await supabase
      .from("itinerary_items")
      .update({
        lat: found.lat,
        lon: found.lon,
        geo_query: query,
        geo_at: new Date().toISOString(),
      })
      .eq("id", item.id);
  }

  return points;
}

/**
 * The one point that stands for a day.
 *
 * Used for the forecast, which does not need to be per item -- a day's weather is
 * the same across a town, and asking six times would be six times the requests for
 * the same answer. The first located item wins, because the morning is where the
 * family will be when they read it.
 */
export function anchorPoint(items = [], points = new Map()) {
  for (const item of items) {
    const p = points.get(item.id);
    if (p) return p;
  }
  return null;
}
