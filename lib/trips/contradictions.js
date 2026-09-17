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
import { isComing } from "@/lib/pets/pets";
import { speciesProfile } from "@/lib/pets/species";

const text = (value) => String(value ?? "").trim();
const day = (value) => formatDayYear(value) || text(value);
const kind = (item) => text(item?.category).toLowerCase();

/** Whether any booked line on this trip is a sailing. */
function sailings(itinerary = []) {
  return (itinerary || []).filter((item) => kind(item) === "cruise");
}

/**
 * How this trip gets there, as far as the itinerary admits.
 *
 * Status is deliberately not consulted. Every rule in this file is about a plan
 * that cannot work, and a plan is at its most fixable while it is still a draft --
 * a rule that waited for the flight to be booked would go off after the money was
 * spent, which is the one moment it is no use. So an unbooked flight counts as a
 * flight, and a trip that is nothing but intentions still gets told.
 */
function waysThere(itinerary = []) {
  const kinds = new Set((itinerary || []).map(kind));
  return {
    flying: kinds.has("flight"),
    // Anything that could plausibly carry an animal over the ground. A trailer
    // does not appear in the itinerary as its own kind, so a transport line is
    // the only signal the family has driving in mind.
    ground: kinds.has("transport"),
  };
}

/** Whether this species can go by air at all, cabin or hold. */
function canFly(species) {
  const styles = speciesProfile(species).styles || [];
  return styles.includes("cabin") || styles.includes("cargo");
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

  // Coming, not merely linked. Every animal on the trip has a trip_pets row
  // whatever is happening to it, because a dog staying at a kennel is a decision
  // the family made about this trip and wants written down -- so the link on its
  // own says nothing about whether the animal is going anywhere. Reading only the
  // link is how a horse booked into a barn for the week was being warned it could
  // not board a ship it was never going near, and one wrong warning of that kind
  // costs the whole panel its credibility.
  const coming = new Set(
    (petLinks || [])
      .filter((link) => isComing(text(link?.arrangement)))
      .map((link) => text(link?.pet_id))
      .filter(Boolean),
  );
  const animals = (pets || []).filter((pet) => coming.has(text(pet?.id)));
  if (!animals.length) return out;

  const boats = sailings(itinerary);
  const ways = waysThere(itinerary);
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

    // An animal that cannot fly, on a trip whose only way there is a flight.
    //
    // This clears the bar for this file for the same reason the cruise rule does:
    // it needs no policy nobody here has. A horse does not go in a cabin or a
    // hold on any airline, the family has said it is coming, and the only line
    // between home and the destination is a flight. Those three facts cannot all
    // stand, and which one gives is a decision only the family can make -- take
    // the trailer, leave the animal at the barn, or go somewhere reachable.
    //
    // A transport line anywhere on the trip silences it, because that is the
    // family saying they have ground travel in mind and this file does not get to
    // second-guess a plan it can see.
    if (ways.flying && !ways.ground && !canFly(pet?.species)) {
      const profile = speciesProfile(pet?.species);
      const how = (profile.styles || []).includes("trailer")
        ? "a trailer"
        : "a vehicle";
      out.push({
        id: `pet-air-${pet.id}`,
        severity: "contradiction",
        label: "Cannot get there",
        headline: `${name} is coming, and the only way to this trip is a flight.`,
        detail: `Nothing about ${name} travels by air — no cabin and no hold — so this trip needs ${how} instead, or ${name} needs somewhere to stay for the whole of it. Adding a drive to the itinerary settles it either way. Worth deciding now rather than after the flights are paid for.`,
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
