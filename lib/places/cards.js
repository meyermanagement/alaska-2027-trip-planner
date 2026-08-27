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
