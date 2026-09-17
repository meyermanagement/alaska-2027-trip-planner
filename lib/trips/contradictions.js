// Circumstances that cannot both be true.
//
// This is the loud half of the changes work, and it is built the way the passport
// warning is built rather than the way tips are built. Every rule here is
// subtraction: two facts the family has already written down, compared, with no
// model anywhere near it. So it is worked out fresh on every page draw, it is
// never stored, it can never be stale, and it cannot be dismissed — putting the
// rabies date in on the animal's card is what makes it go away, because the
// arithmetic stops being true.
//
// The bar for being in this file is deliberately high, and it is not "this is
// important". It is: could a reasonable person look at the trip and the
// circumstance side by side and disagree that they contradict. A wheelchair added
// to a trip with a booked catamaran is important and is not in here, because
// whether that boat can take a chair is a question with an answer nobody in this
// codebase has. A dog on a sailing that takes no dogs is in here, because the
// sailing takes no dogs.
//
// Everything that does not clear that bar is advice, and advice goes through the
// look, where it can be argued with and waved off.

import { formatDayYear } from "@/lib/format";

const text = (value) => String(value ?? "").trim();
const day = (value) => formatDayYear(value) || text(value);

/** Whether any booked line on this trip is a sailing. */
function sailings(itinerary = []) {
  return (itinerary || []).filter(
    (item) => text(item?.category).toLowerCase() === "cruise",
  );
}

/**
 * The animal papers that have to outlast the trip, and what each is called in a
 * sentence. Coggins is left out on purpose: it is a horse's blood test and horses
 * are not carried on the kinds of booking this rule can see.
 */
const PAPERS = [
  ["rabies_expiration", "rabies certificate"],
  ["health_certificate_expiration", "health certificate"],
];

/**
 * Everything on this trip that cannot be true at once.
 *
 * @param {object} input
 * @param {object} input.trip
 * @param {Array}  input.itinerary  the trip's booked lines
 * @param {Array}  input.pets       pet rows for the animals on this trip
 * @param {Array}  input.petLinks   trip_pets rows for this trip
 * @param {string} input.today
 * @returns {Array} [{id, headline, detail}] worst first
 */
export function tripContradictions({
  trip = null,
  itinerary = [],
  pets = [],
  petLinks = [],
  today = null,
} = {}) {
  const out = [];
  if (!trip) return out;

  // A trip already behind us cannot be fixed by any of this.
  const back = text(trip.end_date);
  if (back && today && back < today) return out;

  const onTrip = new Set(
    (petLinks || []).map((link) => text(link?.pet_id)).filter(Boolean),
  );
  const animals = (pets || []).filter((pet) => onTrip.has(text(pet?.id)));
  if (!animals.length) return out;

  const boats = sailings(itinerary);
  for (const pet of animals) {
    const name = text(pet?.name) || "The animal";

    // A cruise line carries service animals and carries nothing else. This is the
    // one animal rule that is a contradiction rather than a caution: it is the
    // line's own policy, it is the same on every line, and the consequence is
    // being turned away at the terminal with the animal.
    if (boats.length && pet?.is_service_animal !== true) {
      out.push({
        id: `pet-cruise-${pet.id}`,
        severity: "contradiction",
        label: "Not allowed aboard",
        headline: `${name} is on this trip, and cruise lines carry no pets.`,
        detail: `${boats.length === 1 ? "The sailing" : "The sailings"} on this trip ${boats.length === 1 ? "is" : "are"} ${boats
          .map((item) => text(item.title) || "a sailing")
          .slice(0, 2)
          .join(
            ", ",
          )}. Only a documented service animal boards; a pet needs somewhere to stay for the whole trip, booked before you go.`,
      });
    }

    // Paperwork that runs out mid-trip. Exactly the passport rule, applied to the
    // animal: the certificate is valid on the day you leave, so nothing looks
    // wrong until somebody at a counter does the subtraction.
    for (const [column, said] of PAPERS) {
      const expiry = text(pet?.[column]);
      if (!expiry || !back) continue;
      if (expiry >= back) continue;
      out.push({
        id: `pet-paper-${pet.id}-${column}`,
        severity: "contradiction",
        label: "Papers run out",
        headline: `${name}'s ${said} expires ${day(expiry)}, before you are home on ${day(back)}.`,
        detail: `A ${said} is checked on the way out and on the way back, and the return leg is the one that catches families out. It has to be renewed before you go.`,
      });
    }
  }

  return out;
}
