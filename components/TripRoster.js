"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MembershipChips from "./MembershipChips";
import { syncPackingForTraveler } from "@/lib/packing/roster";
import { syncPackingForPet } from "@/lib/pets/packing";
import {
  arrangementLabel,
  arrangementsFor,
  isComing,
  speciesLabel,
} from "@/lib/pets/pets";

/**
 * Who is going, and what happens to the animals. One widget, both screens.
 *
 * This used to live inside TripView, which meant it only existed once a trip was
 * real. On a draft -- the screen the app calls the trip builder, and the screen
 * where "who is actually coming" is the live question -- the roster was a single
 * grey line of text reading "Going: Mark, Steph", with no way to change it and no
 * mention of the dog at all. So the one fact a family argues about while an idea
 * is still an idea was the one fact the builder would not let them touch, and the
 * only way to change it was to ask Aly in a sentence.
 *
 * Pulling it out here rather than copying it matters: a roster tap is not just a
 * link row, it carries the packing list with it, and two copies of that logic
 * would drift within a month. The parent owns the lists so the rest of its screen
 * can read them; this owns the writing, the busy state, and the sentence
 * afterwards saying what the packing list did about it.
 *
 * On a draft nothing packs -- the sync functions enforce that themselves, so the
 * tap is recorded and the packing side waits until the trip is real.
 */
