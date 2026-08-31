/**
 * Pets, and the handful of facts about one that change a trip.
 *
 * This file is deliberately about travel rather than about animals. A pet's
 * weight is here because it decides whether it flies under a seat or not at
 * all; its rabies date is here because it can stop the pet at a counter. Its
 * favorite toy is a note, not a field.
 */

import { formatDayYear } from "@/lib/format";
import { PAPERS, sexPhrase, speciesProfile } from "./species";
export { PAPERS, sexPhrase, speciesHasPaper, speciesProfile } from "./species";

export const SPECIES = [
  { id: "dog", label: "Dog" },
  { id: "cat", label: "Cat" },
  { id: "bird", label: "Bird" },
  { id: "rabbit", label: "Rabbit" },
  { id: "guinea_pig", label: "Guinea pig" },
  { id: "ferret", label: "Ferret" },
  { id: "reptile", label: "Reptile" },
  { id: "fish", label: "Fish" },
  { id: "horse", label: "Horse" },
  { id: "other", label: "Other" },
];

export function speciesLabel(id) {
  return SPECIES.find((s) => s.id === id)?.label || "Pet";
}

// How this animal actually gets somewhere. Worth asking once, because it is the
// difference between "which hotels take dogs" and "who is feeding her while we
// are away", and Aly should not have to guess which conversation she is in.
export const TRAVEL_STYLES = [
  {
    id: "cabin",
    label: "In the cabin",
    hint: "Small enough to fly under the seat in a carrier",
  },
  {
    id: "cargo",
    label: "As cargo",
    hint: "Too big for the cabin; flies in the hold, where fewer airlines will take one",
  },
  {
    id: "car_only",
    label: "By car only",
    hint: "Road trips yes, flights no",
  },
  {
    id: "trailer",
    label: "By trailer",
    hint: "Hauled to shows and stables; a flight is a specialist freight arrangement, not a booking",
  },
  {
    id: "stays_home",
    label: "Usually stays home",
    hint: "Plan boarding or a sitter instead",
  },
];

export function travelStyleLabel(id) {
  return TRAVEL_STYLES.find((s) => s.id === id)?.label || "";
}

/**
 * The ways of travelling worth offering for one kind of animal.
 *
 * Offering a horse "In the cabin" is not a harmless extra option -- it tells the
 * person filling the form that the app does not know what a horse is, and after
 * that they stop believing the rest of the answers.
 */
export function travelStylesFor(species) {
  const profile = speciesProfile(species);
  return profile.styles
    .map((id) => TRAVEL_STYLES.find((s) => s.id === id))
    .filter(Boolean)
    .map((style) => ({ ...style, ...(profile.styleLabels?.[style.id] || {}) }));
}

// An animal's sex, and whether it has been spayed or neutered.
//
// A closed list here, unlike the same word on a person, because this one is a box
// on a form somebody else wrote. Every boarding kennel, every health certificate
// and every airline pet manifest asks for exactly these, and many kennels will
// not take an animal that has not been fixed at all. A free-text answer is a form
// that gets filled in twice.
//
// "Unknown" is a real answer rather than a missing one -- a rescue arrives with
// paperwork that does not say -- so it is stored, and it stops the app asking
// again.
export const PET_SEXES = [
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
  { id: "unknown", label: "Unknown" },
];

export const PET_SEX_KEYS = PET_SEXES.map((s) => s.id);

export function petSexLabel(id) {
  return PET_SEXES.find((s) => s.id === id)?.label || "";
}

/**
 * How the two read together in a sentence: "female, spayed", "male, not
 * neutered", "spayed" when nobody recorded which. The right word depends on the
 * sex, and getting it wrong is the kind of small thing that makes an app feel
 * like it was written by somebody who has never owned an animal.
 */
export function petSexPhrase(pet) {
  if (!pet) return "";
  const sex = PET_SEX_KEYS.includes(pet.sex) ? pet.sex : null;
  const fixed =
    typeof pet.is_sterilized === "boolean" ? pet.is_sterilized : null;
  return sexPhrase(pet.species, sex, fixed);
}

// What is happening to this pet on this particular trip. A pet staying behind
// still needs a decision made and a booking, so "not coming" is an arrangement.
export const ARRANGEMENTS = [
  { id: "coming", label: "Coming with us", traveling: true },
  { id: "boarding", label: "Boarding", traveling: false },
  { id: "sitter", label: "Pet sitter at home", traveling: false },
  { id: "family", label: "Staying with family or friends", traveling: false },
  { id: "undecided", label: "Not decided yet", traveling: false },
];

export function arrangementLabel(id) {
  return ARRANGEMENTS.find((a) => a.id === id)?.label || "Not decided yet";
}

export function isComing(arrangement) {
  return ARRANGEMENTS.find((a) => a.id === arrangement)?.traveling === true;
}

/**
 * A pet's age in whole years, or months while that is still the honest unit.
 * Airlines set a minimum age — eight weeks is the usual floor — so a young
 * animal's age in weeks is the thing that matters, not its birthday.
 */
