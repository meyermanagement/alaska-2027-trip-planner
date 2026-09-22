// A color behind every cover, available in the very first frame.
//
// A cover plate needs something behind it long before there is anything to put
// on it. The photograph is the biggest thing on the wire and arrives last; the
// coastline is 540KB and is fetched after the page has painted; and plenty of
// trips have neither yet. Until this, the plate was one flat dark brown for
// every trip, so a screen of trips opened as a column of identical rectangles
// and each one changed under you as its picture landed.
//
// It used to be five grounds, chosen from the trip's id. That was the wrong
// trade. A ground strong enough to tell five colors apart is a ground strong
// enough to repaint the photograph: a castle, a reef and a glacier all arrived
// as one field of violet, teal or plum with a shape in it, and the thing the
// family recognises a trip by -- its own picture -- was the thing being thrown
// away. So there is one ground now, glacier, and each skin supplies its own
// value for it: the covers are a family, and the color in a cover comes from
// the picture.
//
// It is a ground, not a label. Nothing anywhere tells the family what the color
// means, and the contour or the photograph covers most of it as soon as either
// arrives.

// One token, taken down towards the page's own darkest value at the top and
// lifted towards its lightest at the bottom, rather than literal hexes -- so a
// skin that changes glacier changes the covers with it, and a skin whose page is
// dark deepens them in the right direction. --trip-ground is the hook for a skin
// that wants a ground of its own without touching glacier everywhere else.
const TOKEN = "var(--trip-ground, var(--color-glacier))";

const GROUND =
  `linear-gradient(158deg, ` +
  `color-mix(in srgb, ${TOKEN} 62%, #000) 0%, ` +
  `${TOKEN} 52%, ` +
  `color-mix(in srgb, ${TOKEN} 78%, #fff) 100%)`;

/**
 * The ground behind a cover.
 *
 * Takes a trip, and ignores it: the signature is what TripBackdrop and the menu
 * already call, and keeping it means one ground is a change of value rather than
 * a change of shape.
 *
 * @param {object|string} [trip] a trip, or any stable string standing in for one
 * @returns {string} a CSS background value, never empty
 */
export function coverTint() {
  return GROUND;
}

/**
 * The same ground as one flat color rather than a gradient.
 *
 * The gradient is the floor under the plate, and for most trips nothing of it
 * is ever seen: the coastline drawing is painted over it at full opacity, so a
 * located trip showed its skin's map colors and not the app's. This token is
 * what the wash layer blends over the finished drawing -- same hue, so a plate
 * whose picture has not arrived and one whose has are the same color.
 *
 * @param {object|string} [trip] a trip, or any stable string standing in for one
 * @returns {string} a CSS color value, never empty
 */
export function coverToken() {
  return TOKEN;
}
