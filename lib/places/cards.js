// Recommendations you can look at, not just read.
//
// A paragraph naming five restaurants is a research task handed back to the
// person who asked: they still have to type each name into Maps, work out where
// it is, decide whether it looks right, and then come back and dictate the one
// they chose. So a recommendation is a card - a photo, where it is, why it was
// suggested, a link to the place itself, a link to the map, and a button that
// puts it on the itinerary.
//
// The model fills these in by calling show_places. Nothing here writes anything:
// a card is an answer, not a change, and it goes nowhere near the confirmation
// machinery. Picking one is what starts a change, and the person picks.

const KINDS = new Set(["eat", "stay", "do"]);

// What each kind is called in front of a human.
export const KIND_LABELS = {
  eat: "Place to eat",
  stay: "Place to stay",
  do: "Thing to do",
};

/**
 * Which list a place belongs on.
 *
 * A shortlist that is only the things this family would like leaves out the
 * thing the city is known for; a shortlist that is only the famous things is a
 * guidebook and could have been written for anybody. Both belong on the screen,
 * and the family should be able to see at a glance which is which -- "we picked
 * this because you rated the last one five stars" and "everybody goes here" are
 * different kinds of claim and should not be read off the same list.
 */
const GROUPS = new Set(["popular", "for_you"]);

/** The headings, in the order the lists appear. */
export const GROUP_ORDER = ["popular", "for_you"];

export const GROUP_LABELS = {
  popular: "Most popular",
  for_you: "For you",
};

// One short line under each heading, because two lists with no explanation
// invite the question of what the difference is, and the difference is the point.
export const GROUP_NOTES = {
  popular: "What the place is known for",
  for_you: "Picked from what the app knows about you",
};

const MAX_PLACES = 6;

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A link to the place on a map, without needing anyone's API key.
 *
 * Worth having even when a photo lookup is unavailable: it is one tap to
 * photos, hours, reviews and directions, from the app everyone already has.
 */
