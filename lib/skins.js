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
    id: "daybreak",
    name: "Daybreak Aurora",
    tag: "The same light, seen in the morning",
    blurb:
      "Midnight Aurora with the night taken out. The wash survives as a cool dawn haze over pale ice paper, panels are frosted glass instead of dark glass, and the coast still glows — in a deeper teal that holds up against white. A version you can read in a car at noon.",
    // The two dots the swatch shows: the ground, then the accent.
    swatch: ["#eff5f5", "#0a7a6b"],
    // What the phone paints its own bar with, above the app: the page's own
    // ground. The header floats over that ground at four-fifths opacity and
    // blurs what is behind it, so the ground is the honest answer -- and it
    // means the bar and the top of the page are one continuous surface rather
    // than two shades of nearly the same thing.
    bar: "#eff5f5",
    // What the phone's bar is painted with instead while the band about the trip
    // in progress is on screen: that band's own color, which is the skin's
    // accent. See BAND_COOKIE below.
    band: "#0a7a6b",
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
    band: "#3fdfbe",
    dark: true,
  },
  {
    id: "journal",
    name: "Field Journal",
    tag: "Cream paper, spruce ink",
    blurb:
      "The one the app wore first, and its default until Daybreak Aurora took over. Warm paper with a printed tooth to it, brown-black ink, one deep spruce accent, photographs printed as duotones, and a contour drawing of the coast pressed faintly behind every trip.",
    swatch: ["#f2ead9", "#1b5a4c"],
    bar: "#f2ead9",
    band: "#1b5a4c",
    dark: false,
  },
  {
    id: "frost",
    name: "Frostglass",
    tag: "Frosted panes, a pale mesh, wide corners",
    blurb:
      "The lightest of the five. Frosted panes floating over a pale mesh of cyan, lilac and blush — the aurora reduced to weather on a window — with an indigo accent that stays legible in daylight and photographs sitting under the glass rather than behind the type.",
    swatch: ["#f7f8fb", "#4239c9"],
    bar: "#f7f8fb",
    band: "#4239c9",
    dark: false,
  },
  {
    id: "sodium",
    name: "Sodium",
    tag: "A warm night, lit from the street",
    blurb:
      "Night again, but lit by sodium rather than sky. Near-black warmed toward brown, an amber wash coming up from the bottom edge the way a town does, copper hairlines, and the trip name carrying some weight against it.",
    swatch: ["#100c0a", "#f2a54a"],
    bar: "#100c0a",
    band: "#f2a54a",
    dark: true,
  },
];

/**
 * What a person gets when they have never chosen.
 *
 * It was Field Journal, on the reasonable ground that an account which has never
 * been to Settings should see the app as it has always looked. Daybreak Aurora
 * now, on the better ground that it is the one to be seen in: it is the version
 * that survives a phone held at arm's length in daylight, which is where a
 * travel app is actually read, and it is the only skin that is both bright
 * enough for a car at noon and cool enough not to fight the photographs. First
 * in the list above as well as first by default, with Midnight Aurora directly
 * under it as the same light after dark.
 *
 * The order of SKINS is the order of the picker, and the order of the picker is
 * an opinion. Nothing reads it as a ranking except a person deciding, which is
 * exactly who it is for.
 */
export const DEFAULT_SKIN = "daybreak";

/**
 * Where the browser is told which skin to paint before the app loads.
 *
 * The name carries a generation, and it has just been bumped from the unsuffixed
 * original. This cookie is not a hint the app double-checks -- it is the only
 * thing the blocking script in the head can read, so it is in practice the whole
 * answer for the first paint, and middleware only fills it when it is missing.
 * That is right while a person's skin can only be changed by that person, and it
 * was wrong exactly once: when every profile row was reassigned to Daybreak
 * Aurora underneath them, three browsers went on holding a year-long cookie
 * naming a skin nobody was set to any more, and would have kept painting it
 * until the cookie expired in 2027.
 *
 * Renaming it is the cheap fix. No browser has one under the new name, so each
 * one asks the database once and is told the truth. The alternative -- checking
 * the cookie against the profile row -- buys a database read on every navigation
 * to catch a thing that happens when a migration reassigns the column, which is
 * approximately never.
 *
 * Bump it again if the column is ever rewritten underneath people again. The old
 * cookie is cleared in middleware rather than left to rot.
 */
export const SKIN_COOKIE = "alyeska-skin-2";

/** The name it had before that, cleared on sight so it does not sit for a year. */
export const SKIN_COOKIE_STALE = ["alyeska-skin"];

/**
 * Whether the band about the trip in progress is on screen -- remembered in a
 * cookie so the phone's own bar can be painted to match it before the page is
 * drawn.
 *
 * The band is solid accent and it is welded to the top of the page, so the strip
 * the phone paints above it -- the status bar and the ground either side of the
 * Dynamic Island -- has to be the same color or the band reads as a loose panel
 * with a gap above it. That is exactly what it looked like: cream phone bar,
 * accent band, a seam between them that showed up worst mid-scroll.
 *
 * A cookie rather than a query, because the color has to be decided in the head
 * before anything paints: mobile Safari settles the theme color while it parses
 * the document and never looks at that tag again, so a color chosen after
 * hydration arrives a whole page load late. The band's own component writes this
 * cookie while it is mounted and clears it when it goes, and the blocking script
 * in the layout reads it -- see components/TripBandChrome.js.
 *
 * It is a hint about what is on screen and nothing more: forged, stale or
 * missing, the worst it can do is paint the phone's bar the wrong one of two
 * colors the app already ships.
 */
export const BAND_COOKIE = "alyeska-band";

/** Whether that cookie is currently set. */
export function bandShowing() {
  if (typeof document === "undefined") return false;
  return new RegExp(`(?:^|; )${BAND_COOKIE}=1`).test(document.cookie);
}

/** The color the phone's bar should be wearing right now, for that skin. */
export function barColor(value, band = bandShowing()) {
  const skin = skinById(value);
  return band ? skin.band || skin.bar : skin.bar;
}

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
 * The tag has to exist for this to work, and it does: the blocking script in
 * app/layout.js makes one while the document is being parsed, which is also what
 * the very first frame uses.
 *
 * That script makes it rather than the layout declaring it, and that is load
 * bearing. A tag rendered through the viewport export belongs to React, and this
 * function removes the tag -- so the next time React touched the head, which is
 * every client navigation, it threw on a node that had moved, and the app either
 * froze or reloaded itself. Do not put themeColor back in the viewport export.
 *
 * While the band about the trip in progress is on screen the bar wears that
 * band's color instead of the page's ground, so that the two are one surface
 * rather than two. Which is asked here rather than passed in, so that changing
 * skin mid-trip cannot repaint the bar back to cream and reopen the seam.
 */
export function paintChrome(value) {
  if (typeof document === "undefined") return;
  const skin = skinById(value);
  const color = barColor(skin.id);
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
  fresh.setAttribute("content", color);
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
