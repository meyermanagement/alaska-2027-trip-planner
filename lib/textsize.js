/**
 * How big the words are, for one person.
 *
 * The app's type is a ladder of eight steps declared once in globals.css --
 * --fs-2xs through --fs-3xl -- and every one of them is multiplied by
 * --text-scale. So this file changes the size of every word in the app by
 * changing one number, and not one component knows the control exists.
 *
 * The names moved down a rung. What the app first shipped at is now Small, the
 * step above it is Regular and is what a reader gets before choosing anything,
 * and the step above that is Large. Body text on a phone runs about 16, 17 and
 * 19 pixels across the three; on a desk 17, 18.5 and 20. Going further than the
 * top step starts breaking rows that hold a time, a title and a pill on one
 * line, and the honest answer for somebody who needs more than this is the
 * browser's or the operating system's own zoom, which reflows everything rather
 * than only the text.
 *
 * Because the sizes the three ids stand for changed, the ids changed with them
 * and the cookie's name went up a number. A stale "alyeska-text-1" is ignored
 * rather than honored, and the middleware writes the new one from the column on
 * the next request; the migration moves every saved row down the same rung, so
 * nobody's words change size because of the rename.
 *
 * The list is closed, the same way the skins are. An unknown id matches no
 * block, which would silently mean the default anyway -- textSizeOr says so
 * out loud instead, and the column has the same three values in a check.
 */

export const TEXT_SIZES = [
  {
    id: "small",
    name: "Small",
    note: "Smaller text, with more on screen.",
  },
  {
    id: "regular",
    name: "Regular",
    note: "The default reading size.",
  },
  {
    id: "large",
    name: "Large",
    note: "Larger text for easier reading.",
  },
];

export const DEFAULT_TEXT_SIZE = "regular";

// Named with a number so a later change to what the values mean can be shipped
// without honoring a stale cookie, which is the lesson the skin cookie learned
// the hard way. Nothing is granted on the strength of it, so it is allowed to be
// readable by the script in the document head.
export const TEXT_COOKIE = "alyeska-text-2";

export const TEXT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function textSizeOr(value, fallback = DEFAULT_TEXT_SIZE) {
  return TEXT_SIZES.some((size) => size.id === value) ? value : fallback;
}
