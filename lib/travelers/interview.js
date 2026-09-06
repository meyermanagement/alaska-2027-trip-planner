// The nine questions Aly asks a household once, run by the primary on the
// interview screen. Same ledger vocabulary as slots.js -- each question fills a
// slot -- but written for a screen, not a chat: two named options, an escape
// hatch for "Something else", and a plain text box for the one fact question
// (limits) that does not fit the option pattern.
//
// Nine, not ten. Whether the animals come along is trip-shaped -- the answer
// changes with the trip, so it lives on the trip builder rather than on the
// person's file -- and it is the only slot conditional on pets, so this list is
// unconditional.
//
// Order matters because the screen shows them in it: the softer taste questions
// first, money and the limits fact last, so the interview earns the harder ones
// with the easier ones and finishes at "anything anybody cannot do", which is
// exactly the question the primary is more likely to leave blank if it opens the
// door.

/**
 * A question the interview asks. `kind` is "options" for the eight two-option
 * questions with a Something-else escape, and "text" for the limits question
 * that is a plain field.
 */
export const INTERVIEW_QUESTIONS = [
  {
    slot: "pace",
    kind: "options",
    label: "How full a day should be",
    prompt: "How full does a good day look? The kind you would want more of.",
    options: [
      {
        value: "packed",
        label: "A packed day",
        detail: "Three or four things worth writing home about.",
      },
      {
        value: "one_thing",
        label: "One thing done well",
        detail: "The rest of the day earned by not being scheduled.",
      },
    ],
  },
  {
    slot: "day_shape",
    kind: "options",
    label: "When the day starts and ends",
    prompt: "When does the good part of the day happen?",
    options: [
      {
        value: "early",
        label: "8 AM, before anyone else is up",
        detail: "Sunrise on the water, first table at breakfast.",
      },
      {
        value: "late",
        label: "4 PM, after a slow morning",
        detail: "Dinner at nine, the good part in the evening.",
      },
    ],
  },
  {
    slot: "doing_or_seeing",
    kind: "options",
    label: "Doing something, or looking at something",
    prompt: "Which is the day you would remember?",
    options: [
      {
        value: "doing",
        label: "A kayak on the water",
        detail: "In it, not next to it.",
      },
      {
        value: "seeing",
        label: "A viewpoint over the water",
        detail: "Somewhere to sit, something to look at.",
      },
    ],
  },
  {
    slot: "staying",
    kind: "options",
    label: "Where the family sleeps",
    prompt: "Which room does the trip feel more like a trip in?",
    options: [
      {
        value: "hotel",
        label: "A hotel, somebody making the bed",
        detail: "Room service, breakfast downstairs, the concierge desk.",
      },
      {
        value: "rental",
        label: "A rental, with a kitchen",
        detail: "Groceries in the fridge, room for everyone to spread out.",
      },
    ],
  },
  {
    slot: "getting_around",
    kind: "options",
    label: "How the family gets around",
    prompt: "What does getting around look like, most days?",
    options: [
      {
        value: "car",
        label: "A rental car, so you go where you want",
        detail: "Drive yourself, park at the trailhead, leave when you want.",
      },
      {
        value: "walk",
        label: "Walkable enough not to need one",
        detail:
          "The good places are twenty minutes on foot from where you sleep.",
      },
    ],
  },
  {
    slot: "food",
    kind: "options",
    label: "What the family will actually eat",
    prompt: "Which place would you rather eat at tonight?",
    options: [
      {
        value: "line",
        label: "The local place with the line",
        detail: "The one everybody says is worth waiting for.",
      },
      {
        value: "quiet",
        label: "The local place with the empty table",
        detail: "Good food, nobody in the way, seated in five minutes.",
      },
    ],
  },
  {
    slot: "crowds",
    kind: "options",
    label: "Crowds, queues and noise",
    prompt: "The famous thing has a queue. Which visit is you?",
    options: [
      {
        value: "with",
        label: "Noon, with everybody else",
        detail: "Worth the wait -- the point is being there.",
      },
      {
        value: "without",
        label: "Nine, before anybody else is up",
        detail: "Same view, no crowd, and you eat lunch after.",
      },
    ],
  },
  {
    slot: "money",
    kind: "options",
    label: "Where money is worth spending",
    prompt: "The budget won't cover both. Which do you spend on?",
    options: [
      {
        value: "room",
        label: "The room",
        detail: "A nicer bed, a better view, more space to come back to.",
      },
      {
        value: "meals",
        label: "The meals",
        detail: "The tasting menu, the reservation people fly in for.",
      },
    ],
  },
  {
    slot: "limits",
    kind: "text",
    label: "Anything anybody can't do",
    prompt:
      "Anything anybody in the family cannot do — allergies, medications, mobility, altitude, seasickness. Blank is a fine answer.",
    placeholder:
      "e.g. Veda's peanut allergy, Steph gets seasick on small boats, my knee can't do more than a mile of stairs.",
  },
];

export const INTERVIEW_SLOT_IDS = INTERVIEW_QUESTIONS.map((q) => q.slot);

/** The question for a slot id, or null when the slot isn't part of the family interview. */
export function questionFor(slotId) {
  return INTERVIEW_QUESTIONS.find((q) => q.slot === slotId) || null;
}

/**
 * The next question to ask, from the ledger the Family page already computes.
 *
 * "Next" means the first in interview order whose slot is neither settled nor
 * skipped. A slot in "asking" state (the primary opened the screen and closed it
 * without answering) still counts as unanswered, because the whole point of
 * this screen is that closing it and coming back lands on the same question.
 *
 * @param ledger { settled: [slot], skipped: [slot], asking: [slot], open: [slot] }
 * @returns { question, index } or { question: null, index } when the interview
 *   is complete (index === INTERVIEW_QUESTIONS.length)
 */
export function nextQuestion(ledger) {
  const done = new Set([
    ...(ledger?.settled || []),
    ...(ledger?.skipped || []),
    ...(ledger?.told || []),
  ]);
  for (let i = 0; i < INTERVIEW_QUESTIONS.length; i += 1) {
    if (!done.has(INTERVIEW_QUESTIONS[i].slot)) {
      return { question: INTERVIEW_QUESTIONS[i], index: i };
    }
  }
  return { question: null, index: INTERVIEW_QUESTIONS.length };
}

/**
 * How many of the interview's nine questions this ledger has answered.
 *
 * Used by the Family launcher to decide whether to say "Get to know" (nothing
 * answered), "Finish getting to know" (some answered), or hide (all answered).
 */
export function interviewProgress(ledger) {
  const done = new Set([
    ...(ledger?.settled || []),
    ...(ledger?.skipped || []),
    ...(ledger?.told || []),
  ]);
  const answered = INTERVIEW_SLOT_IDS.filter((id) => done.has(id)).length;
  return {
    answered,
    total: INTERVIEW_QUESTIONS.length,
    complete: answered >= INTERVIEW_QUESTIONS.length,
    started: answered > 0,
  };
}
