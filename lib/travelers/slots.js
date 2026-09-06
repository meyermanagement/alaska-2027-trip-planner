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
// `fills` is the other half of the job. An interview that only writes preferences
// leaves the travel file as empty as it found it, and the file is what the rest of
// the app reads: languages and equipment live on the person, whether the animals
// travel lives on the animal, the airline somebody is loyal to lives on a rewards
// program. So a slot names the record its answer belongs in, and Aly is told to
// write there as well as to the preference.
//
// Two kinds, and the difference matters more than the count:
//
//   taste  an opinion. Can be derived from a choice, can be wrong, is always
//          rewritable, and Aly may hedge on it.
//   fact   not an opinion. Asked plainly and stored verbatim in household_facts.
//          Never inferred from a picture, never softened into a preference.
//
// Ten at the very most, and nine for a family with no animals. The first version
// of this list had eleven slots and asked the reason in a turn of its own, which
// is twenty-two questions -- a form, and people abandon forms. Every cut here was
// a merge rather than a loss: early starts and late nights are one question about
// the shape of a day, and how much of a day is planned is the same question as how
// full it is. What replaced them is what the file was actually missing: how they
// get around, where they sleep, and what happens to the animals.
//
// A ledger row is only written once a slot is touched, so adding a slot here
// costs nothing and asks nobody anything until they next talk to Aly.

export const SLOT_KINDS = ["taste", "fact"];

export const SLOTS = [
  {
    id: "pace",
    kind: "taste",
    label: "How full a day should be",
    why: "Decides whether a day gets three things or one, whether Aly leaves an afternoon empty on purpose, and how much she plans in advance rather than leaving to the morning.",
    fills:
      "A line in their own words on their own page, through set_person_details about_me.",
  },
  {
    id: "day_shape",
    kind: "taste",
    label: "When the day starts and ends",
    why: "Decides whether the good thing goes at 8 AM before the crowd or at 4 PM after a slow morning, and whether dinner is at six or nine.",
  },
  {
    id: "doing_or_seeing",
    kind: "taste",
    label: "Doing something or looking at something",
    why: "Decides between a kayak and a viewpoint, a cooking class and a cathedral.",
  },
  {
    id: "staying",
    kind: "taste",
    label: "Where they sleep",
    why: "Decides between a hotel and a rental with a kitchen, and what is worth paying for in a room: space, a pool, breakfast, being able to walk out the door into the middle of things.",
    fills:
      "A hotel program they are loyal to belongs in the Wallet, through add_rewards_program.",
  },
  {
    id: "getting_around",
    kind: "taste",
    label: "How they get around",
    why: "Decides whether a day needs a rental car, whether a place has to be walkable, whether a train or a tour is better than driving, and how long a travel day is bearable.",
    fills:
      "An airline or rental program belongs in the Wallet, through add_rewards_program. Equipment they travel with, and anything about managing stairs or distance, belongs on the person, through set_person_details.",
  },
  {
    id: "food",
    kind: "taste",
    label: "What they will actually eat",
    why: "Decides whether a restaurant is worth suggesting at all, and how adventurous a menu can be.",
  },
  {
    id: "crowds",
    kind: "taste",
    label: "Crowds, queues and noise",
    why: "Decides between the famous place at noon and the quiet one at nine, and rules out loud rooms.",
  },
  {
    id: "money",
    kind: "taste",
    label: "Where money is worth spending",
    why: "Decides whether to spend on the room, the meal, the seat or the tour when the budget will not cover all four.",
  },
  {
    id: "limits",
    kind: "fact",
    label: "Anything they cannot do",
    hard: true,
    why: "Allergies, medical limits, mobility, altitude, seasickness. Rules rather than taste, and getting one wrong hurts somebody.",
    fills:
      "Equipment and anything about getting around belongs on the person too, through set_person_details mobility_aids and accessibility_notes.",
  },
  {
    id: "animals",
    kind: "fact",
    when: "pets",
    label: "Whether the animals travel",
    why: "Decides whether a stay has to take dogs, whether a day can run past feeding time, and whether the trip needs a sitter, a kennel or a haul rig booked months out.",
    fills:
      "It belongs on the animal, through update_pet and set_pet_trip, not only in a note.",
  },
];

export const SLOT_IDS = SLOTS.map((s) => s.id);
export const SLOT_BY_ID = new Map(SLOTS.map((s) => [s.id, s]));

/**
 * The slots that apply to this household.
 *
 * A family with no animals should never be asked what happens to the animals, and
 * counting that question against their coverage means the file can never read as
 * finished. Everything conditional is declared with `when`, so the ledger asks
 * about an animal only once there is one on file.
 */
export function slotsFor({ pets = [] } = {}) {
  const has = { pets: Array.isArray(pets) && pets.length > 0 };
  return SLOTS.filter((s) => !s.when || has[s.when]);
}

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

