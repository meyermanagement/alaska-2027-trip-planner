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
    tools: ["add_packing_item", "update_packing_item", "delete_packing_item"],
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
    key: "notes",
    label: "Notes",
    removalLabel: "Notes to remove",
    tools: ["add_note"],
  },
];

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
    const key = destructive ? `${category.key}:remove` : category.key;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: destructive ? category.removalLabel : category.label,
        destructive,
        order: CATEGORIES.indexOf(category),
        actions: [],
      });
    }
    buckets.get(key).actions.push(action);
  }

  // Declaration order, with each category's removals right after its additions,
  // so the card reads in the same order as the tabs across the top of the app.
  return [...buckets.values()].sort((a, b) => {
    const ao = a.order < 0 ? CATEGORIES.length : a.order;
    const bo = b.order < 0 ? CATEGORIES.length : b.order;
    if (ao !== bo) return ao - bo;
    return Number(a.destructive) - Number(b.destructive);
  });
}
