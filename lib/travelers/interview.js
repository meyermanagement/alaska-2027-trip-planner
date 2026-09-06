// The nine questions that make up the family interview.
//
// One interview for the whole household, answered once by the primary. The
// answers become preferences (eight of them) or a household rule (the ninth),
// and every trip after that is planned against them until they are changed.
//
// Three shapes are used:
//
//   options   Two named alternatives with a Something-else escape. Each option
//             carries a short label and a longer detail line, and a small set
//             of reason chips that make the "Anything to add about why?" box
//             something to tap rather than something to type. Reasons are
//             per-option because the reasons for picking "packed" are not the
//             reasons for picking "one thing done well".
//
//   text      A plain field, used only for limits (allergies, mobility, etc.).
//
//   moments   A short list of favorite moments from past trips in the primary's
//             own words -- "a slow dinner on a terrace in Rome", "the morning
//             we found tide pools in Maine". Two or three is enough; one is
//             fine; none is fine. Each row lands in favorite_moments on the
//             primary's own record; Aly reads them before every answer she
//             writes. Kept last in the interview because it is the softest
//             question -- somebody who has warmed up to the eight taste ones
//             is much more likely to give a real answer than somebody who has
//             just walked in.
//
// The reasons are suggestions, never limits: the primary is always free to
// type over them, and a blank reason is a fine answer.

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
        reasons: [
          "We travel to do, not to rest.",
          "The kids do better when they are busy.",
          "We won't be back here for a while.",
        ],
      },
      {
        value: "one_thing",
        label: "One thing done well",
        detail: "The rest of the day earned by not being scheduled.",
        reasons: [
          "A packed day ends in a fight.",
          "The best part is usually not on the list.",
          "We travel to slow down.",
        ],
      },
    ],
    otherReasons: [
      "It depends on the trip.",
      "One packed day, one slow day.",
      "One packed morning, a slow afternoon.",
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
        reasons: [
          "The best light is early.",
          "Nobody is there yet.",
          "We are up anyway.",
        ],
      },
      {
        value: "late",
        label: "4 PM, after a slow morning",
        detail: "Dinner at nine, the good part in the evening.",
        reasons: [
          "The kids sleep in on vacation.",
          "Evenings are when the place comes alive.",
          "Mornings are for coffee, nothing else.",
        ],
      },
    ],
    otherReasons: [
      "Depends on what we are doing.",
      "Early one day, late the next.",
      "Whatever the light is doing.",
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
        reasons: [
          "We remember what we did, not what we looked at.",
          "The kids need to move.",
          "Sitting still is not travel to us.",
        ],
      },
      {
        value: "seeing",
        label: "A viewpoint over the water",
        detail: "Somewhere to sit, something to look at.",
        reasons: [
          "The view is why we came.",
          "Not everybody is up for the activity.",
          "The camera is why we came.",
        ],
      },
    ],
    otherReasons: [
      "Both, on different days.",
      "One thing to do, one thing to see.",
      "Depends on the weather.",
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
        reasons: [
          "The point of a trip is not doing chores.",
          "The service is part of what we are paying for.",
          "The kids like a pool and a lobby.",
        ],
      },
      {
        value: "rental",
        label: "A rental, with a kitchen",
        detail: "Groceries in the fridge, room for everyone to spread out.",
        reasons: [
          "The kids eat what the kids eat.",
          "We need room to spread out.",
          "Breakfast in the room, in pajamas.",
        ],
      },
    ],
    otherReasons: [
      "Depends on the trip length.",
      "Hotel in the city, rental in the country.",
      "Whichever has the better location.",
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
        reasons: [
          "The good places are not on a bus line.",
          "We hate being on somebody else's schedule.",
          "We drive at home; we drive on trips.",
        ],
      },
      {
        value: "walk",
        label: "Walkable enough not to need one",
        detail:
          "The good places are twenty minutes on foot from where you sleep.",
        reasons: [
          "A car in a city is a headache.",
          "We travel to walk more, not less.",
          "Parking and traffic ruin a day.",
        ],
      },
    ],
    otherReasons: [
      "Trains between cities, feet inside them.",
      "A car for the country, feet for the town.",
      "Whatever is safer to drive there.",
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
        reasons: [
          "The line is the review.",
          "Food is why we travel.",
          "We would rather wait for good.",
        ],
      },
      {
        value: "quiet",
        label: "The local place with the empty table",
        detail: "Good food, nobody in the way, seated in five minutes.",
        reasons: [
          "The kids will not wait.",
          "Loud restaurants ruin the meal.",
          "A hidden good place beats a famous one.",
        ],
      },
    ],
    otherReasons: [
      "Lunch is the line, dinner is quiet.",
      "One splurge, the rest simple.",
      "Wherever gets us fed without a fight.",
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
        reasons: [
          "The atmosphere is the point.",
          "We travel to do the famous thing.",
          "A queue at noon is a fair price.",
        ],
      },
      {
        value: "without",
        label: "Nine, before anybody else is up",
        detail: "Same view, no crowd, and you eat lunch after.",
        reasons: [
          "A crowd ruins the thing itself.",
          "The pictures are better empty.",
          "We would rather do more, faster.",
        ],
      },
    ],
    otherReasons: [
      "The famous thing early, the quiet thing late.",
      "Skip the famous thing entirely.",
      "Only if there is a timed ticket.",
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
        reasons: [
          "The room is where the trip lives.",
          "Bad sleep ruins the next day.",
          "The view from the room is half the reason.",
        ],
      },
      {
        value: "meals",
        label: "The meals",
        detail: "The tasting menu, the reservation people fly in for.",
        reasons: [
          "Food is why we travel.",
          "A great meal is a great memory.",
          "A room is a place to sleep.",
        ],
      },
    ],
    otherReasons: [
      "The room in the country, the meal in the city.",
      "One splurge either way.",
      "Whatever the point of the trip is.",
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
  {
    slot: "moments",
    kind: "moments",
    label: "A few favorite moments",
    prompt:
      "Two or three favorite moments from past trips, in your own words. The kind of thing you would tell a friend about at dinner.",
    help: "One is fine. None is fine. Aly reads these before every answer she writes, so a real moment in your own words is worth more than a tidy list of places.",
    placeholder:
      "e.g. a slow dinner on a terrace in Rome, the morning we found tide pools in Maine, reading on the beach in Hawaii until the sun went down.",
    // A few examples the primary can tap to seed the box. Kept short and
    // varied on purpose -- they are prompts, not templates.
    examples: [
      "A slow dinner on a terrace in Rome.",
      "The morning we found tide pools in Maine.",
      "Reading on the beach in Hawaii until the sun went down.",
      "The first bite of the pizza in Naples.",
      "The night the northern lights came out for us.",
      "Watching the horses run at sunrise.",
    ],
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
