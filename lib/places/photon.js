// Talking to Photon, the geocoder behind the location box.
//
// Why Photon and not Nominatim, which is the obvious choice: OpenStreetMap's
// own Nominatim usage policy forbids exactly what this feature is —
// "autocomplete search... is strictly forbidden" — and the penalty is the app's
// IP being blocked. Photon exists for this, asks for no key, and asks only that
// you be fair with it. So: one request per keystroke burst, never per keystroke,
// answers held in memory, and a short list rather than a long one.
//
// Everything here is pure except `fetchJson`, so the harness can check the URLs
// and the cache without going near the network.

const PHOTON = "https://photon.komoot.io/api";

/** How many suggestions to ask for. More than this is a scrolling list nobody reads. */
export const LIMIT = 6;

/**
 * A place search, optionally biased towards a point. The bias is what makes
 * "Simon and Seaforts" find the restaurant in Anchorage rather than a street in
 * England, so the trip's own destination is worth the extra lookup it costs.
 */
export function searchUrl({
  q,
  lat = null,
  lon = null,
  limit = LIMIT,
  lang = "en",
}) {
  const url = new URL(PHOTON);
  url.searchParams.set("q", String(q || "").trim());
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("lang", lang);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
  }
  return url.toString();
}

/**
 * Where a trip is, as a point to lean the searches towards. Restricted to the
 * layers that name a region rather than a building, because "Willemstad" should
 * come back as the city and not as a shop called Willemstad.
 */
export function destinationUrl(destination) {
  const url = new URL(PHOTON);
  url.searchParams.set("q", String(destination || "").trim());
  url.searchParams.set("limit", "1");
  url.searchParams.set("lang", "en");
  url.searchParams.set("layer", "state");
  url.searchParams.append("layer", "county");
  url.searchParams.append("layer", "city");
  url.searchParams.append("layer", "district");
  url.searchParams.append("layer", "locality");
  return url.toString();
}

/**
 * A trip's destination is written for people, not for geocoders: "Vancouver,
 * Inside Passage, Denali, Anchorage & Girdwood" is six places and no coordinate.
 * So there is more than one thing worth asking about, in order of preference.
 *
 * The whole string comes first, because a plain "Springfield, IL" is exactly the
 * kind of ambiguous name that needs its state, and splitting it would throw the
 * state away and land in Massachusetts. Then the first named place, which
 * rescues the multi-stop strings.
 */
export function destinationAnchors(destination) {
  const whole = String(destination || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!whole) return [];
  const segments = whole
    .split(/,|&|\band\b|\//i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
  const out = [];
  for (const candidate of [whole, segments[0]]) {
    if (candidate && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}

/** The first result's coordinates, or null when the place means nothing to Photon. */
export function pointFrom(json) {
  const coords = json?.features?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

/**
 * A small cache with an age limit and a size limit. Two people editing the same
 * trip type the same handful of place names, and the same person types the same
 * one repeatedly while deciding, so this removes most of the traffic. The size
 * limit is what stops a long session turning it into a leak.
 */
export function makeCache({ ttlMs = 10 * 60 * 1000, max = 300 } = {}) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.at > ttlMs) {
        store.delete(key);
        return undefined;
      }
      // Touched most recently goes to the back, so eviction takes the stalest.
      store.delete(key);
      store.set(key, hit);
      return hit.value;
    },
    set(key, value) {
      if (store.has(key)) store.delete(key);
      store.set(key, { value, at: Date.now() });
      while (store.size > max) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
      return value;
    },
    get size() {
      return store.size;
    },
  };
}

/** One request, with a timeout, returning null rather than throwing. */
export async function fetchJson(url, { timeoutMs = 6000 } = {}) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // Photon asks to be treated fairly; saying who is calling is part of that.
        "User-Agent": "AlyeskaTravelPlanner/1.0 (family trip planner)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
