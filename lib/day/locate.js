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
import { sameAddress } from "@/lib/places/home";

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

/**
 * The household address off a trip row that joined it, in the shape locateItems
 * wants. Supabase hands a to-one join back as an object on some queries and a
 * one-element array on others, and a route should not have to care which.
 */
export function houseOf(trip) {
  const row = Array.isArray(trip?.families) ? trip.families[0] : trip?.families;
  return {
    address: row?.home_address || "",
    lat: row?.home_lat,
    lon: row?.home_lon,
  };
}

/** Does the stored point still describe what the item says now? */
export function needsLocating(item, destination = "") {
  const wanted = geoQuery(item, destination);
  if (!wanted) return false;
  if (item.lat === null || item.lat === undefined) return true;
  if (item.lon === null || item.lon === undefined) return true;
  return !sameAddress(item.geo_query, wanted);
}

/**
 * Locate the items that need it and write the points back.
 *
 * Deliberately serial with a small cap. A day view opening should not fire twelve
 * simultaneous requests at a free geocoder, and the ones that matter -- the timed
 * items of today -- are at the front of the list. Anything past the cap keeps its
 * blank and gets picked up next time.
 *
 * The household's own address is answered from the household rather than from the
 * geocoder, which is both faster and more accurate: the family confirmed that point
 * on the Family page, and a free geocoder that has no house numbers for their
 * street will answer a question about it with something else entirely.
 *
 * @returns a Map of item id to {lat, lon}, including points already stored.
 */
export async function locateItems(
  supabase,
  items = [],
  { destination = "", home = null, max = 8, signal } = {},
) {
  const house =
    home &&
    Number.isFinite(home.lat) &&
    Number.isFinite(home.lon) &&
    home.address
      ? home
      : null;
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
    // The house, when the item says the house. Almost every trip begins with a
    // drive from this address, so this is the common case rather than a nicety.
    if (house && sameAddress(house.address, item.location)) {
      points.set(item.id, { lat: house.lat, lon: house.lon });
      await supabase
        .from("itinerary_items")
        .update({
          lat: house.lat,
          lon: house.lon,
          geo_query: query,
          geo_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      continue;
    }
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
    if (!found) {
      // A point found for words the item no longer says is not a fact about the
      // item; it is the last place the geocoder guessed. Keeping it is how a drive
      // whose address was corrected to a house in Missouri went on reporting the
      // weather at a clothes shop in Iowa, under the right address, with nothing
      // on the screen admitting the mismatch. Silence is the honest answer. The
      // stored query is left alone, so the next look tries the new words again
      // rather than treating one bad afternoon as settled.
      if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
        await supabase
          .from("itinerary_items")
          .update({ lat: null, lon: null })
          .eq("id", item.id);
      }
      continue;
    }

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
