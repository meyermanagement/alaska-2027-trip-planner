// A rating floor is a number, so the app can hold it rather than hope.
//
// Mark saved "Restaurants should have a minimum 4.5 rating on google" and got
// back a shortlist chosen for "upscale restaurant service", which is not what
// the sentence says and is not even correlated with it: a 4.8 taco stand passes
// the rule and fails the invention, a 4.1 hotel dining room does the reverse.
//
// Telling the model to read the sentence literally is worth doing and is done
// elsewhere, but it cannot be the whole answer here, because the model does not
// know the ratings. It picks names; the rating arrives afterwards, from Google,
// when the card is enriched. So the only place the floor can actually be
// enforced is here, after the lookup and before the card is drawn -- and the
// honest thing to do with a place that misses it is to say so on the card
// rather than to quietly drop a place the family may still want.

// The kinds a floor can be about, and the words that say which.
const ABOUT = [
  [
    "eat",
    /restaurant|restaurants|dining|dine|eat|eating|food|meal|meals|cafe|cafes|bar|bars/i,
  ],
  [
    "stay",
    /hotel|hotels|resort|resorts|stay|stays|staying|accommodation|accommodations|lodging|inn|inns/i,
  ],
  [
    "do",
    /activity|activities|tour|tours|excursion|excursions|attraction|attractions|museum|museums|thing to do|things to do/i,
  ],
];

// "minimum 4.5 rating", "at least a 4.5 rating on Google", "4.5+ on google",
// "rated 4.5 or higher", "nothing below 4.3 stars".
const FLOOR =
  /(?:minimum(?:\s+of)?|at\s+least|no\s+(?:lower|less)\s+than|nothing\s+below|above|over|rated|rating\s+of)\s*(?:a\s+)?(\d(?:\.\d)?)|(\d(?:\.\d)?)\s*(?:\+|or\s+(?:higher|above|better|more|up))/i;

// It has to be about a rating and not about anything else that carries a
// number. "At least 3 nights" and "no more than 4 hours in the car" are not
// rating floors, and reading them as one would put a warning on every card.
const RATED = /\brating|ratings|rated|stars?|google\b/i;

