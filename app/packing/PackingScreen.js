"use client";

import { useMemo, useState } from "react";
import PackIndex from "./PackIndex";
import Templates from "./Templates";
import PetTemplates from "./PetTemplates";
import HouseTasks from "./HouseTasks";

/**
 * The packing screen, arranged as an index and one panel.
 *
 * The three things this screen holds -- the family's packing templates, each
 * animal's list, and the household's departure list -- used to be three stacked
 * sections, with the templates carrying a switcher of their own halfway down. So
 * the page was long, the switcher was somewhere in the middle of it, and there
 * was nothing anywhere that said what lists the family had.
 *
 * Selection lives here rather than inside Templates so that one column can point
 * at all three kinds of list. The panel is keyed on the choice: switching lists
 * should not carry a half-typed row or an open editor across with it.
 */
export default function PackingScreen({
  travelers = [],
  people = [],
  familyTemplates = [],
  items = [],
  tripsByTemplate = {},
  packedTrips = [],
  pets = [],
  petTemplates = [],
  petItems = [],
  tripsByPet = {},
  houseTasks = [],
}) {
  const base =
    familyTemplates.find((t) => t.is_base) || familyTemplates[0] || null;
  const first = base
    ? `t:${base.id}`
    : pets.length
      ? `p:${pets[0].id}`
      : "house";
  const [picked, setPicked] = useState(first);

  const groups = useMemo(() => {
    const out = [];
    if (familyTemplates.length) {
      out.push({
        label: "Lists",
        rows: familyTemplates.map((t) => ({
          key: `t:${t.id}`,
          label: t.name,
          count: items.filter((i) => i.template_id === t.id).length,
        })),
      });
    }
    // Only animals that have a list; one is made when the pet is added, so a pet
    // without one is an error worth showing rather than a row worth hiding.
    const withList = pets.filter((p) =>
      petTemplates.some((t) => t.pet_id === p.id),
    );
    if (withList.length) {
      out.push({
        label: "Animals",
        rows: withList.map((p) => {
          const template = petTemplates.find((t) => t.pet_id === p.id);
          return {
            key: `p:${p.id}`,
            label: p.name,
            dot: p.color || "var(--teal)",
            count: petItems.filter((i) => i.template_id === template?.id)
              .length,
          };
        }),
      });
    }
    out.push({
      label: "The house",
      rows: [
        {
          key: "house",
          label: "Leaving the house",
          count: houseTasks.length,
        },
      ],
    });
    return out;
  }, [familyTemplates, items, pets, petTemplates, petItems, houseTasks]);

  // With no family templates at all, Templates is the screen: it offers to build
  // the first one out of a trip the family has already packed for, and an index
  // pointing at one animal and the house would bury that offer.
  if (!familyTemplates.length && !pets.length) {
    return (
      <>
        <Templates
          travelers={travelers}
          templates={familyTemplates}
          items={items}
          tripsByTemplate={tripsByTemplate}
          packedTrips={packedTrips}
        />
        <HouseTasks tasks={houseTasks} people={people} />
      </>
    );
  }

  const kind = picked.slice(0, 1);
  const id = picked.slice(2);

  return (
    <div className="lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      <PackIndex groups={groups} picked={picked} onPick={setPicked} />
      <div className="min-w-0">
        {picked === "house" ? (
          <HouseTasks tasks={houseTasks} people={people} />
        ) : kind === "p" ? (
          <PetTemplates
            key={picked}
            pets={pets.filter((p) => p.id === id)}
            templates={petTemplates}
            items={petItems}
            people={people}
            tripsByPet={tripsByPet}
            solo
          />
        ) : (
          <Templates
            key={picked}
            travelers={travelers}
            templates={familyTemplates}
            items={items}
            tripsByTemplate={tripsByTemplate}
            packedTrips={packedTrips}
            selectedId={id}
            controlled
          />
        )}
      </div>
    </div>
  );
}
