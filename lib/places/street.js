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

// Two different Google products, asked in order, because they are enabled
// independently and an address is exactly what the first one is for.
//
// Geocoding is the purpose-built answer to "turn these words into a point". It
// is cheaper than a place search, it returns the address Google would write
// itself, and it says how it found the point -- ROOFTOP means it knows the
// building, RANGE_INTERPOLATED means it counted along the block, GEOMETRIC_CENTER
// means it gave up and centred the road. That is a far better precision signal
// than guessing from a list of category tags.
//
// Text search is the fallback, and it is here for a plain operational reason:
// these are separate APIs on the key, either can be switched off, and a house
// that one of them cannot place is often placed by the other.
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
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
export async function findAddress(q, opts = {}) {
  const { hit } = await lookUpAddress(q, opts);
  return hit;
}

/**
 * The same lookup, but it also says what happened.
 *
 * Written because "the house number does not come back" is impossible to tell
 * apart from "the key is missing", "the API is switched off on the key" and
 * "Google genuinely does not know this address" from the outside, and every one
 * of those needs a different thing done about it. The reason travels back to the
 * screen so somebody can read it instead of guessing.
 *
 * Reasons: `off` (no key), `denied` (Google refused the key, with its own
 * message), `none` (asked properly, nothing found), `slow` (timed out), `error`.
 */
export async function lookUpAddress(q, { signal = null, bias = null } = {}) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const query = String(q || "").trim();
  if (!key) return { hit: null, why: "off", detail: "" };
  if (query.length < 4) return { hit: null, why: "none", detail: "" };

  const geo = await geocode(query, key, signal, bias);
  if (geo.hit) return { ...geo, second: "" };
  // Only worth a second question when the first one was refused or broke.
  // Geocoding saying "no such address" is a real answer about the address.
  if (geo.why === "none") return { ...geo, second: "" };
  const text = await textSearch(query, key, signal, bias);
  if (text.hit) return { ...text, second: "" };
  // Both were asked and neither answered. Which one failed, and how, is the
  // difference between switching on one API and switching on two, so the second
  // attempt's fate travels back rather than being swallowed by the first's.
  return { ...geo, second: text.why || "error" };
}

/** Geocoding: words in, one point out, with how it was found. */
async function geocode(query, key, signal, bias) {
  const params = new URLSearchParams({ address: query, key });
  // A box around where the trip is, when there is one. Advisory only -- an
  // address that names its own town wins regardless.
  if (bias?.circle?.center) {
    const { latitude, longitude } = bias.circle.center;
    const d = 0.6;
    const at = (n) => Math.round(n * 1e4) / 1e4;
    params.set(
      "bounds",
      `${at(latitude - d)},${at(longitude - d)}|${at(latitude + d)},${at(longitude + d)}`,
    );
  }
  const timer = AbortSignal.timeout
    ? AbortSignal.timeout(LOOKUP_MS)
    : undefined;
  try {
    const res = await fetch(`${GEOCODE_URL}?${params.toString()}`, {
      signal: signal || timer,
    });
    if (!res.ok)
      return { hit: null, why: "error", detail: `HTTP ${res.status}` };
    const json = await res.json();
    const status = json?.status || "";
    if (status === "REQUEST_DENIED" || status === "OVER_QUERY_LIMIT") {
      return {
        hit: null,
        why: "denied",
        detail: json?.error_message || status,
      };
    }
    const found = json?.results?.[0];
    const lat = found?.geometry?.location?.lat;
    const lon = found?.geometry?.location?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { hit: null, why: "none", detail: "" };
    }
    const address = found.formatted_address || query;
    const how = found.geometry?.location_type || "";
    return {
      hit: {
        name: address,
        address,
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        // A roof is a building. Counting along the block is not, even though the
        // number is right there in the words, so it is not called exact.
        exact: how === "ROOFTOP",
      },
      why: "",
      detail: how,
    };
  } catch (e) {
    return {
      hit: null,
      why: e?.name === "TimeoutError" ? "slow" : "error",
      detail: "",
    };
  }
}

/** Text search: the fallback, for keys where Geocoding is not switched on. */
async function textSearch(query, key, signal, bias) {
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
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        detail = body?.error?.message || detail;
      } catch {
        // A refusal that is not JSON tells us nothing more than its status.
      }
      return {
        hit: null,
        why: res.status === 403 || res.status === 400 ? "denied" : "error",
        detail,
      };
    }
    const json = await res.json();
    const found = json?.places?.[0];
    const lat = found?.location?.latitude;
    const lon = found?.location?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { hit: null, why: "none", detail: "" };
    }

    const address =
      found.shortFormattedAddress || found.formattedAddress || query;
    const label = found.displayName?.text || "";
    // Google names a house after its street number, which is already the front
    // of the address, so repeating it as a heading reads as a stutter.
    const name = label && !address.startsWith(label) ? label : address;
    return {
      hit: {
        name,
        address,
        lat: Math.round(lat * 1e6) / 1e6,
        lon: Math.round(lon * 1e6) / 1e6,
        exact: (found.types || []).some((t) => EXACT.has(t)),
      },
      why: "",
      detail: (found.types || []).join(","),
    };
  } catch (e) {
    return {
      hit: null,
      why: e?.name === "TimeoutError" ? "slow" : "error",
      detail: "",
    };
  }
}