export function mapsLink(name, area) {
  const what = [text(name, 120), text(area, 80)].filter(Boolean).join(" ");
  if (!what) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(what)}`;
}

// A website the model volunteered. Only http(s), and never a Google redirect
// dressed up as the restaurant's own site.
function website(value) {
  const said = text(value, 300);
  if (!said) return null;
  let url;
  try {
    url = new URL(said);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (
    /(^|\.)(google\.com|googleusercontent\.com|vertexaisearch\.cloud\.google\.com)$/i.test(
      url.hostname,
    )
  ) {
    return null;
  }
  return url.toString();
}

function rating(value) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

/**
 * One place, cleaned up. Returns null when there is not enough to show.
 */
export function normalizePlace(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = text(raw.name, 120);
  if (!name) return null;
  const kind = KINDS.has(raw.kind) ? raw.kind : "do";
  const area = text(raw.area, 80);
  return {
    name,
    // Absent is allowed and common: a single ungrouped shortlist is still a fine
    // answer, and an older stored card has no group on it at all.
    group: GROUPS.has(raw.group) ? raw.group : null,
    kind,
    area: area || null,
    why: text(raw.why, 280) || null,
    price: text(raw.price, 24) || null,
    rating: rating(raw.rating),
    website: website(raw.website),
    maps: mapsLink(name, area),
    // Filled in later, by whatever can find a picture. Absent is a fine answer:
    // a photograph of the wrong building is worse than no photograph.
    photo: null,
  };
}

/**
 * The places from one show_places call: cleaned, deduplicated by name, capped.
 */
export function normalizePlaces(args) {
  const list = Array.isArray(args?.places) ? args.places : [];
  const seen = new Set();
  const places = [];
  for (const raw of list) {
    const place = normalizePlace(raw);
    if (!place) continue;
    const key = place.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}

/**
 * Words that do not distinguish one place from another.
 *
 * A model asked twice about the same trip does not repeat itself exactly. It
 * offers "Quinta da Regaleira" and then "Quinta da Regaleira Guided Tour",
 * "Livraria Bertrand" and then "Livraria Bertrand - Chiado", "Benagil Cave &
 * Dolphin Watching Boat Tour" and then "Private Dolphin & Cave Cruise". Those
 * are one place each. Matching on the exact name leaves all three pairs on
 * screen twice, which is what the family sees.
 */
const NOT_THE_PLACE = new Set([
  "a",
  "an",
  "and",
  "at",
  "boat",
  "by",
  "centre",
  "center",
  "cruise",
  "da",
  "de",
  "do",
  "dos",
  "e",
  "el",
  "experience",
  "from",
  "guided",
  "in",
  "la",
  "las",
  "los",
  "of",
  "on",
  "private",
  "ride",
  "riding",
  "the",
  "tickets",
  "tour",
  "tours",
  "trip",
  "visit",
  "y",
]);

/** The part of a name that actually names the place. */
function nameTokens(name) {
  return new Set(
    String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !NOT_THE_PLACE.has(word)),
  );
}

/**
 * Two names for the same place.
 *
 * One being contained in the other is the shape this takes -- an added district,
 * an added "Guided Tour", a dropped "Private" -- so a subset is a match. Two
 * significant words are required before that counts, or every "Lisbon X" would
 * swallow every other "Lisbon Y".
 */
function samePlace(a, b) {
  const one = nameTokens(a);
  const two = nameTokens(b);
  const [small, big] = one.size <= two.size ? [one, two] : [two, one];
  if (small.size < 2)
    return small.size === 1 && big.size === 1 && [...small][0] === [...big][0];
  for (const word of small) if (!big.has(word)) return false;
  return true;
}

/**
 * One shortlist out of two, without the same place on it twice.
 *
 * Whichever name arrived first is the one kept, because it is the one already
 * spoken about; anything the second one knew that the first did not is filled in
 * behind it.
 */
export function mergePlaces(first, second) {
  const places = [];
  for (const place of [].concat(first || [], second || [])) {
    if (!place?.name) continue;
    const already = places.find((kept) => samePlace(kept.name, place.name));
    if (already) {
      for (const field of [
        "why",
        "area",
        "group",
        "price",
        "photo",
        "website",
        "rating",
      ]) {
        if (
          already[field] === null ||
          already[field] === undefined ||
          already[field] === ""
        ) {
          already[field] = place[field] ?? already[field];
        }
      }
      continue;
    }
    places.push({ ...place });
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}

/**
 * The shortlist as the lists it should be read as.
 *
 * Returns one unlabeled group when there is nothing to split: everything in one
 * group, or no groups at all. A lone "For you" heading is worse than no heading,
 * because it says a "Most popular" list exists somewhere and was withheld.
 */
export function groupPlaces(places) {
  const list = (Array.isArray(places) ? places : []).filter((p) => p?.name);
  if (!list.length) return [];
  const held = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    note: GROUP_NOTES[group],
    places: list.filter((place) => place.group === group),
  })).filter((section) => section.places.length);
  // Anything the model left ungrouped, or grouped as something we do not know,
  // is still an answer and is shown rather than dropped.
  const loose = list.filter((place) => !GROUPS.has(place.group));
  if (held.length < 2) {
    return [{ group: null, label: null, note: null, places: list }];
  }
  if (loose.length) {
    held.push({
      group: null,
      label: "Also worth a look",
      note: null,
      places: loose,
    });
  }
  return held;
}

/**
 * Pull the show_places calls out of a model reply.
 *
 * They are separated before anything else looks at the calls, because every other
 * tool describes a change to the family's data and this one describes an answer.
 * Letting it through the validator would file it as a proposal nobody asked for.
 */
export function splitPlaceCalls(calls) {
  const kept = [];
  let places = [];
  for (const call of Array.isArray(calls) ? calls : []) {
    if (call?.name === "show_places") {
      places = places.concat(normalizePlaces(call.args));
    } else if (call) {
      kept.push(call);
    }
  }
  // Two calls in one reply - eating and doing, say - are one shortlist.
  return { calls: kept, places: places.slice(0, MAX_PLACES) };
}

/**
 * What tapping "Tell me more" should ask on the family's behalf.
 *
 * A card is a shortlist entry, not an answer about the place: three lines about
 * why it suits them is where the interest starts rather than where it ends. This
 * asks the question they would otherwise type out one-fingered.
 */
export function moreRequest(place) {
  const name = text(place?.name, 120);
  if (!name) return "";
  const where = text(place?.area, 80);
  return `Tell me more about ${name}${where ? ` in ${where}` : ""} — what it is like, what it costs, whether it needs booking, and anything that would put us off.`;
}

/** What tapping "Add to itinerary" should say on the family's behalf. */
export function addRequest(place) {
  const name = text(place?.name, 120);
  if (!name) return "";
  const where = text(place?.area, 80);
  const what =
    place?.kind === "stay"
      ? "as where we are staying"
      : place?.kind === "eat"
        ? "as a meal"
        : "as an activity";
  return `Add ${name}${where ? ` (${where})` : ""} to the itinerary ${what}. Ask me which day if you are not sure.`;
}