export default function TripRoster({
  trip,
  people = [],
  pets = [],
  going = [],
  onGoingChange,
  petLinks = [],
  onPetLinksChange,
  packing = [],
  readOnly = false,
  past = false,
  draft = false,
  onPackingChanged,
  className = "",
}) {
  const supabase = createClient();
  const [rosterBusy, setRosterBusy] = useState(null);
  const [petBusy, setPetBusy] = useState(null);
  // What the packing list did about it, said out loud. A list that grows by six
  // lines while you tap a name is unnerving otherwise, and the reason two of
  // somebody's things survived being taken off has to be visible to be trusted.
  const [rosterNote, setRosterNote] = useState("");
  const [petNote, setPetNote] = useState("");

  const goingNames = people
    .filter((p) => going.includes(p.id))
    .map((p) => p.name);

  // In the pets' own order, not the order the links were written, so the list
  // does not reshuffle itself every time somebody changes an arrangement.
  const petsOnTrip = pets
    .map((pet) => {
      const link = petLinks.find((l) => l.pet_id === pet.id);
      return link ? { pet, arrangement: link.arrangement || "coming" } : null;
    })
    .filter(Boolean);

  // Which animals have anything on the packing list at all, so the set-aside
  // wording only appears where there is something to set aside.
  const petsWithLines = useMemo(
    () => new Set(packing.map((p) => p.pet_id).filter(Boolean)),
    [packing],
  );

  // Who is on the trip. Tapping a name saves straight away.
  //
  // The chip hands back its own shape — { id, label, color } — not the traveler
  // it was built from, so the real person has to be looked up here. Passing the
  // chip straight through was the whole reason a roster tap on the trip page
  // never touched the packing list: the sync had no name to work with and
  // quietly did nothing, which is how somebody's things came to sit on a list
  // they were not traveling on.
  async function toggleTraveler(chip, nowGoing) {
    const person = people.find((p) => p.id === chip?.id) || chip;
    if (!person?.id || !person?.name) return;
    setRosterBusy(person.id);
    setRosterNote("");
    onGoingChange?.(
      nowGoing ? [...going, person.id] : going.filter((id) => id !== person.id),
    );
    if (nowGoing) {
      await supabase
        .from("trip_travelers")
        .insert({ trip_id: trip.id, traveler_id: person.id });
    } else {
      await supabase
        .from("trip_travelers")
        .delete()
        .eq("trip_id", trip.id)
        .eq("traveler_id", person.id);
    }
    // The roster and the packing list were two facts that only agreed at the
    // moment the trip was made. Now the tap carries both: their own lines from
    // the base list arrive with them, and go when they do.
    const sync = await syncPackingForTraveler({
      supabase,
      tripId: trip.id,
      familyId: trip.family_id,
      person,
      going: nowGoing,
    });
    if (sync.added || sync.removed) await onPackingChanged?.();
    setRosterNote(sync.message || "");
    setRosterBusy(null);
  }

  // A tap says the animal is on the trip; the arrangement that appears next to
  // it says what that means. A tap alone lands on "coming", because that is what
  // somebody tapping a pet's name on a trip almost always means, and boarding or
  // a sitter is one more choice away rather than a question up front.
  async function setPetArrangement(pet, arrangement) {
    if (!pet?.id) return;
    setPetBusy(pet.id);
    setPetNote("");

    if (!arrangement) {
      await supabase
        .from("trip_pets")
        .delete()
        .eq("trip_id", trip.id)
        .eq("pet_id", pet.id);
      onPetLinksChange?.(petLinks.filter((l) => l.pet_id !== pet.id));
    } else {
      // The row is the decision, not its absence, so changing an arrangement is
      // an upsert rather than a delete and an insert.
      const { error } = await supabase
        .from("trip_pets")
        .upsert(
          { trip_id: trip.id, pet_id: pet.id, arrangement },
          { onConflict: "trip_id,pet_id" },
        );
      if (error) {
        setPetNote(error.message);
        setPetBusy(null);
        return;
      }
      onPetLinksChange?.([
        ...petLinks.filter((l) => l.pet_id !== pet.id),
        { trip_id: trip.id, pet_id: pet.id, arrangement },
      ]);
    }

    // Their things follow them, exactly as a person's do.
    const sync = await syncPackingForPet({
      supabase,
      tripId: trip.id,
      familyId: trip.family_id,
      pet,
      arrangement: arrangement || null,
    });
    if (sync.added || sync.removed || sync.restored) await onPackingChanged?.();
    setPetNote(sync.message || sync.error || "");
    setPetBusy(null);
  }

  function togglePet(chip, nowOn) {
    // The chip only carries an id, a label and a color, so the real record has
    // to be looked up here. Passing the chip straight through is the bug that
    // once broke the roster packing sync.
    const pet = pets.find((p) => p.id === chip?.id);
    if (!pet) return;
    setPetArrangement(pet, nowOn ? "coming" : null);
  }

  if (people.length === 0 && pets.length === 0) return null;

  return (
    <div className={className}>
      {people.length > 0 && (
        <div>
          <p className="section-label">
            {past ? "Who went" : "Who is going"}
            {!readOnly && (
              <span className="no-print ml-1.5 font-normal normal-case tracking-normal">
                — tap a name to change it
              </span>
            )}
          </p>
          <div className="mt-1.5">
            <MembershipChips
              items={people.map((p) => ({
                id: p.id,
                label: p.name,
                color: p.color,
              }))}
              activeIds={going}
              busyId={rosterBusy}
              onToggle={readOnly ? null : toggleTraveler}
            />
          </div>
          {/* On a draft the roster is usually empty, and saying so is more use
              than a row of untouched names with no explanation. */}
          {draft && !readOnly && goingNames.length === 0 && (
            <p className="mt-1.5 text-[0.82rem] text-ink-soft">
              Nobody is on it yet. Tap whoever is coming — it can change as
              often as the plan does, and nothing is packed for a draft either
              way.
            </p>
          )}
          {rosterNote && (
            <p
              aria-live="polite"
              className="no-print mt-1.5 text-[0.82rem] text-ink-soft"
            >
              {rosterNote}
            </p>
          )}
          <p className="mt-1.5 hidden text-sm text-ink-soft print:block">
            {goingNames.length ? goingNames.join(", ") : "Nobody yet"}
          </p>
        </div>
      )}

      {pets.length > 0 && (
        <div className="mt-4">
          <p className="section-label">
            {past ? "Pets on this trip" : "Pets"}
            {!readOnly && (
              <span className="no-print ml-1.5 font-normal normal-case tracking-normal">
                — tap an animal to settle it for this trip, then say what is
                happening to it
              </span>
            )}
          </p>
          <div className="mt-1.5">
            <MembershipChips
              items={pets.map((p) => ({
                id: p.id,
                label: p.name,
                color: p.color,
              }))}
              activeIds={petLinks.map((l) => l.pet_id)}
              busyId={petBusy}
              onToggle={readOnly ? null : togglePet}
            />
          </div>
          {petLinks.length > 0 && (
            <div className="no-print mt-2 space-y-1.5">
              {petsOnTrip.map(({ pet, arrangement }) => (
                <div
                  key={pet.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                >
                  <span className="font-semibold">{pet.name}</span>
                  {readOnly ? (
                    // What is happening to the animal is worth knowing even for
                    // somebody who cannot decide it, so the answer stays and
                    // only the menu goes.
                    <span className="text-xs text-ink-soft">
                      {arrangementLabel(arrangement, pet.species)}
                    </span>
                  ) : (
                    <select
                      className="field py-1 text-xs"
                      style={{ width: "auto", maxWidth: "100%" }}
                      value={arrangement}
                      disabled={petBusy === pet.id}
                      onChange={(e) => setPetArrangement(pet, e.target.value)}
                      aria-label={`What happens to ${pet.name} on this trip`}
                    >
                      {arrangementsFor(pet.species).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {!isComing(arrangement) && (
                    <span className="text-xs text-ink-soft">
                      not traveling
                      {petsWithLines.has(pet.id)
                        ? " — their things are set aside, not deleted"
                        : ""}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Which animal this is, when the name alone does not say. A draft
              being worked out with a dog and a horse on it needs to know which
              is which, because the answer changes what has to be arranged. */}
          {draft && petsOnTrip.length === 0 && !readOnly && (
            <p className="mt-1.5 text-[0.82rem] text-ink-soft">
              {pets.length === 1
                ? `Say whether ${pets[0].name} is coming, boarding or staying home — the ${speciesLabel(pets[0].species).toLowerCase()} is usually the part of a plan that has to be settled first.`
                : "Say what happens to each of them — boarding and sitters are usually the part of a plan that has to be settled first."}
            </p>
          )}
          {petNote && (
            <p
              aria-live="polite"
              className="no-print mt-1.5 text-[0.82rem] text-ink-soft"
            >
              {petNote}
            </p>
          )}
          <p className="mt-1.5 hidden text-sm text-ink-soft print:block">
            {petsOnTrip.length
              ? petsOnTrip
                  .map(
                    ({ pet, arrangement }) =>
                      `${pet.name} — ${arrangementLabel(arrangement, pet.species)}`,
                  )
                  .join(", ")
              : "No pets on this trip"}
          </p>
        </div>
      )}
    </div>
  );
}
