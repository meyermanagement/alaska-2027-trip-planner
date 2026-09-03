// House numbers, which the free geocoder does not have.
//
// Photon is built on OpenStreetMap, and OpenStreetMap is very good at naming
// things and only patchily good at numbering doors. Ask it for a house on a
// residential street in Missouri and it answers with the street: name "Windsor
// Court", type "street", a bounding box a few hundred feet long. That is not a
// bug in how the answer is labeled -- there is no house in the data to label. It
// is the right result for a restaurant, a park or a port, and the wrong one for
// the question "where do we live", where the number is the entire point.
//
// So a query that opens with a house number gets asked of Google as well, using
// the key already configured for place photos and drive times. Google is not
// used for the general location box because it is metered and Photon is not, and
// most searches in this app are for named places Photon knows perfectly well.
// This is the narrow case where the free answer is knowably incomplete.
//
// When no key is set, or Google has nothing, the street result stands. A street
// is a real answer -- it is right to within the length of a block -- and the
// caller is told which kind it got so it can say so rather than implying a
// precision it does not have.

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.displayName",
  "places.location",
  "places.types",
].join(",");

// Short, because this runs while somebody is typing. A slow answer is worse
// than no answer here: the street result is already on screen.
const LOOKUP_MS = 2500;

// What Google calls a result that is an actual building or door rather than a
// road, a neighborhood or a town.
const EXACT = new Set([
  "street_address",
  "premise",
  "subpremise",
  "postal_code",
]);

/**
 * Whether a query is somebody typing an address rather than a place name.
 *
 * A number, then a word. "12 Windsor Court" and "1600 Amphitheatre" match; "7
 * Eleven" is a false positive we can live with, and "Hotel Wailea" is not one.
 */
export function looksLikeAddress(q) {
  return /^\s*\d{1,6}[a-z]?\s+\p{L}/iu.test(String(q || ""));
}

export function addressLookupConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/**
 * One address, looked up by what was typed. Returns null rather than throwing,
 * always -- a failed lookup here must leave the street results untouched.
 *
 * `exact` says whether Google matched a building or fell back to a road, so the
 * screen can be honest about which one the family is looking at.
 */
export async function findAddress(q, { signal = null, bias = null } = {}) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const query = String(q || "").trim();
  if (!key || query.length < 4) return null;

  const timer = AbortSignal.timeout
    ? AbortSignal.timeout(LOOKUP_MS)
    : undefined;
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        ...(bias ? { locationBias: bias } : {}),
      }),
      signal: signal || timer,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const found = json?.places?.[0];
    const lat = found?.location?.latitude;
    const lon = found?.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const address =
      found.shortFormattedAddress || found.formattedAddress || query;
    const label = found.displayName?.text || "";
    // Google names a house after its street number, which is already the front
    // of the address, so repeating it as a heading reads as a stutter.
    const name = label && !address.startsWith(label) ? label : address;
    return {
      name,
      address,
      lat: Math.round(lat * 1e6) / 1e6,
      lon: Math.round(lon * 1e6) / 1e6,
      exact: (found.types || []).some((t) => EXACT.has(t)),
    };
  } catch {
    return null;
  }
}

/** The lookup result in the shape the location box's list expects. */
export function asSuggestion(hit) {
  if (!hit) return null;
  return {
    name: hit.name,
    detail: hit.address === hit.name ? "" : hit.address,
    value: hit.address,
    kind: hit.exact ? "address" : "street",
    lat: hit.lat,
    lon: hit.lon,
  };
}
