// A color of a trip's own, available in the very first frame.
//
// A cover plate needs something behind it long before there is anything to put
// on it. The photograph is the biggest thing on the wire and arrives last; the
// coastline is 540KB and is fetched after the page has painted; and plenty of
// trips have neither yet. Until this, the plate was one flat dark brown for
// every trip, so a screen of trips opened as a column of identical rectangles
// and each one changed under you as its picture landed.
//
// So every trip gets one of five grounds, chosen from its id and therefore the
// same on every device, every reload and on the server as well as the browser --
// which is what lets it be painted in the first frame rather than after a
// measurement. The five are the app's own colors, deepened: nothing here
// introduces a hue the rest of the page does not already have.
//
// It is a ground, not a label. Two trips can share a color, nothing anywhere
// tells the family what a color means, and the contour or the photograph covers
// most of it as soon as either arrives.

const GROUNDS = [
  // spruce -- --color-teal
  "linear-gradient(158deg, #10362f 0%, #1b5a4c 52%, #2d7a63 100%)",
  // glacier -- --color-glacier
  "linear-gradient(158deg, #12354a 0%, #1f5675 52%, #2a7f9e 100%)",
  // amber -- --color-amber
  "linear-gradient(158deg, #4a2c0b 0%, #8f5416 52%, #b8752a 100%)",
  // rose -- --color-rose
  "linear-gradient(158deg, #4e1a27 0%, #96334c 55%, #b04f66 100%)",
  // the map's own brown, kept in the set so the old plate is still one of the
  // faces of the app rather than something it used to look like
  "linear-gradient(158deg, #201a10 0%, #4c3f2b 55%, #6b5a3d 100%)",
];

/**
 * Deterministic ground for a trip.
 *
 * @param {object|string} trip a trip, or any stable string standing in for one
 * @returns {string} a CSS background value, never empty
 */
export function coverTint(trip) {
  const key =
    typeof trip === "string" ? trip : String(trip?.id || trip?.name || "");
  // FNV-1a, 32-bit. A plainer h*31 hash sent half a set of trips to the same
  // ground, because it leaves the low bits of a UUID barely mixed and the low
  // bits are all that survive the modulo. This mixes the whole string into every
  // bit, so ids sharing a prefix land apart.
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return GROUNDS[(h >>> 0) % GROUNDS.length];
}

export const COVER_GROUND_COUNT = GROUNDS.length;
