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
    // What the phone paints its own bar with, above the app: the page's own
    // ground. The header floats over that ground at four-fifths opacity and
    // blurs what is behind it, so the ground is the honest answer -- and it
    // means the bar and the top of the page are one continuous surface rather
    // than two shades of nearly the same thing.
    bar: "#f2ead9",
    dark: false,
  },
  {
    id: "aurora",
    name: "Midnight Aurora",
    tag: "Dark glass, a route that glows",
    blurb:
      "Night as the point rather than the alternative. Near-black glass panels over a wash of teal into violet, photographs deepened until only the light in them shows, and the coast drawn as a lit filament.",
    swatch: ["#080c12", "#3fdfbe"],
    bar: "#080c12",
    dark: true,
  },
  {
    id: "daybreak",
    name: "Daybreak Aurora",
    tag: "The same light, seen in the morning",
    blurb:
      "Midnight Aurora with the night taken out. The wash survives as a cool dawn haze over pale ice paper, panels are frosted glass instead of dark glass, and the coast still glows — in a deeper teal that holds up against white. A version you can read in a car at noon.",
    swatch: ["#eff5f5", "#0a7a6b"],
    bar: "#eff5f5",
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

/**
 * Tell the phone what to paint its own bar with.
 *
 * The strip above the page -- the status bar on iOS, the address bar on Android
 * -- is the browser's, not the app's, and it takes its color from a meta tag
 * that is written once when the page is built. That made it the one surface a
 * skin could not reach: choosing Midnight Aurora repainted everything down to
 * the coastline and left a spruce band across the top of the phone.
 *
 * The tag has to exist for this to work, and it does: the layout still declares
 * a theme color, which is what the very first frame uses.
 */
export function paintChrome(value) {
  if (typeof document === "undefined") return;
  const skin = skinById(value);
  // Replaced, not edited.
  //
  // Rewriting the content attribute of the tag already in the page is the
  // obvious way to do this, and it is what the app did first. It changed the
  // tag and the phone ignored it: mobile Safari reads the theme color when the
  // document is parsed and does not watch that attribute afterwards, so the bar
  // only came round to the new skin on the next full page load. Removing every
  // theme-color tag and inserting a fresh one is a change to the head's child
  // list rather than to an attribute, which is the part Safari does watch.
  //
  // All of them, because a page can end up carrying more than one, and a stale
  // one left behind is how the bar goes back to the last skin on the next
  // navigation.
  const head = document.head;
  if (!head) return;
  head
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((tag) => tag.remove());
  const fresh = document.createElement("meta");
  fresh.setAttribute("name", "theme-color");
  fresh.setAttribute("content", skin.bar);
  head.appendChild(fresh);
  // Same reason, one layer down: this is what decides whether the phone draws
  // the time and the battery in black or white over that bar, and whether form
  // controls and scrollbars come up light or dark.
  document.documentElement.style.colorScheme = skin.dark ? "dark" : "light";
}

/**
 * Whether this browser repaints its own chrome when the tag changes.
 *
 * Safari settles the theme color while it parses the document and never revisits
 * it, so on an iPhone the strip holding the clock and the battery keeps the old
 * skin until the page is loaded again -- and unlike most browser quirks this one
 * cannot be measured, because nothing in the page can read back what color the
 * phone painted. So it is asked about the engine instead, which is the thing
 * that actually differs: any browser on iOS is Safari's engine underneath,
 * whatever its name is, and Chrome and Firefox on Android both follow along.
 */
export function chromeFollowsAlong() {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent || "";
  const iOS =
    /\b(iPad|iPhone|iPod)\b/.test(ua) ||
    // iPads have reported themselves as desktop Macs for years. A Mac with a
    // touchscreen is the tell, since none exist.
    (/\bMacintosh\b/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return false;
  // Safari on a Mac has the same habit, and there the bar is the browser's own
  // toolbar rather than the phone's status bar.
  // No closing word boundary on these: the string is "Chrome/128", "Edg/128",
  // and a boundary after "Chrom" is exactly what a following "e" is not.
  const webkit = /\bSafari\b/.test(ua) && !/Chrom|Edg|OPR|Android/.test(ua);
  return !webkit;
}

/** Whether that skin paints a dark page, which the browser needs told. */
export function isDark(value) {
  return skinById(value).dark === true;
}