// Which blank a saved sentence is about, worked out from its words.
//
// The model is handed one blank per turn and told to put its id on the save, and
// it leaves the id off often enough to matter: an answer about renting a house
// with a kitchen arrived with no slot at all, so nothing settled and the ledger
// read 11% after four answers. Stamping the handed blank instead would be worse
// than nothing, because the question Aly actually asked is not always the blank
// she was handed -- that is how a rental preference would get filed under what
// time the day starts.
//
// So the words decide, and only when they are clear. No match means no slot, and
// the blank stays open rather than being filled in with a guess.
const WORDS = [
  [
    "animals",
    /\b(dog|dogs|cat|cats|horse|horses|pet|pets|kennel|boarding|sitter|barn|stall|haul|trailer|vet)\b/i,
  ],
  [
    "limits",
    /\b(allerg\w*|seasick\w*|motion ?sick\w*|medication|meds|insulin|epipen|asthma|wheelchair|walker|cane|crutch\w*|cannot|can'?t|afraid|phobi\w*|vertigo|altitude|celiac|gluten|kosher|halal)\b/i,
  ],
  [
    "staying",
    /\b(hotel|hotels|motel|resort|rental|airbnb|vrbo|condo|cabin|apartment|suite|room|rooms|kitchen|kitchenette|villa|lodge|campsite|camping|tent|rv)\b/i,
  ],
  [
    "getting_around",
    /\b(driv\w*|car|cars|rental car|train|trains|bus|buses|subway|metro|tram|ferry|taxi|uber|lyft|walk\w*|walkable|bike|bikes|flight|flights|fly\w*|layover|airport|seat|seats|tour bus|guided tour|road ?trip|mile|miles|hour drive)\b/i,
  ],
  [
    "food",
    /\b(eat\w*|ate|food|foods|meal|meals|restaurant|restaurants|dinner|lunch|breakfast|menu|cook\w*|snack\w*|pizza|seafood|spicy|dessert|ice cream)\b/i,
  ],
  [
    "crowds",
    /\b(crowd\w*|queue\w*|line|lines|busy|packed|quiet|loud|noisy|noise|peaceful|tourist\w*|off-?season|empty)\b/i,
  ],
  [
    "money",
    /\b(money|budget|spend\w*|splurg\w*|cheap\w*|expensive|worth (?:it|the)|afford\w*|price|prices|cost|costs|save|saving|value)\b/i,
  ],
  [
    "day_shape",
    /\b(morning|mornings|early|dawn|sunrise|sleep in|late|nights?|evening|evenings|after dark|bedtime|dinner at|start the day|end the day)\b/i,
  ],
  [
    "doing_or_seeing",
    /\b(museum|museums|gallery|cathedral|castle|ruins|snorkel\w*|kayak\w*|hik\w*|ride|riding|swim\w*|surf\w*|dive|diving|zip ?line|class|lesson|show|concert|watch\w*|look at|viewpoint|scenic|see the)\b/i,
  ],
  [
    "pace",
    /\b(pace|busy day|packed day|one thing|nothing planned|down ?time|rest|relax\w*|slow|full day|schedule\w*|plan\w* out|loose|wing it)\b/i,
  ],
];

/**
 * The blank a sentence is about, or null when the words do not say.
 *
 * @param text the saved body, and the reason if there is one
 */
export function slotFromWords(text) {
  const said = String(text || "");
  if (!said.trim()) return null;
  for (const [slot, test] of WORDS) if (test.test(said)) return slot;
  return null;
}

/**
 * Every blank a piece of free writing already answers, and the sentence that
 * answers it.
 *
 * Somebody who has written "not an early riser, but will do it if I have to" on
 * their own page has answered what shape a day should take, and being asked it
 * again half an hour later is the clearest possible sign that nothing they wrote
 * was read. The same goes for a favorite day recounted in their own words: "the
 * best day was the ferry out and the shack by the dock" settles the food and the
 * getting around at once.
 *
 * Matched a sentence at a time rather than across the whole paragraph, so the
 * quote handed back is the sentence that actually said it, and Aly can build on
 * their words instead of guessing which part she is looking at.
 *
 * @param text a paragraph in their own words
 * @returns [{ slot, sentence }] with one entry per blank, first sentence wins
 */
export function slotsInWords(text) {
  const said = String(text || "").trim();
  if (!said) return [];
  const sentences = said
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const found = new Map();
  for (const sentence of sentences) {
    for (const [slot, test] of WORDS) {
      if (found.has(slot)) continue;
      if (test.test(sentence)) found.set(slot, sentence);
    }
  }
  return [...found.entries()].map(([slot, sentence]) => ({ slot, sentence }));
}
