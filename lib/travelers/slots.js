// The list of things worth knowing about a person before Aly recommends anything.
//
// This is the ledger's vocabulary, and it is deliberately code rather than a
// table: a question is a product decision that changes with the prompt that reads
// it, and a migration to add one is a migration nobody writes.
//
// Each slot says what it is for in a sentence Aly is actually shown, because
// "pace" on its own produces a question about walking speed. The `why` is the
// part that keeps her honest -- it names the recommendation the answer changes,
// so she can decide the slot is not worth a turn today, and so a person who asks
// why she wants to know gets a true answer.
//
// Two kinds, and the difference matters more than the count:
//
//   taste  an opinion. Can be derived from a choice, can be wrong, is always
//          rewritable, and Aly may hedge on it.
//   fact   not an opinion. Asked plainly and stored verbatim in household_facts.
//          Never inferred from a picture, never softened into a preference.
//
// A ledger row is only written once a slot is touched, so adding a slot here
// costs nothing and asks nobody anything until they next talk to Aly.

export const SLOT_KINDS = ["taste", "fact"];

export const SLOTS = [
  {
    id: "pace",
    kind: "taste",
    label: "How full a day should be",
    why: "Decides whether a day gets three things or one, and whether Aly leaves an afternoon empty on purpose.",
  },
  {
    id: "mornings",
    kind: "taste",
    label: "Early or late starts",
    why: "Decides whether the good thing goes at 8 AM before the crowd or at 4 PM after a slow morning.",
  },
  {
    id: "doing_or_seeing",
    kind: "taste",
    label: "Doing something or looking at something",
    why: "Decides between a kayak and a viewpoint, a cooking class and a cathedral.",
  },
  {
    id: "weather",
    kind: "taste",
    label: "Heat, cold and rain",
    why: "Decides what to move indoors, and whether a scenic day in the cold is a treat or an ordeal.",
  },
  {
    id: "crowds",
    kind: "taste",
    label: "Crowds, queues and noise",
    why: "Decides between the famous place at noon and the quiet one at nine, and rules out loud rooms.",
  },
  {
    id: "food",
    kind: "taste",
    label: "What they will actually eat",
    why: "Decides whether a restaurant is worth suggesting at all, and how adventurous a menu can be.",
  },
  {
    id: "evenings",
    kind: "taste",
    label: "How late the day runs",
    why: "Decides whether dinner is at six or nine, and whether an evening thing is worth booking.",
  },
  {
    id: "comfort",
    kind: "taste",
    label: "Where money is worth spending",
    why: "Decides whether to spend on the room, the meal, the seat or the tour when the budget will not cover all four.",
  },
  {
    id: "downtime",
    kind: "taste",
    label: "Planned or loose",
    why: "Decides how much of a day Aly fills in advance and how much she leaves for the family to decide on the morning.",
  },
  {
    id: "limits",
    kind: "fact",
    label: "Anything they cannot do",
    hard: true,
    why: "Allergies, medical limits, mobility, altitude, seasickness. Rules rather than taste, and getting one wrong hurts somebody.",
  },
  {
    id: "languages",
    kind: "fact",
    label: "Languages spoken or read",
    why: "Decides whether Aly warns you a place has no English menu, and who can do the asking.",
  },
];

export const SLOT_IDS = SLOTS.map((s) => s.id);
export const SLOT_BY_ID = new Map(SLOTS.map((s) => [s.id, s]));

/** True for slots whose answers are rules, not opinions. */
export const HARD_SLOTS = new Set(SLOTS.filter((s) => s.hard).map((s) => s.id));

/** The table a settled answer for this slot lands in. */
export function tableForSlot(id) {
  const slot = SLOT_BY_ID.get(id);
  if (!slot) return null;
  return slot.kind === "fact" ? "household_facts" : "travel_preferences";
}

export function slotLabel(id) {
  return SLOT_BY_ID.get(id)?.label || id;
}

export const SLOT_STATUSES = ["open", "asking", "settled", "skipped"];
