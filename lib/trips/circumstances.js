// What the trip was planned against, and what has drifted since.
//
// A trip is planned against circumstances that are not written on the trip: who
// was coming, how old they were, what each of them can and cannot do, which
// animals were in the party, where the family lives. None of that is a field on
// the trip, and all of it is editable somewhere else — the Family tab, a pet's
// card, the roster widget. So the trip goes on being a plan for a household that
// no longer exists, and nothing on the screen says so.
//
// The fix is a fingerprint. When a trip is looked at, it records the
// circumstances it was looked at under. Every later page draw takes the
// fingerprint again from live rows and compares. A difference is not an error and
// is never a model call: it is two sorted lists that no longer match, said out
// loud in one sentence, with a button to look again.
//
// What this deliberately does not do is grade the change. Whether a wheelchair
// matters to a booked catamaran is a judgement, and judgement is what the look is
// for. This file only knows that something is different from what was assumed.

import { formatDayYear } from "@/lib/format";

/**
 * Bumped when the shape below changes in a way that would make an old snapshot
 * read as a change. An old fingerprint is discarded rather than diffed, which
 * costs one silent stamp and never invents a change nobody made.
 */
export const SNAPSHOT_VERSION = 1;

const text = (value) => String(value ?? "").trim();
const sorted = (values) =>
  [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))]
    .sort()
    .slice(0, 20);

/** A name the sentence can use, whatever state the row is in. */
const nameOf = (row, fallback) => text(row?.name) || fallback;

/**
 * The circumstances a trip is planned against, as a stable, comparable object.
 *
 * Ids sort everything, so two snapshots of an unchanged household are equal
 * whatever order the rows came back in. Only fields that could change the plan
 * are in here: a person's color and their sort order are not circumstances.
 *
 * @param {object} input
 * @param {Array}  input.people     traveler rows for the whole family
 * @param {Array}  input.going      traveler ids on this trip
 * @param {Array}  input.pets       pet rows for the whole family
 * @param {Array}  input.petLinks   trip_pets rows for this trip
 * @param {Array}  input.facts      household_facts rows (limits) for the family
 * @param {string} input.home       the family's home address
 */
