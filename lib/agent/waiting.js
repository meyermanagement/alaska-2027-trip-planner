/**
 * What a screen can honestly say while it is waiting on Aly.
 *
 * Kept out of the component so the words and the clock can be read and tested on
 * their own, and so anything else that has to wait can say the same things.
 *
 * There are two kinds of line here and the difference matters. The ladder is
 * keyed to the clock: each of its lines is true of how long it has been and of
 * nothing else, because from out here there is no telling which step the model is
 * on. The opening line is keyed to the question that was just asked, which is the
 * one other thing this side of the wire genuinely knows -- the family typed it. So
 * "Looking at places to eat that suit everyone" is a claim about the subject they
 * raised, not a claim about a step being run, and it cannot contradict the answer
 * the way naming a day or a place could.
 */

/**
 * Openings by subject, matched against the words of the question. Order is the
 * priority order: the first family whose words appear wins, so money beats food
 * on "how much is dinner going to cost", which is the more useful reading of
 * that question.
 *
 * The words are deliberately plain and lower case; the matcher folds the question
 * before testing. Each family needs enough words to catch the way a family
 * actually types and few enough that it does not catch everything.
 */
export const OPENINGS = [
  {
    id: "money",
    said: "Adding up what this does to the budget.",
    words: [
      "budget",
      "cost",
      "costs",
      "price",
      "prices",
      "cheap",
      "cheaper",
      "expensive",
      "afford",
      "spend",
      "spending",
      "dollar",
      "worth it",
      "how much",
      "$",
    ],
  },
  {
    id: "food",
    said: "Looking at places to eat that suit everyone.",
    words: [
      "eat",
      "eating",
      "food",
      "restaurant",
      "restaurants",
      "dinner",
      "lunch",
      "breakfast",
      "brunch",
      "menu",
      "reservation",
      "reservations",
      "coffee",
      "snack",
      "hungry",
      "gluten",
      "vegetarian",
      "vegan",
      "allergy",
      "allergies",
    ],
  },
  {
    id: "weather",
    said: "Checking what the weather does to this.",
    words: [
      "weather",
      "forecast",
      "rain",
      "raining",
      "snow",
      "cold",
      "hot",
      "warm",
      "wind",
      "windy",
      "storm",
      "temperature",
      "wear",
      "jacket",
      "coat",
      "layers",
      "sunscreen",
    ],
  },
  {
    id: "packing",
    said: "Going through what you have already put in the bag.",
    words: [
      "pack",
      "packing",
      "bring",
      "suitcase",
      "bag",
      "bags",
      "luggage",
      "carry on",
      "carry-on",
      "forget",
      "forgot",
      "do i need",
      "charger",
      "adapter",
    ],
  },
  {
    id: "timing",
    said: "Working out whether the timing holds.",
    words: [
      "time",
      "when",
      "how long",
      "late",
      "early",
      "schedule",
      "flight",
      "flights",
      "drive",
      "driving",
      "train",
      "ferry",
      "shuttle",
      "transfer",
      "layover",
      "get there",
      "make it",
      "miss",
      "check in",
      "check-in",
      "checkout",
      "check out",
    ],
  },
  {
    id: "people",
    said: "Reading this back against who is going.",
    words: [
      "everyone",
      "kids",
      "kid",
      "children",
      "child",
      "toddler",
      "baby",
      "grandma",
      "grandpa",
      "dog",
      "dogs",
      "pet",
      "pets",
      "horse",
      "stroller",
      "wheelchair",
      "walk",
      "walking",
    ],
  },
  {
    id: "places",
    said: "Looking at what is worth doing around there.",
    words: [
      // Phrases rather than bare "do" and "see", which fire on "do I need" and
      // "did you see" and would make half the questions in the app about
      // sightseeing.
      "to do",
      "we do",
      "worth doing",
      "to see",
      "worth seeing",
      "visit",
      "tour",
      "hike",
      "hiking",
      "museum",
      "beach",
      "park",
      "excursion",
      "excursions",
      "tickets",
      "nearby",
      "near",
    ],
  },
];

/** The line said before anything else, given what was asked. */
export const DEFAULT_OPENING = "Reading your question.";

/**
 * The opening for a question. Falls back to the plain line for a question with
 * no subject in it, an empty one, or none at all -- which is what a caller
 * without a question gets, and what the old single "Thinking…" used to say.
 */
export function openingLine(question) {
  const said = String(question ?? "")
    .toLowerCase()
    .replace(/[\u2019']/g, "'");
  if (!said.trim()) return DEFAULT_OPENING;
  for (const family of OPENINGS) {
    for (const word of family.words) {
      // Bounded on both sides for a single word so "near" does not fire on
      // "nearly" and "do" does not fire on every "don't"; phrases and the
      // dollar sign are looked for as they are.
      const hit = /^[a-z' -]+$/.test(word)
        ? new RegExp(`(^|[^a-z'])${word.replace(/[-\s]/g, "[-\\s]")}([^a-z']|$)`)
        : null;
      if (hit ? hit.test(said) : said.includes(word)) return family.said;
    }
  }
  return DEFAULT_OPENING;
}

/**
 * The ladder, by how long it has been going. Every line after the opening is
 * true of the clock rather than of the model, which is the only honest thing
 * this component can say about a wait it cannot see inside.
 */
export const WAITING_LINES = [
  [6, "Digging deeper. This one has a few parts."],
  [16, "Double-checking this works for you."],
  [31, "Still going. I would rather get this right than get it back fast."],
  [55, "This is longer than usual. It may come back as an error."],
];

/** The line for a given number of whole seconds, and the question if there is one. */
export function waitingLine(seconds, question) {
  const s = Number.isFinite(seconds) ? seconds : 0;
  let said = openingLine(question);
  for (const [at, text] of WAITING_LINES) if (s >= at) said = text;
  return said;
}

/** "8s", or "1m 04s" once it has been going long enough to need minutes. */
export function elapsedSaid(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
