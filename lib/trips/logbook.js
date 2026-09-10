/**
 * Writing down a trip the family has already taken.
 *
 * The trip builder asks about a trip that does not exist yet, and everything it
 * does is forward-looking: it suggests, it drafts, it builds a packing list out
 * of the base templates, it makes tasks for what still needs booking. Every one
 * of those is wrong for a trip that is over. Nobody needs a task to book a hotel
 * they slept in last year, and a suggested packing list for a finished trip is
 * the app inventing the family's own history.
 *
 * So a logged trip runs the opposite way round. It asks what happened, it takes
 * the packing list they actually used rather than proposing one, and it keeps
 * notes for next time. The point of it is the next trip: a past trip in the app
 * is what makes "we took too many clothes to Disney" a thing Aly can read back
 * two years later, and what turns a real packing list into a template.
 *
 * Three boxes, and only the first is needed. A trip nobody kept a packing list
 * for is still worth logging, and a blank list stays blank rather than being
 * filled in with guesses.
 *
 * Pure text composition. No state, no database, no model call -- the screen and
 * the tests read the same functions.
 */

/** The three things the log screen asks for, in the order they are asked. */
export const LOG_ASKS = [
  {
    id: "trip",
    label: "What was the trip?",
    hint: "Where you went, roughly when, and anything worth remembering about it — the hotel, the ship, who came.",
    placeholder:
      "We did a week at Walt Disney World over Thanksgiving 2024 — stayed at the Contemporary, five of us, and did all four parks…",
    required: true,
  },
  {
    id: "packing",
    label: "What did you pack?",
    hint: "The list you actually used, however it is written. Paste it, dictate it, or leave it blank — nothing will be invented for you.",
    placeholder:
      "2 pairs shorts each, ponchos, the good stroller fan, Veda's tablet, sunscreen, park bags, refillable mugs…",
    required: false,
  },
  {
    id: "notes",
    label: "Anything to remember for next time?",
    hint: "What you would do differently, what was worth the money, what to skip. This is what Aly reads back when you plan something similar.",
    placeholder:
      "Way too many clothes. The Contemporary walkway to Magic Kingdom was worth every penny. Skip the dessert party…",
    required: false,
  },
];

/** Examples of a whole logged trip, to show that rough is enough. */
export const LOG_EXAMPLES = [
  "We drove to Gulf Shores for a week in June 2023, rented a condo on the beach with my sister's family.",
  "Four nights in Chicago in October 2022 for a horse show — stayed downtown and did the architecture boat tour.",
  "Our honeymoon in Curaçao, back in 2011. Two weeks, and we barely left the water.",
];

const clean = (value) => String(value || "").trim();

/**
 * The three boxes as one thing to say to Aly.
 *
 * Written as instructions rather than as a form dump, because the parts have to
 * survive into a conversation where she decides what to call and what to ask.
 * Each section is labelled so a packing list pasted as forty lines is not read as
 * part of the story of the trip, and the packing list is quoted verbatim: an item
 * list is the one place where paraphrasing loses the whole value.
 *
 * A blank list says so out loud. Silence would leave her free to helpfully build
 * one, which is precisely the thing this screen exists not to do.
 */
export function logSeed({ trip, packing, notes } = {}) {
  const story = clean(trip);
  if (!story) return "";
  const took = clean(packing);
  const learned = clean(notes);
  const parts = [
    "I want to log a trip we have ALREADY TAKEN, for the record. It is finished — do not plan it, do not suggest anything to book, and do not make any tasks or reminders for it.",
    `THE TRIP:\n${story}`,
  ];
  parts.push(
    took
      ? `THE PACKING LIST WE ACTUALLY USED — put these on the trip exactly as written, and do NOT add anything I have not listed:\n${took}`
      : "PACKING LIST: I do not have one for this trip. Leave the packing list empty — do not build one, and do not ask me for it more than once.",
  );
  if (learned) {
    parts.push(
      `WHAT TO REMEMBER FOR NEXT TIME — keep this where you will read it back when we plan something similar:\n${learned}`,
    );
  }
  parts.push(
    "Create it as a finished trip with status complete. Ask me for the dates if I have not given you them, and use my own words for the rest.",
  );
  return parts.join("\n\n");
}

/**
 * What the screen says under the boxes as they fill in.
 *
 * Never a requirement. One box is a valid logged trip, and saying so is the
 * point: the commonest reason a past trip never gets written down is somebody
 * thinking they have to reconstruct all of it.
 */
export function logReadyLine({ trip, packing, notes } = {}) {
  if (!clean(trip)) {
    return "Start with where you went and roughly when. The rest is optional.";
  }
  const extras = [];
  if (clean(packing)) extras.push("the packing list you used");
  if (clean(notes)) extras.push("your notes for next time");
  if (!extras.length) {
    return "That is enough to log it. A packing list and notes are worth adding if you have them.";
  }
  const list =
    extras.length === 1 ? extras[0] : `${extras[0]} and ${extras[1]}`;
  return `Ready — the trip, ${list}. It lands in Past trips.`;
}
