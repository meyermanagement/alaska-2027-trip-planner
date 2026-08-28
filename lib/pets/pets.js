/**
 * Pets, and the handful of facts about one that change a trip.
 *
 * This file is deliberately about travel rather than about animals. A pet's
 * weight is here because it decides whether it flies under a seat or not at
 * all; its rabies date is here because it can stop the pet at a counter. Its
 * favorite toy is a note, not a field.
 */

import { formatDayYear } from "@/lib/format";

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
    id: "stays_home",
    label: "Usually stays home",
    hint: "Plan boarding or a sitter instead",
  },
];

export function travelStyleLabel(id) {
  return TRAVEL_STYLES.find((s) => s.id === id)?.label || "";
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
  const items = [
    "Food, measured for the trip",
    "Collapsible bowls",
    "Leash and spare collar with an ID tag",
    "Waste bags",
  ];
  if (pet?.medications) items.push("Medication");
  if (pet?.species === "cat") items.push("Litter and a travel tray");
  if (pet?.travel_style === "cabin" || pet?.travel_style === "cargo")
    items.push("Airline-approved carrier");
  // Last on purpose: it is the line that gets forgotten and the one that can
  // actually stop the animal travelling.
  items.push("Rabies certificate and vet records");
  return items.map((item) => ({ category: PET_CATEGORY, item }));
}

// The same list, written out for reading rather than for writing.
export function packingLinesFor(pet) {
  const label = pet?.name || "the pet";
  return packingItemsFor(pet).map(
    (row) =>
      `${label} \u2014 ${row.item.charAt(0).toLowerCase()}${row.item.slice(1)}`,
  );
}
