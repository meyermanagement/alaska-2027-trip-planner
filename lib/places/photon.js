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

/**
 * How many answers to ask Photon for. More than the six or so worth showing,
 * because the ranking needs something to choose between: the right hotel is
 * sometimes eighth in what comes back and first once the trip is taken into
 * account.
 */
export const LIMIT = 10;

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
    // A deliberately loose bias. A trip that runs from Vancouver to Girdwood has
    // no single center, so this is a regional nudge and the real work of
    // preferring the right stop happens when the answers are ranked. Loose on
    // purpose: a tight bias hides the Vancouver hotel on an Alaska trip.
    url.searchParams.set("zoom", "12");
    url.searchParams.set("location_bias_scale", "0.3");
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
 * Every place a trip goes, as separate things to look up.
 *
 * A destination is written for people: "Vancouver, Inside Passage, Denali,
 * Anchorage & Girdwood" is five places and no coordinate. Taking only the first
 * of them, which is what this used to do, leans an entire Alaska trip towards
 * British Columbia. So all of them get looked up, and an answer is judged by how
 * close it lands to the nearest one.
 *
 * A single-place destination is asked for whole, because "Springfield, IL" needs
 * its state or it lands in Massachusetts.
 *
 * Capped, but generously: a seven-stop trip through Europe should not lose Venice
 * off the end. This costs one lookup per stop, once every twelve hours.
 */
export function destinationStops(destination, max = 8) {
  const whole = String(destination || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!whole) return [];
  const segments = [];
  for (const part of whole.split(/,|&|\band\b|\//i)) {
    const stop = part.trim();
    if (stop.length > 2 && !segments.includes(stop)) segments.push(stop);
  }
  if (segments.length < 2) return [whole];
  return segments.slice(0, max);
}

/** Letters only, lower case, accents flattened, so "Curaçao" and "Curacao" agree. */
function plain(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** How many single-character edits apart two short words are. */
function editDistance(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * Whether an answer is actually the stop that was asked for.
 *
 * This is not paranoia. Photon answers "Inside Passage" with a place in Brazil
 * and "Lake Bled" with a lake in North Carolina, and a stop in Brazil would go on
 * to recommend Brazilian restaurants for an Alaska cruise. So a stop is only
 * believed when its name and the answer's name are recognizably the same thing,
 * give or take a spelling ("Tirol" for Tyrol) or a suffix ("Istria County",
 * "Walt Disney World Horticulture").
 */
export function plausibleStop(query, props) {
  const asked = plain(query);
  const got = plain(props?.name);
  if (!asked || !got) return false;
  if (got.includes(asked) || asked.includes(got)) return true;
  // One misspelled word is forgivable; two unrelated words are not.
  if (!asked.includes(" ") && !got.includes(" ") && asked.length >= 4) {
    return editDistance(asked, got) <= 1;
  }
  return false;
}

const EARTH_KM = 6371;

/** How far apart two points are, over the ground. */
export function haversineKm(a, b) {
  if (!a || !b) return Infinity;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The distance to whichever of these places is closest. */
export function nearestKm(point, stops = []) {
  let best = Infinity;
  for (const stop of stops) {
    const d = haversineKm(point, stop);
    if (d < best) best = d;
  }
  return best;
}

/**
 * A stop with no neighbor within reach is a bad lookup rather than a real stop,
 * so it is dropped. Only applied once there are three, because with two there is
 * no way to tell which of them is the odd one out.
 */
export function withoutOutliers(stops = [], maxKm = 4000) {
  if (stops.length < 3) return stops;
  return stops.filter((stop) => {
    const others = stops.filter((other) => other !== stop);
    return nearestKm(stop, others) <= maxKm;
  });
}

/**
 * The stop to lean the search on: the one with the least total distance to all
 * the others. An average would sit in the sea between Vancouver and Anchorage and
 * favor neither; the middle stop of an Alaska trip is Anchorage, which is where
 * most of the days are.
 */
export function biasPoint(stops = []) {
  const usable = stops.filter(
    (s) => s && Number.isFinite(s.lat) && Number.isFinite(s.lon),
  );
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  let best = null;
  let bestTotal = Infinity;
  for (const stop of usable) {
    let total = 0;
    for (const other of usable) total += haversineKm(stop, other);
    if (total < bestTotal) {
      bestTotal = total;
      best = stop;
    }
  }
  return best;
}

/** The first result's coordinates, or null when the place means nothing to Photon. */
export function pointFrom(json, query = null) {
  const feature = json?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // Given something to check against, an answer about somewhere else is no answer.
  if (query !== null && !plausibleStop(query, feature.properties)) return null;
  return { lat, lon, name: feature.properties?.name || String(query || "") };
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