export function petAge(dobISO, todayISO) {
  const dob = parseISO(dobISO);
  const today = parseISO(todayISO);
  if (!dob || !today || dob > today) return null;
  const days = Math.floor((today - dob) / 86400000);
  if (days < 7)
    return { text: days === 1 ? "1 day old" : `${days} days old`, days };
  if (days < 84) {
    const weeks = Math.floor(days / 7);
    return { text: weeks === 1 ? "1 week old" : `${weeks} weeks old`, days };
  }
  let years = today.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < dob.getUTCMonth() ||
    (today.getUTCMonth() === dob.getUTCMonth() &&
      today.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) years -= 1;
  if (years < 1) {
    // Counted in whole calendar months rather than days divided by an average
    // month, which rounds a day short of the first birthday up to "12 months".
    let months =
      (today.getUTCFullYear() - dob.getUTCFullYear()) * 12 +
      (today.getUTCMonth() - dob.getUTCMonth());
    if (today.getUTCDate() < dob.getUTCDate()) months -= 1;
    months = Math.max(1, months);
    return {
      text: months === 1 ? "1 month old" : `${months} months old`,
      days,
    };
  }
  return { text: years === 1 ? "1 year old" : `${years} years old`, days };
}

function parseISO(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Whether a pet can fly in the cabin at all, as far as anyone can tell from
 * what we know about it.
 *
 * Deliberately vague where the truth is vague. Airlines publish a combined
 * pet-and-carrier limit, not a pet limit, and the numbers differ between
 * carriers — so this answers "is this even worth asking about" rather than
 * pretending to know one airline's rule. Twenty pounds is the cutoff most
 * commonly published for the combined weight, so a pet already over it on its
 * own is not a cabin question.
 */
export const CABIN_COMBINED_LB = 20;

export function cabinOutlook(pet) {
  // Some animals have no cabin question to answer, and telling a horse it is
  // over the airline limit was the clearest sign the form had one kind of animal
  // in mind. Where the cabin is not the question, the species says what is.
  const profile = speciesProfile(pet?.species);
  if (!profile.cabin && profile.weightVerdict) return profile.weightVerdict;
  if (pet?.is_service_animal)
    return {
      key: "service",
      text: "A trained service animal, so airline pet limits and pet fees do not apply — the airline will want the DOT service animal form instead.",
    };
  const lb = Number(pet?.weight_lb);
  if (!Number.isFinite(lb) || lb <= 0)
    return {
      key: "unknown",
      text: "Add a weight and Aly can tell you whether the cabin is realistic.",
    };
  if (lb <= 12)
    return {
      key: "likely",
      text: `At ${trimNumber(lb)} lb, comfortably under the roughly ${CABIN_COMBINED_LB} lb combined limit most airlines publish for a pet plus its carrier.`,
    };
  if (lb <= CABIN_COMBINED_LB)
    return {
      key: "borderline",
      text: `At ${trimNumber(lb)} lb, close to the roughly ${CABIN_COMBINED_LB} lb combined limit once the carrier is counted — worth checking the airline before booking.`,
    };
  return {
    key: "unlikely",
    text: `At ${trimNumber(lb)} lb, over the combined cabin limit most airlines publish, so this is a cargo or a drive-instead question.`,
  };
}

export function trimNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, "");
}

/**
 * Paperwork that will have lapsed by the time the family gets home.
 *
 * The same shape as the passport warnings, and for the same reason: a date that
 * is fine today and not fine on the return leg is the one nobody checks. A
 * health certificate is treated differently from a rabies certificate because
 * it is not a thing you renew — it has to be issued close to departure, so an
 * old one is not a warning about expiry, it is a warning to go and get a new
 * one.
 */
export function petWarnings({ trips = [], today }) {
  const out = [];
  for (const trip of trips) {
    const coming = (trip.pets || []).filter((p) => isComing(p.arrangement));
    if (!coming.length) continue;
    for (const pet of coming) {
      if (pet.is_service_animal === true && !pet.rabies_expiration) continue;
      if (!speciesHasPaperLocal(pet.species, "rabies")) {
        // A bird or a fish has no rabies certificate to have let lapse.
      } else {
        const rabies = standing({
          expiry: pet.rabies_expiration,
          returnDate: trip.end_date,
          today,
        });
        if (rabies)
          out.push({
            tripId: trip.id,
            tripName: trip.name,
            petId: pet.id,
            petName: pet.name,
            kind: "rabies",
            level: rabies.level,
            text:
              rabies.level === "missing"
                ? `No rabies date on file for ${pet.name}, and ${trip.name} needs one.`
                : `${pet.name}'s rabies certificate ${rabies.word} ${formatDayYear(rabies.when)}, ${rabies.relation} ${trip.name} gets home.`,
          });
      }
      if (speciesHasPaperLocal(pet.species, "coggins")) {
        const coggins = standing({
          expiry: pet.coggins_expiration,
          returnDate: trip.end_date,
          today,
        });
        if (coggins)
          out.push({
            tripId: trip.id,
            tripName: trip.name,
            petId: pet.id,
            petName: pet.name,
            kind: "coggins",
            level: coggins.level,
            text:
              coggins.level === "missing"
                ? `No Coggins date on file for ${pet.name}, and ${trip.name} will want one.`
                : `${pet.name}'s Coggins ${coggins.word} ${formatDayYear(coggins.when)}, ${coggins.relation} ${trip.name} gets home.`,
          });
      }
      if (
        pet.health_certificate_expiration &&
        trip.end_date &&
        pet.health_certificate_expiration < trip.end_date
      )
        out.push({
          tripId: trip.id,
          tripName: trip.name,
          petId: pet.id,
          petName: pet.name,
          kind: "health",
          level: "expires",
          text: `${pet.name}'s health certificate runs out before ${trip.name} gets home. These are issued close to departure rather than renewed, so this one will need replacing.`,
        });
    }
  }
  return out;
}

