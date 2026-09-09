// Where to lean a place search when the trip cannot say.
//
// The location box biases its searches towards the trip's own destination, which
// is what makes "Simon and Seaforts" on an Alaska trip find the restaurant in
// Anchorage. But two of the three boxes in the app have no trip behind them --
// the household's home address on the welcome screen, and the "where are you
// now" box on the Family screen -- and with no bias at all Photon answers from
// the whole planet. Typing "spring" for a street in Missouri returned Spring
// Street in Sydney, and the first six answers had nothing to do with anywhere
// the family has ever been.
//
// So a search with no destination falls back through what the app does know
// about where this person is, in order of how much it is worth trusting:
//
//   1. The household's saved home. Somebody typing an address into a box with
//      no trip attached is almost always typing one near where they live.
//   2. The coarse position of the request's own IP, which Vercel puts on every
//      request. City-accurate at best and wrong on a VPN, but a nudge towards
//      the right continent beats no nudge, and it is the only thing available
//      on the welcome screen where no home is saved yet.
//
// Anything further -- asking the browser for a position to fill in a text box --
// costs a permission prompt for a suggestion list, which is not a trade worth
// making. When neither of these exists the search goes out unbiased, exactly as
// it did before, which is the honest answer for a brand-new account behind a VPN.

/** A number that arrived as a number or as a numeric string, or null. */
function coord(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A point, only if both halves of it are real and in range. */
function point(lat, lon, name) {
  const y = coord(lat);
  const x = coord(lon);
  if (y === null || x === null) return null;
  // Out-of-range coordinates are a bad header or a bad row, not a location.
  // Photon would take them and answer about nowhere in particular.
  if (y < -90 || y > 90 || x < -180 || x > 180) return null;
  // Exactly (0, 0) is in the Gulf of Guinea and is what a truncated or zeroed
  // record looks like. Nothing in this app is there, so it is treated as absent
  // rather than as an anchor that would quietly bias every search to Africa.
  if (y === 0 && x === 0) return null;
  return { lat: y, lon: x, name: name || "" };
}

/**
 * The household's saved home, as a point to lean searches towards.
 *
 * Takes a families row. Null when the family has no geocoded home -- which is
 * every family for the length of the welcome screen, since the address is
 * geocoded on save.
 */
export function homeAnchor(row) {
  return point(row?.home_lat, row?.home_lon, "home");
}

/**
 * Roughly where the request came from, from the headers Vercel adds.
 *
 * Absent in local development, which is deliberate on Vercel's side and fine
 * here: a dev machine falls through to no bias and the box still works.
 */
export function ipAnchor(headers) {
  if (!headers || typeof headers.get !== "function") return null;
  return point(
    headers.get("x-vercel-ip-latitude"),
    headers.get("x-vercel-ip-longitude"),
    "request",
  );
}

/**
 * The part of a cache key that says which bias an answer was found under.
 *
 * The results cache is shared by everybody on the serverless instance, so an
 * answer found while leaning towards St. Louis must not be handed to somebody
 * leaning towards Amsterdam. Rounded to a whole degree -- about 70 miles -- so
 * that two people in the same household still share an entry, and so that a
 * precise home address is not spelled out inside a key.
 */
export function anchorKey(anchor) {
  if (!anchor) return "";
  return `${Math.round(anchor.lat)},${Math.round(anchor.lon)}`;
}
