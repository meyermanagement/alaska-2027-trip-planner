/**
 * How big the words are, for one person.
 *
 * The app's type is a ladder of eight steps declared once in globals.css --
 * --fs-2xs through --fs-3xl -- and every one of them is multiplied by
 * --text-scale. So this file changes the size of every word in the app by
 * changing one number, and not one component knows the control exists.
 *
 * The steps are small on purpose. A phone at the largest setting is reading
 * body text at nineteen pixels, which is a comfortable book; going further
 * starts breaking rows that hold a time, a title and a pill on one line, and
 * the honest answer for somebody who needs more than this is the browser's or
 * the operating system's own zoom, which reflows everything rather than only
 * the text.
 *
 * The list is closed, the same way the skins are. An unknown id matches no
 * block, which would silently mean the default anyway -- textSizeOr says so
 * out loud instead, and the column has the same three values in a check.
 */

export const TEXT_SIZES = [
  {
    id: "regular",
    name: "Regular",
    note: "The size the app ships at.",
  },
  {
    id: "large",
    name: "Large",
    note: "One step up, everywhere.",
  },
  {
    id: "largest",
    name: "Largest",
    note: "Two steps up, and the most the app's tightest rows hold.",
  },
];

export const DEFAULT_TEXT_SIZE = "regular";

// Named with a number so a later change to what the values mean can be shipped
// without honoring a stale cookie, which is the lesson the skin cookie learned
// the hard way. Nothing is granted on the strength of it, so it is allowed to be
// readable by the script in the document head.
export const TEXT_COOKIE = "alyeska-text-1";

export const TEXT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function textSizeOr(value, fallback = DEFAULT_TEXT_SIZE) {
  return TEXT_SIZES.some((size) => size.id === value) ? value : fallback;
}