function speciesHasPaperLocal(species, key) {
  return speciesProfile(species).papers.includes(key);
}

function standing({ expiry, returnDate, today }) {
  if (!returnDate || returnDate < String(today || "")) return null;
  if (!expiry) return { level: "missing" };
  if (expiry < returnDate)
    return {
      level: "expires",
      word: "runs out",
      when: expiry,
      relation: "before",
    };
  return null;
}

/**
 * The pet lines a packing list wants. Not a guess at a whole list — the things
 * a family reliably forgets and an airline or a hotel reliably asks for.
 */
// What a pet needs on a packing list, as rows rather than sentences: the
// assignee is the pet's own name, which is what lets one animal's things be set
// aside and brought back exactly as a person's are.
export const PET_CATEGORY = "Pets";

export function packingItemsFor(pet) {
  const species = String(pet?.species || "dog");
  const items = [...(SEED_BY_SPECIES[species] || SEED_BY_SPECIES.other)];

  if (pet?.medications) items.push("Medication, with the dosing written down");
  if (pet?.travel_style === "cabin" || pet?.travel_style === "cargo")
    items.push("Airline-approved carrier");
  // Last on purpose: it is the line that gets forgotten and the one that can
  // actually stop the animal traveling. Horses are the exception — a Coggins
  // test is what gets asked for at a state line or a show gate, not rabies.
  items.push(
    species === "horse"
      ? "Coggins test and health papers"
      : "Rabies certificate and vet records",
  );
  return items.map((item) => ({ category: PET_CATEGORY, item }));
}

// What each kind of animal actually needs. Kept species by species rather than
// generated from one dog-shaped list, because handing an Arabian horse a leash,
// collapsible bowls and waste bags is the kind of thing that tells a family the
// app was not really thinking about their animal.
const SEED_BY_SPECIES = {
  dog: [
    "Food, measured for the trip",
    "Collapsible bowls",
    "Leash and spare collar with an ID tag",
    "Waste bags",
    "Bed or a familiar blanket",
  ],
  cat: [
    "Food, measured for the trip",
    "Collapsible bowls",
    "Litter and a travel tray",
    "Harness and leash",
    "Bed or a familiar blanket",
  ],
  bird: [
    "Food and treats",
    "Travel cage with a cover",
    "Water bottle and dish",
    "Cage liners",
    "Perch or a familiar toy",
  ],
  rabbit: [
    "Pellets and hay",
    "Travel carrier with a liner",
    "Water bottle",
    "Litter tray and litter",
    "Something safe to chew",
  ],
  guinea_pig: [
    "Pellets and hay",
    "Travel carrier with a liner",
    "Water bottle",
    "Bedding",
    "Vitamin C treats",
  ],
  ferret: [
    "Food, measured for the trip",
    "Travel carrier",
    "Water bottle",
    "Litter tray and litter",
    "Harness and leash",
  ],
  reptile: [
    "Food for the trip",
    "Secure travel container",
    "Heat pack or heat source",
    "Thermometer",
    "Water dish and mister",
  ],
  fish: [
    "Food for the trip",
    "Sealed transport bag or container",
    "Water conditioner",
    "Battery air pump",
    "Test kit",
  ],
  horse: [
    "Feed and hay for the trip",
    "Water buckets and a hose",
    "Halter, lead rope and a spare",
    "Grooming kit",
    "Fly spray",
    "Muck fork and shavings",
    "First aid kit and any standing wraps",
  ],
  other: [
    "Food, measured for the trip",
    "Water and a bowl or bottle",
    "Carrier or crate",
    "Bedding",
    "Waste bags or liners",
  ],
};

// The same list, written out for reading rather than for writing.
export function packingLinesFor(pet) {
  const label = pet?.name || "the pet";
  return packingItemsFor(pet).map(
    (row) =>
      `${label} \u2014 ${row.item.charAt(0).toLowerCase()}${row.item.slice(1)}`,
  );
}