function floorIn(body) {
  const said = String(body || "");
  if (!RATED.test(said)) return null;
  const hit = FLOOR.exec(said);
  if (!hit) return null;
  const n = Number.parseFloat(hit[1] ?? hit[2]);
  // A five-point scale. Anything outside it is a price, a night count or a year.
  if (!Number.isFinite(n) || n < 3 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

/**
 * The rating floors the family has actually saved, per kind of place.
 *
 * A floor that names no kind applies to all of them, which is what somebody
 * means by "nothing below 4.4 on Google". Where two preferences reach the same
 * kind, the higher floor wins: they set both, so both hold.
 */
export function ratingFloors(preferences = []) {
  const floors = { eat: null, stay: null, do: null };
  for (const p of Array.isArray(preferences) ? preferences : []) {
    const body = p?.body;
    const floor = floorIn(body);
    if (!floor) continue;
    const said = `${String(p?.topic || "")} ${String(p?.topics || "")} ${String(body)}`;
    const kinds = ABOUT.filter(([, pattern]) => pattern.test(said)).map(
      ([kind]) => kind,
    );
    for (const kind of kinds.length ? kinds : Object.keys(floors)) {
      if (floors[kind] === null || floor > floors[kind]) floors[kind] = floor;
    }
  }
  return floors;
}

/** Whether any floor was saved at all. */
export function hasFloors(floors) {
  return Boolean(floors && Object.values(floors).some((n) => n));
}

/**
 * Every card, told whether it clears the floor the family set for its kind.
 *
 * Only ever set when a rating is actually known: an unrated place has not
 * failed anything, and a warning on a card with no number on it would be the
 * app inventing a fault.
 */
export function withRatingFloor(places = [], floors = null) {
  if (!hasFloors(floors)) return places || [];
  return (Array.isArray(places) ? places : []).map((place) => {
    const floor = floors[place?.kind];
    if (!floor || !place?.rating) return place;
    return place.rating < floor ? { ...place, belowFloor: floor } : place;
  });
}

// The kinds, in words, for a sentence about the ones that were left off.
const KIND_WORD = {
  eat: ["restaurant", "restaurants"],
  stay: ["place to stay", "places to stay"],
  do: ["thing to do", "things to do"],
};

/**
 * The floor, enforced rather than annotated.
 *
 * Warning on the card was the first attempt and it was not what was asked for:
 * a floor is a rule, and a shortlist that shows a 4.3 hotel with a note saying
 * it is a 4.3 hotel has still put it in front of them. So anything Google
 * reports below the floor comes out of the shortlist here, and the reply says
 * which ones went and why -- which is the part that keeps this honest, because
 * a name that vanishes with no explanation is a filter nobody can argue with.
 */
export function applyFloors(places = [], floors = null) {
  const all = Array.isArray(places) ? places : [];
  if (!hasFloors(floors)) return { places: all, dropped: [] };
  const kept = [];
  const dropped = [];
  for (const place of all) (place?.belowFloor ? dropped : kept).push(place);
  return { places: kept, dropped };
}

/**
 * Whether they have said, in writing, what to do when nothing clears the floor.
 *
 * Only ever said back to them when a saved preference actually says it: this is
 * the family's own rule about looking at rentals when no hotel reaches the
 * number, and inventing it for somebody who never wrote it down would be the
 * same widening this file exists to stop.
 */
export function rentalFallback(preferences = []) {
  for (const p of Array.isArray(preferences) ? preferences : []) {
    const body = String(p?.body || "");
    if (!floorIn(body)) continue;
    if (/airbnb|vrbo|vacation rental|rental home|rentals?\b/i.test(body)) {
      return /vrbo/i.test(body) && !/airbnb/i.test(body) ? "Vrbo" : "Airbnb";
    }
  }
  return null;
}

/**
 * The sentence that goes with the ones that were left off.
 *
 * Says the number Google gave, so the family can see the call rather than take
 * it on trust, and offers the way on when their own preference names one and
 * nothing of that kind survived.
 */
export function floorDropLine(
  dropped = [],
  { kept = [], fallback = null } = {},
) {
  const gone = Array.isArray(dropped) ? dropped.filter((p) => p?.rating) : [];
  if (!gone.length) return "";
  const byKind = new Map();
  for (const place of gone) {
    const list = byKind.get(place.kind) || [];
    list.push(place);
    byKind.set(place.kind, list);
  }
  const parts = [];
  for (const [kind, list] of byKind) {
    const [one, many] = KIND_WORD[kind] || ["place", "places"];
    const named = list
      .map((p) => `${p.name} (${p.rating.toFixed(1)})`)
      .join(", ");
    const floor = list[0].belowFloor;
    parts.push(
      `${list.length === 1 ? `One ${one}` : `${list.length} ${many}`} came back below the ${floor} you asked for, so ${list.length === 1 ? "it is" : "they are"} not on the list: ${named}.`,
    );
  }
  // Nothing of that kind left, and a written rule about what to do next.
  const survived = new Set(
    (Array.isArray(kept) ? kept : []).map((p) => p?.kind),
  );
  const emptied = [...byKind.keys()].filter((kind) => !survived.has(kind));
  if (fallback && emptied.includes("stay")) {
    parts.push(
      `No hotel on that list reached your ${floorFor(byKind.get("stay"))}, and your own note says that is when you would look on ${fallback} — say the word and I will.`,
    );
  }
  return parts.join(" ");
}

function floorFor(list) {
  return list?.[0]?.belowFloor ?? "";
}

/** What the card says about a place that misses the floor. */
export function belowFloorLine(place) {
  if (!place?.belowFloor || !place?.rating) return null;
  return `${place.rating.toFixed(1)} on Google — below the ${place.belowFloor} you asked for`;
}

/**
 * The floors as a sentence for the model, so the shortlist is aimed at the
 * number before the lookup rather than corrected after it.
 */
export function ratingFloorLine(preferences = []) {
  const floors = ratingFloors(preferences);
  if (!hasFloors(floors)) return "";
  const said = [
    floors.eat ? `restaurants at ${floors.eat} or better` : null,
    floors.stay ? `places to stay at ${floors.stay} or better` : null,
    floors.do ? `things to do at ${floors.do} or better` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `RATING FLOORS THEY HAVE SET, AS NUMBERS: ${said} on Google. Aim the shortlist at the number: name places you are confident sit above it, and say the rating in your reply when you know it. It is a floor on the rating and nothing else -- not a hint about price, formality, quiet or service, so a 4.8 taco stand clears it and a 4.1 hotel dining room does not. The app checks every card against these floors once Google has answered and TAKES OFF the ones that miss, naming them and their rating in the reply, so a shortlist you fill with places that turn out to be below the line arrives at them half empty. Name places you are confident clear it. If you have a real reason to suggest one below the line anyway, say so in your words -- the card will still be removed, and your sentence is then the only place they hear about it.`;
}
