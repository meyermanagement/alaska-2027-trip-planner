// Where the household is, for the things that want a point rather than an address.
//
// The sports drawer on About you opens with the local teams, and to know which
// teams are local it needs a coordinate. It used to read families.home_lat and
// home_lon and stop there, which quietly failed for a family that had typed a
// perfectly good home address the geocoder could not place. The welcome form
// writes the address either way -- deliberately, because the words are what the
// family recognizes -- so a row can carry "Webster Groves, MO" with no
// coordinates beside it, and the drawer would fall back to "the NFL, the NBA,
// MLB" as though nobody had said where they lived.
//
// So the address the family typed comes first and is tried twice: once as the
// coordinates already stored against it, and then, if those are missing, by
// asking the geocoder about the words themselves. Only when there is no usable
// address at all does this fall back to the coarse position of the request,
// which is what the browser's own IP says and is city-accurate at best.
//
// The order is the point. What somebody typed about where they live outranks
// what the network guesses about where they are sitting, because a family on
// holiday in Orlando should still see the Cardinals and the Blues.

import { destinationUrl, fetchJson, makeCache, pointFrom } from "./photon";
import { ipAnchor } from "./anchor";

// Held for the life of the serverless instance. A home address changes about
// never and this is only consulted for rows whose coordinates are missing, so
// this exists to keep a family in that state from paying for a lookup on every
// page view rather than to serve real traffic.
const geocoded = makeCache({ ttlMs: 12 * 60 * 60 * 1000, max: 100 });

/** A finite, in-range coordinate pair, or null. */
function usable(lat, lon) {
  const y = typeof lat === "number" ? lat : Number(lat);
  const x = typeof lon === "number" ? lon : Number(lon);
  if (!Number.isFinite(y) || !Number.isFinite(x)) return null;
  if (y < -90 || y > 90 || x < -180 || x > 180) return null;
  // (0, 0) is the Gulf of Guinea and is what a zeroed record looks like.
  if (y === 0 && x === 0) return null;
  return { lat: y, lon: x };
}

/**
 * The household's position, from the best source available.
 *
 * Returns `{ lat, lon, from }` where `from` is "stored" when the coordinates
 * were already on the row, "address" when they were worked out from the typed
 * address just now, or "request" when they came from the request's own IP.
 * Null when the family has no address and the request carries no position,
 * which is the honest answer for a brand-new account behind a VPN.
 *
 * `row` is a families row with home_address, home_lat and home_lon. `headers`
 * is the request's headers, which only exist on a real deployment -- absent in
 * local development, where this simply stops after the address.
 */
export async function resolveHomePoint(row, headers = null) {
  const stored = usable(row?.home_lat, row?.home_lon);
  if (stored) return { ...stored, from: "stored" };

  // The address is there but was never placed. Ask about the words. Restricted
  // to the region layers by destinationUrl, so "Webster Groves, MO" comes back
  // as the municipality rather than as a shop of that name.
  const address = String(row?.home_address || "").trim();
  if (address) {
    const key = address.toLowerCase();
    const known = geocoded.get(key);
    if (known !== undefined) {
      if (known) return { ...known, from: "address" };
    } else {
      let found = null;
      try {
        const point = pointFrom(await fetchJson(destinationUrl(address)));
        found = point ? usable(point.lat, point.lon) : null;
      } catch {
        // The geocoder being down is not a reason for a screen not to render.
        // Left uncached so the next visit tries again.
        found = null;
      }
      // A miss is cached too, so an address the geocoder genuinely cannot place
      // is not looked up again on every render. Only a thrown request escapes
      // the cache, since that is a fault rather than an answer.
      geocoded.set(key, found);
      if (found) return { ...found, from: "address" };
    }
  }

  const fromRequest = ipAnchor(headers);
  if (fromRequest) {
    return { lat: fromRequest.lat, lon: fromRequest.lon, from: "request" };
  }
  return null;
}
