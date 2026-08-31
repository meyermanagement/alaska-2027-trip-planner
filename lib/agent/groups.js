// Proposals arrive as one flat list, which reads badly when a pasted itinerary
// turns into forty rows. This splits them into chunks the family can approve one
// at a time: everything touching the packing list together, everything touching
// the itinerary together, and so on. Removals are always their own chunk, so a
// single delete can never ride along inside a wall of harmless additions.

const CATEGORIES = [
  {
    key: "trips",
    label: "Trips",
    removalLabel: "Trips to delete",
    tools: ["create_trip", "update_trip", "delete_trip"],
  },
  {
    key: "itinerary",
    label: "Itinerary",
    removalLabel: "Itinerary items to remove",
    tools: [
      "add_itinerary_item",
      "update_itinerary_item",
      "delete_itinerary_item",
    ],
  },
  {
    key: "packing",
    label: "Packing list",
    removalLabel: "Packing items to remove",
    wipeLabel: "Empty the packing list",
    tools: [
      "start_packing_list",
      "add_packing_item",
      "update_packing_item",
      "delete_packing_item",
      "clear_packing_list",
      "tidy_packing_list",
    ],
  },
  {
    key: "templates",
    label: "Packing templates",
    removalLabel: "Packing template items to remove",
    tools: [
      "create_template",
      "rename_template",
      "add_template_item",
      "update_template_item",
      "delete_template_item",
      "propagate_templates",
      // Which add-on lists a trip is built from belongs with the templates
      // rather than with the trip's own packing rows: it changes nothing on the
      // list today, it changes what the list is generated from and which
      // template edits reach it.
      "set_trip_templates",
    ],
  },
  {
    key: "tasks",
    label: "Pre-travel checklist",
    removalLabel: "Checklist items to remove",
    tools: ["add_task", "update_task", "delete_task"],
  },
  {
    key: "reviews",
    label: "Ratings & reviews",
    removalLabel: "Reviews to clear",
    tools: ["update_review"],
  },
  {
    key: "preferences",
    label: "Travel preferences",
    removalLabel: "Preferences to remove",
    tools: ["add_preference", "update_preference", "delete_preference"],
  },
  {
    key: "people",
    label: "Who can sign in",
    removalLabel: "Sign-in access to remove",
    tools: ["set_person_email", "invite_person"],
  },
  {
    key: "pets",
    label: "Pets",
    removalLabel: "Pets to remove",
    tools: ["add_pet", "update_pet", "delete_pet", "set_pet_trip"],
  },
  {
    key: "profiles",
    label: "People's details",
    removalLabel: "Details to clear",
    tools: ["set_person_details"],
  },
  {
    key: "lessons",
    label: "What Aly remembers",
    removalLabel: "Notes to stop using",
    tools: ["record_lesson", "retire_lesson"],
  },
  {
    key: "notes",
    label: "Notes",
    removalLabel: "Notes to remove",
    tools: ["add_note"],
  },
];

// Whole-list actions: one approval that clears everything of its kind.
export const WIPE_TOOLS = new Set(["clear_packing_list"]);

function rank(group) {
  if (group.wipes) return 0;
  return group.destructive ? 2 : 1;
}

const CATEGORY_BY_TOOL = new Map();
for (const c of CATEGORIES) {
  for (const t of c.tools) CATEGORY_BY_TOOL.set(t, c);
}

const OTHER = {
  key: "other",
  label: "Other changes",
  removalLabel: "Other removals",
  tools: [],
};

export function groupActions(actions) {
  const list = Array.isArray(actions) ? actions : [];
  const buckets = new Map();

  for (const action of list) {
    const category = CATEGORY_BY_TOOL.get(action?.tool) || OTHER;
    const destructive = Boolean(action?.destructive);
    // Emptying a whole list is its own decision, kept apart even from other
    // removals, because everything else in its category depends on it.
    const wipes = WIPE_TOOLS.has(action?.tool);
    const key = wipes
      ? `${category.key}:wipe`
      : destructive
        ? `${category.key}:remove`
        : category.key;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: wipes
          ? category.wipeLabel || category.removalLabel
          : destructive
            ? category.removalLabel
            : category.label,
        destructive,
        wipes,
        category: category.key,
        order: CATEGORIES.indexOf(category),
        actions: [],
      });
    }
    buckets.get(key).actions.push(action);
  }

  // Declaration order, with each category's removals right after its additions,
  // so the card reads in the same order as the tabs across the top of the app.
  const groups = [...buckets.values()].sort((a, b) => {
    const ao = a.order < 0 ? CATEGORIES.length : a.order;
    const bo = b.order < 0 ? CATEGORIES.length : b.order;
    if (ao !== bo) return ao - bo;
    // A wipe comes first within its category: applying the new list before the
    // old one is emptied would throw the new list away.
    return rank(a) - rank(b);
  });

  // A chunk that fills a brand-new trip cannot be saved before the trip itself
  // is. Naming that dependency here lets the panel keep it waiting its turn.
  const beingCreated = new Set();
  for (const group of groups) {
    for (const action of group.actions) {
      if (action?.createsTrip) beingCreated.add(action.createsTrip);
    }
  }
  for (const group of groups) {
    const needed = group.actions.map((a) => a?.needsTrip).find(Boolean) || null;
    group.needsTrip = needed && beingCreated.has(needed) ? needed : null;
  }

  // Anything that adds to a list being emptied has to wait for the emptying,
  // or it would be wiped by it.
  const wiped = new Set(groups.filter((g) => g.wipes).map((g) => g.category));
  for (const group of groups) {
    group.waitsForWipe =
      !group.wipes && !group.destructive && wiped.has(group.category);
  }

  return groups;
}
