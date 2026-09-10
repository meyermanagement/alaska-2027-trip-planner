// The nine questions that make up the family interview.
//
// One interview for the whole household, answered once by the primary. The
// answers become preferences (eight of them) or a household rule (the ninth),
// and every trip after that is planned against them until they are changed.
//
// Three shapes are used:
//
//   options   Named alternatives with a Something-else escape. Each option
//             carries a short label and a longer detail line, and a small set
//             of reason chips that make the "Anything to add about why?" box
//             something to tap rather than something to type. Reasons are
//             per-option because the reasons for picking "packed" are not the
//             reasons for picking "one thing done well".
//
//             Some questions are honest binaries -- do you queue at the famous
//             thing or go early, do you want the room with the line or the
//             empty table -- and those keep two options. Others are spectrums
//             -- when the day starts, where you sleep, how you get around,
//             what you spend the money on -- and those carry three, four, or
//             five options so the middle answers are not stuffed into
//             Something else. The renderer and the answer endpoint both treat
//             the option array as open-ended, so adding an option is a data
//             change with no code impact.
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
//
// Three per option, kept short. The first version offered five to eight per
// option and each one was a full sentence, and a drawer that size stops being
// a set of things to tap and becomes a paragraph to read -- somebody weighing
// six sentences about pace is doing more work than typing their own answer
// would have taken, which is the opposite of the point. So each option keeps
// the two or three reasons that actually change what the app does and drops
// the rest, and each one is a phrase rather than a sentence.
//
// Two rules the reasons themselves have to keep, because both were broken and
// both were visible on the screen. First, a reason cannot restate the option's
// own label or detail: those lines are already on screen next to the chip, so a
// chip that says them again costs a tap and teaches nothing -- "Somewhere to sit
// at the top" under a detail reading "Somewhere to sit, something to look at"
// was a chip that only agreed with itself. Second, a reason cannot repeat one of
// the same question's otherReasons, which the More row shows immediately below
// the picked option's chips; "One splurge meal a trip; the rest simple" sat in
// both places on the food question, word for word.
//
// The same reason DOES appear under two different questions on purpose in a few
// places -- that repetition is what the inference rules read, and the two
// questions are never on screen at once.
//
// One constraint on any future edit here: a handful of these are load-bearing.
// The inference rules in interviewInference match on fragments of this text to
// carry an answer from one question to a later one, and a few of them are
// airtight only because the same reason is offered under both questions. Run
// the inference tests after changing any wording; a reason that quietly loses
// its fragment takes a rule down with it and nothing else complains.

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
          "Four things is our sweet spot.",
          "We can rest when we get home.",
          "Two hours a stop, not four.",
        ],
      },
      {
        value: "one_thing",
        label: "One thing done well",
        detail: "The rest of the day earned by not being scheduled.",
        reasons: [
          "One thing in the morning, one after a nap.",
          "One ticket a day; the rest should be walking.",
          "The best part is not on the list.",
        ],
      },
    ],
    otherReasons: [
      "One packed day, one slow day.",
      "A rest day every third day.",
      "Whatever the weather allows.",
    ],
  },
  {
    slot: "day_shape",
    kind: "options",
    label: "When the day starts and ends",
    prompt: "When does the good part of the day happen?",
    options: [
      {
        value: "dawn",
        label: "Dawn, before anyone else is up",
        detail: "Sunrise on the water, first table at breakfast.",
        reasons: [
          "Six a.m. is a normal wake-up for us.",
          "The empty version is worth losing sleep for.",
          "We skip the parking problem entirely.",
        ],
      },
      {
        value: "morning",
        label: "Mid-morning, once the town is open",
        detail: "Out the door by nine, the busy hour is ours.",
        reasons: [
          "Back at the room by four, dinner near where we sleep.",
          "Nine is enough to beat the crowd.",
          "A real breakfast first.",
        ],
      },
      {
        value: "midday",
        label: "Midday, when the day is warm",
        detail: "The middle hours are the ones we came for.",
        reasons: [
          "We plan around the warmest three hours.",
          "A late lunch at two is our anchor.",
          "The middle of the day is the trip.",
        ],
      },
      {
        value: "afternoon",
        label: "Afternoon, after a slow morning",
        detail: "Out at two, dinner late, the good part in golden hour.",
        reasons: [
          "Nobody rushes anybody before lunch.",
          "Golden hour is when we plan to be out.",
          "The kids peak after lunch.",
        ],
      },
      {
        value: "evening",
        label: "Evening, when the place comes alive",
        detail: "Dinner at nine, the good part after dark.",
        reasons: [
          "Nothing booked before noon.",
          "The kids sleep in and stay up late; we do too.",
          "An empty city is a wasted city; we want it full.",
        ],
      },
    ],
    otherReasons: [
      "Early for the jet lag, later once we adjust.",
      "Whenever the kids wake up.",
      "Whatever the local rhythm is.",
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
          "One physical thing before lunch.",
          "A hard hike over an easy walk.",
          "A guided activity is worth it when it gets us on the water.",
        ],
      },
      {
        value: "seeing",
        label: "A viewpoint over the water",
        detail: "Somewhere to sit, something to look at.",
        reasons: [
          "A twenty-minute walk, not an hour.",
          "Somewhere we can drive most of the way.",
          "We would rather stay an hour than tick it off.",
        ],
      },
    ],
    otherReasons: [
      "Doing in the morning, seeing after.",
      "A hard thing once a trip.",
      "Whatever the weather picks.",
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
          "Four stars is our floor.",
          "A real concierge over a bigger room.",
          "A hotel bar we would actually use.",
        ],
      },
      {
        value: "small_inn",
        label: "A small inn or B&B",
        detail: "Ten rooms, somebody who cooks breakfast, a real front desk.",
        reasons: [
          "Fewer than twenty rooms.",
          "Breakfast made by somebody who lives here.",
          "A place with a story over a spa.",
        ],
      },
      {
        value: "rental",
        label: "A rental, with a kitchen",
        detail: "Groceries in the fridge, room for everyone to spread out.",
        reasons: [
          "Two bedrooms is the minimum.",
          "A washer and dryer earns it.",
          "We cook at least half our dinners.",
        ],
      },
      {
        value: "resort",
        label: "A resort where the whole trip lives",
        detail: "The pool, the beach, the meals, all in one place.",
        reasons: [
          "All-inclusive, not nickel-and-dime.",
          "On the beach, not near it.",
          "A kids' club the kids like.",
        ],
      },
    ],
    otherReasons: [
      "Hotel in the city, rental in the country.",
      "Rental if the kids are with us.",
      "Whichever puts us walking distance.",
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
          "Two hours in the car is our limit.",
          "An automatic; manual is a non-starter.",
          "Free parking is worth paying up for on the room.",
        ],
      },
      {
        value: "transit",
        label: "Trains, subways, and the odd taxi",
        detail: "The city moves you; you skip the parking and the traffic.",
        reasons: [
          "First-class on a train over two hours.",
          "Trains between cities, always.",
          "A taxi at night, transit in the day.",
        ],
      },
      {
        value: "walk",
        label: "Walkable enough not to need one",
        detail:
          "The good places are twenty minutes on foot from where you sleep.",
        reasons: [
          "Twenty minutes on foot is the sweet spot.",
          "Walkable is worth paying up for on the room.",
          "A car in a city is a headache.",
        ],
      },
      {
        value: "driver",
        label: "A driver or private guide",
        detail:
          "Somebody at the door in the morning, and nobody in the family driving.",
        reasons: [
          "A driver who speaks the language.",
          "A private guide who knows where to go.",
          "A driver out of town, our feet in it.",
        ],
      },
    ],
    otherReasons: [
      "One car, and we park it for days at a time.",
      "A car for the country, feet for the town.",
      "A driver the first day, our feet after.",
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
          "Forty-five minutes is worth the wait.",
          "The hard reservation before the flights.",
          "One splurge meal a trip: a tasting menu, then the rest simple.",
        ],
      },
      {
        value: "quiet",
        label: "The local place with the empty table",
        detail: "Good food, a table straight away, and we can hear each other.",
        reasons: [
          "Nobody in the way, and the kids can be kids.",
          "Seated in five minutes or we walk.",
          "A table outside, always.",
        ],
      },
    ],
    otherReasons: [
      "One good lunch, a simple dinner.",
      "We book nothing and decide at six.",
      "Kids eat early, adults eat later.",
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
          "A guide who skips the line beats the cheaper ticket.",
          "A timed ticket, booked six months out.",
          "The crowd is half the reason we came.",
        ],
      },
      {
        value: "without",
        label: "Nine, before anybody else is up",
        detail: "Same view, no crowd, and you eat lunch after.",
        reasons: [
          "The first entry of the day.",
          "An empty room is the room.",
          "An off-peak day over an off-peak hour.",
        ],
      },
    ],
    otherReasons: [
      "The famous thing early, the quiet thing late.",
      "We skip the famous thing if the line is long.",
      "Worth the queue on a one-time trip.",
    ],
  },
  {
    slot: "money",
    kind: "options",
    label: "Where money is worth spending",
    prompt: "The budget won't cover them all. Which do you spend on?",
    options: [
      {
        value: "room",
        label: "The room",
        detail: "A nicer bed, a better view, more space to come back to.",
        reasons: [
          "A suite over a room past three nights.",
          "Bad sleep ruins the next day.",
          "A view worth opening the curtains for.",
        ],
      },
      {
        value: "meals",
        label: "The meals",
        detail: "The tasting menu, the reservation people fly in for.",
        reasons: [
          "A great meal is a memory; a nice room is not.",
          "One tasting menu per trip.",
          "The hard reservation before the flights.",
        ],
      },
      {
        value: "experiences",
        label: "The experiences",
        detail: "Something we could not have arranged on our own.",
        reasons: [
          "A private guide over a group tour.",
          "A guide who speaks the language.",
          "A hard-to-get ticket, six months out.",
        ],
      },
      {
        value: "flights",
        label: "Getting there in comfort",
        detail: "Better seats, direct flights, less time in an airport.",
        reasons: [
          "Direct flights, always.",
          "Business class past six hours.",
          "A lounge pass on a long layover.",
        ],
      },
    ],
    otherReasons: [
      "One splurge per trip, wherever it lands.",
      "Never on flights; we can suffer coach.",
      "The room in the country, the meal in the city.",
    ],
  },
  {
    slot: "limits",
    kind: "text",
    label: "Anything anybody can't do",
    prompt:
      "Is there anything I should plan around? Allergies, medications, mobility, altitude, seasickness, or a phobia like heights, small spaces, spiders, water or flying. Blank is a fine answer.",
    placeholder:
      "e.g. Veda's peanut allergy, Steph gets seasick on small boats, my knee can't do more than a mile of stairs, Steph is afraid of heights so skip the glass-floor observation decks.",
  },
  {
    slot: "moments",
    kind: "moments",
    label: "A few favorite moments",
    prompt:
      "Two or three favorite moments from past trips, in your own words. The kind of thing you would tell a friend about at dinner.",
    help: "One is fine. None is fine. I read these before every answer I write, so a real moment in your own words is worth more to me than a tidy list of places.",
    placeholder:
      "e.g. a slow dinner on a terrace in Rome, the morning we found tide pools in Maine, reading on the beach in Hawaii until the sun went down.",
    // Shown as chips under the boxes and deliberately not tappable: a favorite
    // moment has to be the family's own, and seeding the box with one of these
    // would put a stranger's memory on a person's page. Kept short and varied
    // on purpose -- they are there to show the kind of thing that belongs in
    // the box, and nothing else.
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
