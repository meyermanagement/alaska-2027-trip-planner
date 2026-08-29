/**
 * Which way the family leans about getting around, read from what they wrote.
 *
 * Transportation preferences are free text. The one on file reads:
 *
 *   "Prefer renting a car or uber/taxi over public transportation unless it's a
 *    European train"
 *
 * That single sentence is why this file is not a keyword match. It names three
 * things, and a keyword reader would see "car" and "public transportation" and
 * conclude the family likes both. It has a direction ("over"), and an exception
 * with a condition attached ("unless it's a European train"). Getting the
 * direction backwards would put a subway at the top of the list for a family who
 * wrote down that they would rather drive -- a screen answering a question they
 * did not ask.
 *
 * So the rule here is: read the grammar that carries the direction, and when the
 * sentence does not contain any of it, return nothing. `unknown` is a supported
 * answer and a much better one than a confident guess. Nothing downstream is
 * allowed to treat an unread preference as an objection.
 */

/** The modes the day screen can offer. Ride-hailing times as driving. */
export const MODES = ["walk", "transit", "drive"];

// Terms per mode. Longest first within each list, because "public transportation"
// must be found before "transport" and "rental car" before "car".
const TERMS = {
  transit: [
    "public transportation",
    "public transport",
    "public transit",
    "mass transit",
    "underground",
    "commuter rail",
    "light rail",
    "streetcar",
    "monorail",
    "subway",
    "transit",
    "metro",
    "tram",
    "train",
    "trains",
    "rail",
    "bus",
    "buses",
    "ferry",
    "ferries",
  ],
  drive: [
    "rental car",
    "rent a car",
    "renting a car",
    "hire car",
    "rideshare",
    "ride share",
    "car service",
    "driving",
    "drive",
    "uber",
    "lyft",
    "taxi",
    "taxis",
    "cab",
    "cabs",
    "car",
  ],
  walk: ["on foot", "walking", "walkable", "walks", "walk"],
};

/** Phrases that mean "the thing before me is preferred to the thing after me". */
const OVER = [
  " over ",
  " rather than ",
  " instead of ",
  " ahead of ",
  " in preference to ",
  " not ",
];

/** Phrases that mean the modes near them are wanted. */
const UP = [
  "prefer",
  "prefers",
  "prefered",
  "preferred",
  "we like",
  "i like",
  "we love",
  "i love",
  "happy to",
  "would rather",
  "always",
];

/** Phrases that mean the modes near them are not wanted. */
const DOWN = [
  "avoid",
  "avoids",
  "rather not",
  "would not",
  "wouldn't",
  "don't want",
  "dont want",
  "do not want",
  "no need for",
  "never",
  "dislike",
  "hate",
  "not keen",
];

/**
 * Reasons a long walk is the wrong suggestion, whether or not walking is named.
 *
 * "We will have a stroller with us" says nothing about walking and everything
 * about it. The general reader needs a mode to attach a direction to, so these
 * phrases carry their own: they mean walk, down, and they mean it without the
 * word.
 */
const MOBILITY = [
  "too much walking",
  "a lot of walking",
  "long walks",
  "cannot walk",
  "can't walk",
  "cant walk",
  "limited mobility",
  "mobility issue",
  "bad knee",
  "bad knees",
  "bad hip",
  "bad back",
  "sore feet",
  "wheelchair",
  "stroller",
  "pushchair",
];

/** Words that open an exception, and everything after one is the exception. */
const UNLESS = [" unless ", " except ", " apart from ", " other than "];