/**
 * The address at a point, for a phone that knows where it is standing.
 *
 * The same Geocoding API read the other way round. A device fix is a pair of
 * numbers, and a pair of numbers is not something a family can check -- so this
 * turns it into words they can read and correct before it is saved as the place
 * their trips start from.
 *
 * The point kept is Google's, not the phone's. A GPS fix in a driveway is
 * accurate to a few metres of wherever the phone happened to be; the rooftop
 * Google returns is the middle of the house, which is the more honest thing to
 * measure a drive from.
 */
export async function addressAt(lat, lon, { signal = null } = {}) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { hit: null, why: "off", detail: "" };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { hit: null, why: "none", detail: "" };
  }
  const params = new URLSearchParams({
    latlng: `${Math.round(lat * 1e6) / 1e6},${Math.round(lon * 1e6) / 1e6}`,
    key,
    // Ask for the door rather than the block, the postcode or the county. Google
    // returns a ladder of increasingly vague answers for any point; this asks it
    // to start at the top and the code below still reads whatever arrives first.
    result_type: "street_address|premise|subpremise",
  });
  const timer = AbortSignal.timeout
    ? AbortSignal.timeout(LOOKUP_MS)
    : undefined;
  try {
    const res = await fetch(`${GEOCODE_URL}?${params.toString()}`, {
      signal: signal || timer,
    });
    if (!res.ok) {
      return { hit: null, why: "error", detail: `HTTP ${res.status}` };
    }
    const json = await res.json();
    const status = json?.status || "";
    if (status === "REQUEST_DENIED" || status === "OVER_QUERY_LIMIT") {
      return {
        hit: null,
        why: "denied",
        detail: json?.error_message || status,
      };
    }
    const found = json?.results?.[0];
    const address = found?.formatted_address || "";
    const at = found?.geometry?.location;
    if (!address) return { hit: null, why: "none", detail: "" };
    const useLat = Number.isFinite(at?.lat) ? at.lat : lat;
    const useLon = Number.isFinite(at?.lng) ? at.lng : lon;
    const how = found.geometry?.location_type || "";
    return {
      hit: {
        name: address,
        address,
        lat: Math.round(useLat * 1e6) / 1e6,
        lon: Math.round(useLon * 1e6) / 1e6,
        exact: how === "ROOFTOP",
      },
      why: "",
      detail: how,
    };
  } catch (e) {
    return {
      hit: null,
      why: e?.name === "TimeoutError" ? "slow" : "error",
      detail: "",
    };
  }
}

/** What to put on screen when an address-shaped query came back without one. */
export function addressTrouble(why, detail, second = "") {
  if (why === "off") {
    return "House numbers need a Google key on the server, and there is not one set, so only streets and named places can be found.";
  }
  if (why === "denied") {
    // Google's own messages end in a period, and this one lands mid-sentence.
    const said = detail ? `: ${String(detail).replace(/\.\s*$/, "")}` : "";
    // Both refused. Two APIs to switch on, and a key restriction list that can
    // refuse them even once they are on -- worth saying, because a key limited to
    // the Places API will keep refusing Geocoding no matter what the project has
    // enabled.
    if (second === "denied") {
      return `Google refused both address lookups on this key${said}. In Google Cloud, switch on the Geocoding API and the Places API for the project, then check the key's own API restrictions, which can refuse an API the project has already enabled.`;
    }
    // The fallback was allowed through and simply had nothing. So the key works;
    // it is the Geocoding API in particular that is missing, and that is the one
    // that finds house numbers.
    if (second === "none") {
      return `Google refused the Geocoding lookup${said}, and the place search it does allow has no record of that address. Switching the Geocoding API on for this key is the fix.`;
    }
    if (second === "slow" || second === "error") {
      return `Google refused the Geocoding lookup${said}, and the place search behind it did not answer. Switching the Geocoding API on for this key is the fix.`;
    }
    return `Google refused the address lookup${said}. The key needs the Geocoding API, or the Places API, switched on.`;
  }
  if (why === "slow") {
    return "The address lookup took too long, so only streets and named places are listed. Typing it again usually works.";
  }
  if (why === "error") {
    return "The address lookup did not answer, so only streets and named places are listed.";
  }
  if (why === "none") {
    return "No house at that number was found, so the street is offered instead. It is right to within the length of a block.";
  }
  if (why === "nowhere") {
    return "Your phone gave a position, but there is no street address at it. Type the address instead.";
  }
  return "";
}

/** The lookup result in the shape the location box's list expects. */
export function asSuggestion(hit) {
  if (!hit) return null;
  // A geocoded address arrives as one long line, and one long line is what the
  // row was too narrow for. The house and street go on top, the town and the
  // postcode underneath, which is how the rest of the list is already shaped and
  // how somebody scanning for their own house reads it.
  let name = hit.name;
  let detail = hit.address === hit.name ? "" : hit.address;
  if (!detail && name.includes(",")) {
    const cut = name.indexOf(",");
    detail = name.slice(cut + 1).trim();
    name = name.slice(0, cut).trim();
  }
  return {
    name,
    detail,
    value: hit.address,
    kind: hit.exact ? "address" : "street",
    lat: hit.lat,
    lon: hit.lon,
  };
}
