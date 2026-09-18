"use client";

import { useState } from "react";
import PickBand from "@/components/PickBand";
import People from "./People";
import Pets from "./Pets";

/**
 * The Family screen, arranged as a band of chips and one card.
 *
 * Every person's card carries their documents, their trips and their travel
 * facts, and every animal's card carries its paperwork -- so the screen was one
 * long stack and the way to reach Veda was to scroll past everybody in front of
 * her. Here the family is a row of chips at the top, with the two Add actions
 * drawn dashed at the end of it, and the card below is whoever is on.
 *
 * The two warning panels stay where they are: a passport that expires before a
 * trip, or a rabies certificate that does, is not something to find only by
 * opening the right card.
 */
export default function FamilyScreen({
  familyId,
  // Where the household lives, passed through to the person editor so the
  // "Sports and teams" drawer on the About-you questions offers local teams.
  homeLat = null,
  homeLon = null,
  userId,
  userEmail,
  travelers = [],
  documents = [],
  trips = [],
  rosters = [],
  warnings = [],
  pets = [],
  tripPets = [],
  ledgers = {},
}) {
  const first = travelers.length
    ? `p:${travelers[0].id}`
    : pets.length
      ? `a:${pets[0].id}`
      : "new-person";
  const [picked, setPicked] = useState(first);
  const [momentState, setMomentState] = useState({ dirty: false, busy: false });

  const rows = [
    ...travelers.map((t) => ({
      key: `p:${t.id}`,
      label: t.name,
      dot: t.color || null,
    })),
    ...pets.map((a, i) => ({
      key: `a:${a.id}`,
      label: a.name,
      dot: a.color || "var(--teal)",
      // A hairline where the people end, so an animal does not read as one.
      divider: i === 0 && travelers.length > 0,
    })),
    { key: "new-person", label: "+ Add a person", ghost: true, divider: true },
    { key: "new-pet", label: "+ Add an animal", ghost: true },
  ];

  const id =
    picked.startsWith("p:") || picked.startsWith("a:") ? picked.slice(2) : "";
  const onPerson = picked.startsWith("p:");
  const onPet = picked.startsWith("a:");

  const band = (
    <PickBand
      label="Who"
      hint={`${travelers.length + pets.length} in the family`}
      rows={rows}
      picked={picked}
      onPick={(next) => {
        if (next === picked || momentState.busy) return;
        if (momentState.dirty && !window.confirm("Switch profiles without saving your unfinished moment? Moments you already saved will be kept.")) return;
        setMomentState({ dirty: false, busy: false });
        setPicked(next);
      }}
    />
  );

  return (
    <>
      <People
        onMomentStateChange={setMomentState}
        familyId={familyId}
        userId={userId}
        userEmail={userEmail}
        travelers={travelers}
        documents={documents}
        trips={trips}
        rosters={rosters}
        warnings={warnings}
        ledgers={ledgers}
        homeLat={homeLat}
        homeLon={homeLon}
        picker={band}
        only={onPerson ? id : ""}
        addOpen={picked === "new-person"}
        onAddDone={() => setPicked(first)}
      />
      <Pets
        familyId={familyId}
        pets={pets}
        trips={trips}
        tripPets={tripPets}
        bare
        only={onPet ? id : ""}
        addOpen={picked === "new-pet"}
        onAddDone={() => setPicked(first)}
      />
    </>
  );
}