function normalize(text) {
  return ` ${String(text || "")
    .toLowerCase()
    // Curly apostrophes are what a phone types, and "it's" has to match "it's".
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/**
 * Every mode named in a fragment, with where it was named.
 *
 * Position matters: "A over B" is only readable if we know which side each mode
 * fell on.
 */
export function modesIn(fragment) {
  const text = normalize(fragment);
  const found = new Map();
  for (const mode of MODES) {
    for (const term of TERMS[mode]) {
      const at = text.indexOf(` ${term} `);
      // A slash list -- "uber/taxi" -- is one token to the regex above, so also
      // look for the term bounded by slashes.
      const alt = at === -1 ? text.indexOf(`/${term}`) : -1;
      const alt2 = at === -1 && alt === -1 ? text.indexOf(`${term}/`) : -1;
      const hit = at !== -1 ? at : alt !== -1 ? alt : alt2;
      if (hit === -1) continue;
      // Keep the earliest mention of the mode, whichever term found it.
      if (!found.has(mode) || hit < found.get(mode)) found.set(mode, hit);
    }
  }
  return found;
}

function splitOnce(text, markers) {
  for (const marker of markers) {
    const at = text.indexOf(marker);
    if (at !== -1)
      return {
        before: text.slice(0, at),
        after: text.slice(at + marker.length),
        marker: marker.trim(),
      };
  }
  return null;
}

const FILLER = new Set([
  "it's",
  "its",
  "that",
  "this",
  "when",
  "they",
  "them",
  "with",
  "have",
  "from",
  "were",
  "there",
]);

/**
 * Does an exception apply where the family is?
 *
 * Whole-word equality is not enough: the exception on file says "European" and
 * the place is described as "Europe". So a word matches when either is a prefix
 * of the other, which pairs European/Europe and Italian/Italy without pairing
 * anything unrelated at four characters or more.
 */
export function exceptionFits(when, place) {
  const words = normalize(when)
    .split(" ")
    .filter((w) => w.length > 3 && !FILLER.has(w));
  const there = normalize(place)
    .split(" ")
    .filter((w) => w.length > 3);
  return words.some((w) =>
    there.some(
      (p) => w.startsWith(p.slice(0, 4)) || p.startsWith(w.slice(0, 4)),
    ),
  );
}

/**
 * Read an exception clause back as a noun phrase.
 *
 * The stored text is the tail of a sentence -- "it's a European train" -- and
 * dropped into "your exception for ..." it read as "your exception for it's a
 * European train". The leading pronoun is the only thing in the way.
 */
export function tidy(when) {
  return (
    String(when || "")
      // A phone types a curly apostrophe and the pattern below expects a straight
      // one, which is how "it's a European train" survived the tidy untouched.
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/^(it'?s|it is|its|that'?s|they'?re|they are)\s+/i, "")
      .replace(/^(a|an|the)\s+/i, "")
      .trim()
  );
}

/**
 * The tail of the original sentence after a marker, with its capitals intact.
 *
 * Case-insensitive because the family types "Unless" as often as "unless", and the
 * marker was found in a lowercased copy.
 */
export function rawTail(body, marker) {
  const raw = String(body || "");
  const at = raw.toLowerCase().indexOf(String(marker || "").toLowerCase());
  if (at === -1) return null;
  return raw.slice(at + String(marker).length).trim() || null;
}

function saidNear(text, phrases) {
  return phrases.some((p) => text.includes(p));
}

/**
 * Read one written preference.
 *
 * @returns {{ up: string[], down: string[], when: string|null, read: boolean }}
 *   `read` false means the sentence mentioned modes but said nothing about
 *   direction, so it is deliberately left alone. `when` carries the text of an
 *   exception, for a caller that knows where the family is going to test against.
 */
export function readOne(body) {
  const text = normalize(body);
  const blank = { up: [], down: [], when: null, read: false };
  if (!text.trim()) return blank;

  // An exception comes off first, so "unless it's a European train" does not get
  // read as part of the main clause and flip the whole sentence.
  const carved = splitOnce(text, UNLESS);
  const main = carved ? carved.before : text;
  const exception = carved ? carved.after : null;
  // Matching needs the text folded flat; showing it back to the family does not.
  // Read from the normalized copy, the family's own "unless it's a European train"
  // came back as "european train" -- our own screen correcting their capital
  // letter, in a sentence quoting them.
  const asWritten = carved ? rawTail(body, carved.marker) : null;

  // Mobility comes before everything else. It is not a preference between modes,
  // it is a fact about the family, and it should not need the word "walk" in the
  // sentence to be heard.
  if (saidNear(main, MOBILITY))
    return {
      up: [],
      down: ["walk"],
      when: null,
      whenModes: [],
      read: true,
    };

  const comparison = splitOnce(main, OVER);
  let up = [];
  let down = [];

  if (comparison) {
    // "A over B" -- the winner is whatever is on the left, the loser on the right.
    up = [...modesIn(comparison.before).keys()];
    down = [...modesIn(comparison.after).keys()];
    // "prefer walking over driving" names walking on both counts if a term is
    // shared; the left side wins ties.
    down = down.filter((m) => !up.includes(m));
  } else {
    const named = [...modesIn(main).keys()];
    if (!named.length) return blank;
    if (saidNear(main, DOWN)) down = named;
    else if (saidNear(main, UP)) up = named;
    else return { ...blank, when: exception };
  }

  if (!up.length && !down.length) return { ...blank, when: exception };

  // The exception, if there is one, argues for whatever it names -- and against
  // nothing, because "unless X" is a door held open rather than one closed.
  const exceptionModes = exception ? [...modesIn(exception).keys()] : [];

  return {
    up,
    down,
    when: exception && exceptionModes.length ? exception.trim() : null,
    whenSaid: exceptionModes.length ? asWritten : null,
    whenModes: exceptionModes,
    read: true,
  };
}

/**
 * Read the whole set of written preferences into one lean.
 *
 * @param bodies  the text of every preference under getting-around
 * @returns {{ up: Set, down: Set, exceptions: [{ modes, when }], read: boolean }}
 */
export function readLean(bodies = []) {
  const up = new Set();
  const down = new Set();
  const exceptions = [];
  let read = false;

  for (const body of bodies) {
    const one = readOne(body);
    if (!one.read) continue;
    read = true;
    one.up.forEach((m) => up.add(m));
    one.down.forEach((m) => down.add(m));
    if (one.when && one.whenModes?.length)
      exceptions.push({
        modes: one.whenModes,
        when: one.when,
        said: one.whenSaid || one.when,
      });
  }

  // Said both ways across two sentences: no lean, rather than a coin toss.
  for (const mode of [...up])
    if (down.has(mode)) (up.delete(mode), down.delete(mode));

  return { up, down, exceptions, read };
}

/**
 * How the family feels about one mode, in one place.
 *
 * @param lean  from readLean
 * @param mode  "walk" | "transit" | "drive"
 * @param place free text for where they are -- city, region, country
 * @returns {{ rank: number, why: string|null }} rank 1 wanted, 0 neutral, -1 not
 */
export function leanOn(lean, mode, place = "") {
  if (!lean?.read) return { rank: 0, why: null };

  // An exception outranks the general rule, which is the whole point of writing
  // one. "unless it's a European train" has to beat "prefer a car over public
  // transportation" in Rome, or the sentence had no effect at all.
  const here = normalize(place);
  for (const ex of lean.exceptions || []) {
    if (!ex.modes.includes(mode)) continue;
    if (exceptionFits(ex.when, here))
      return { rank: 1, why: `your exception for ${tidy(ex.said || ex.when)}` };
  }

  if (lean.down.has(mode)) return { rank: -1, why: "you would rather not" };
  if (lean.up.has(mode)) return { rank: 1, why: "how you prefer to travel" };
  return { rank: 0, why: null };
}
