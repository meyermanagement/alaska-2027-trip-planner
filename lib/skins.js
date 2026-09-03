/**
 * The skins a person can choose, and how the app decides which one they get.
 *
 * A skin is nothing but a block of custom properties. Every color, hairline,
 * shadow, radius, photograph treatment and map color in the app already reads
 * one -- the compiled stylesheet has nearly two hundred var() references in it
 * -- so a skin changes the whole app by changing the values, and not one
 * component knows a skin exists. The blocks themselves live in globals.css,
 * keyed off `html[data-skin]`.
 *
 * The list is closed. An unknown id would match no block, and the page would
 * come back unstyled rather than merely wrong, so both the database and this
 * module refuse anything not named here.
 */

export const SKINS = [
  {
    id: "journal",
    name: "Field Journal",
    tag: "Cream paper, spruce ink",
    blurb:
      "The one the app has always worn. Warm paper with a printed tooth to it, brown-black ink, one deep spruce accent, photographs printed as duotones, and a contour drawing of the coast pressed faintly behind every trip.",
    // The two dots the swatch shows: the ground, then the accent.
    swatch: ["#f2ead9", "#1b5a4c"],
    dark: false,
  },
  {
    id: "aurora",
    name: "Midnight Aurora",
    tag: "Dark glass, a route that glows",
    blurb:
      "Night as the point rather than the alternative. Near-black glass panels over a wash of teal into violet, photographs deepened until only the light in them shows, and the coast drawn as a lit filament.",
    swatch: ["#080c12", "#3fdfbe"],
    dark: true,
  },
  {
    id: "daybreak",
    name: "Daybreak Aurora",
    tag: "The same light, seen in the morning",
    blurb:
      "Midnight Aurora with the night taken out. The wash survives as a cool dawn haze over pale ice paper, panels are frosted glass instead of dark glass, and the coast still glows — in a deeper teal that holds up against white. A version you can read in a car at noon.",
    swatch: ["#eff5f5", "#0a7a6b"],
    dark: false,
  },
];

/** What a person gets when they have never chosen: the app as it was. */
export const DEFAULT_SKIN = "journal";

/** Where the browser is told which skin to paint before the app loads. */
export const SKIN_COOKIE = "alyeska-skin";

// A year. The cookie is a cache of the profile row rather than the truth, so
// losing it costs one page in the wrong skin and nothing else.
export const SKIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const IDS = new Set(SKINS.map((s) => s.id));

/** The skin named, or the default -- never an id the stylesheet cannot paint. */
export function skinOr(value) {
  const said = String(value == null ? "" : value).trim();
  return IDS.has(said) ? said : DEFAULT_SKIN;
}

/** Everything the app knows about a skin, by id. */
export function skinById(value) {
  const id = skinOr(value);
  return SKINS.find((s) => s.id === id) || SKINS[0];
}

/** Whether that skin paints a dark page, which the browser needs told. */
export function isDark(value) {
  return skinById(value).dark === true;
}
