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

// Each ground is one token, taken down towards the page's own darkest value at
// the top and lifted towards its lightest at the bottom, rather than three
// literal hexes -- so a skin that changes the accent changes the covers with it,
// and a skin whose page is dark deepens them in the right direction.
const GROUNDS = [
  ground("var(--color-teal)"),
  ground("var(--color-glacier)"),
  ground("var(--color-amber)"),
  ground("var(--color-rose)"),
  // The map's own ground, kept in the set so the plate the app opened with is
  // still one of its faces rather than something it used to look like.
  ground("var(--map-land)"),
];

function ground(token) {
  return (
    `linear-gradient(158deg, ` +
    `color-mix(in srgb, ${token} 62%, #000) 0%, ` +
    `${token} 52%, ` +
    `color-mix(in srgb, ${token} 78%, #fff) 100%)`
  );
}

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