export function circumstanceSnapshot({
  people = [],
  going = [],
  pets = [],
  petLinks = [],
  facts = [],
  home = null,
} = {}) {
  const onTrip = new Set((going || []).map(text).filter(Boolean));
  const limits = new Map();
  for (const fact of facts || []) {
    const key = text(fact?.traveler_id) || "everyone";
    if (!limits.has(key)) limits.set(key, []);
    limits.get(key).push(text(fact?.body));
  }

  const roster = (people || [])
    .filter(
      (person) => person?.is_person !== false && onTrip.has(text(person?.id)),
    )
    .map((person) => ({
      id: text(person.id),
      name: nameOf(person, "Someone"),
      born: text(person.date_of_birth) || null,
      aids: sorted(person.mobility_aids),
      notes: text(person.accessibility_notes).slice(0, 500) || null,
      limits: sorted(limits.get(text(person.id))),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const links = new Map(
    (petLinks || []).map((link) => [text(link?.pet_id), link]),
  );
  const animals = (pets || [])
    .filter((pet) => links.has(text(pet?.id)))
    .map((pet) => ({
      id: text(pet.id),
      name: nameOf(pet, "The animal"),
      species: text(pet.species) || null,
      service: pet.is_service_animal === true,
      weightLb: Number.isFinite(Number(pet.weight_lb))
        ? Number(pet.weight_lb)
        : null,
      arrangement: text(links.get(text(pet.id))?.arrangement) || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    version: SNAPSHOT_VERSION,
    people: roster,
    pets: animals,
    // Everybody's limits, whoever they belong to: a rule filed against the
    // household is as capable of contradicting a booking as one filed against a
    // person.
    shared: sorted(limits.get("everyone")),
    home: text(home) || null,
  };
}

const listed = (values) => {
  const items = values.filter(Boolean);
  if (items.length <= 1) return items[0] || "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
};

/** The word for an aid, so a sentence reads as English rather than as a column. */
const aidSaid = (aid) => text(aid).replace(/_/g, " ");

function peopleChanges(before, after, out) {
  const was = new Map((before.people || []).map((p) => [p.id, p]));
  const now = new Map((after.people || []).map((p) => [p.id, p]));

  for (const person of after.people || []) {
    if (!was.has(person.id))
      out.push({
        id: `joined-${person.id}`,
        said: `${person.name} was added to this trip.`,
      });
  }
  for (const person of before.people || []) {
    if (!now.has(person.id))
      out.push({
        id: `left-${person.id}`,
        said: `${person.name} is no longer on this trip.`,
      });
  }

  for (const person of after.people || []) {
    const old = was.get(person.id);
    if (!old) continue;

    const gained = person.aids.filter((aid) => !old.aids.includes(aid));
    const lost = old.aids.filter((aid) => !person.aids.includes(aid));
    if (gained.length)
      out.push({
        id: `aid-on-${person.id}`,
        said: `This trip was planned before ${listed(gained.map(aidSaid))} was added for ${person.name}.`,
      });
    if (lost.length)
      out.push({
        id: `aid-off-${person.id}`,
        said: `${listed(lost.map(aidSaid))} is no longer recorded for ${person.name}.`,
      });

    if (text(person.notes) !== text(old.notes))
      out.push({
        id: `notes-${person.id}`,
        said: old.notes
          ? `What ${person.name} needs from a day has been rewritten since this trip was planned.`
          : `${person.name} now has accessibility notes that this trip was planned without.`,
      });

    const added = person.limits.filter((limit) => !old.limits.includes(limit));
    if (added.length)
      out.push({
        id: `limits-${person.id}`,
        said: `${person.name} has ${added.length === 1 ? "a new limit" : `${added.length} new limits`} on file since this trip was planned.`,
      });

    if (text(person.born) !== text(old.born) && person.born)
      out.push({
        id: `born-${person.id}`,
        said: `${person.name}'s date of birth has changed to ${formatDayYear(person.born) || person.born}, which is what ticket ages and car seats are worked out from.`,
      });
  }
}

function petChanges(before, after, out) {
  const was = new Map((before.pets || []).map((p) => [p.id, p]));
  const now = new Map((after.pets || []).map((p) => [p.id, p]));

  for (const pet of after.pets || []) {
    if (!was.has(pet.id))
      out.push({
        id: `pet-on-${pet.id}`,
        said: `${pet.name} is coming on this trip, and was not part of the plan.`,
      });
  }
  for (const pet of before.pets || []) {
    if (!now.has(pet.id))
      out.push({
        id: `pet-off-${pet.id}`,
        said: `${pet.name} is no longer on this trip.`,
      });
  }
  for (const pet of after.pets || []) {
    const old = was.get(pet.id);
    if (!old) continue;
    if (pet.arrangement !== old.arrangement)
      out.push({
        id: `pet-how-${pet.id}`,
        said: `How ${pet.name} travels has changed since this trip was planned.`,
      });
    if (pet.service !== old.service)
      out.push({
        id: `pet-service-${pet.id}`,
        said: pet.service
          ? `${pet.name} is now recorded as a service animal, which carries different rights from a pet.`
          : `${pet.name} is no longer recorded as a service animal.`,
      });
  }
}

/**
 * The sentences that say what has drifted, newest concern first.
 *
 * An empty list is the normal answer and the screen shows nothing at all for it.
 * A missing or older-versioned snapshot also returns nothing: a trip that has
 * never been stamped has no assumption to have broken.
 */
export function changesBetween(before, after) {
  if (!before || before.version !== SNAPSHOT_VERSION) return [];
  if (!after || after.version !== SNAPSHOT_VERSION) return [];

  const out = [];
  peopleChanges(before, after, out);
  petChanges(before, after, out);

  const sharedAdded = (after.shared || []).filter(
    (limit) => !(before.shared || []).includes(limit),
  );
  if (sharedAdded.length)
    out.push({
      id: "limits-everyone",
      said: `The family has ${sharedAdded.length === 1 ? "a new limit" : `${sharedAdded.length} new limits`} that holds for everybody.`,
    });

  if (text(after.home) !== text(before.home) && after.home)
    out.push({
      id: "home",
      said: "Home has moved, which changes the airports and the drive times this trip was planned around.",
    });

  return out;
}

/** Most sentences a band will say before it stops and hands over to the look. */
export const MAX_SAID = 3;
