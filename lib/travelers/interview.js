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
          "We came a long way; we want to make it count.",
          "The kids do better when they are busy.",
          "A slow day is when the tempers show up.",
          "We can rest at home; we came here to see things.",
          "Four things is our sweet spot; six is too many.",
        ],
      },
      {
        value: "one_thing",
        label: "One thing done well",
        detail: "The rest of the day earned by not being scheduled.",
        reasons: [
          "A packed day ends in a fight.",
          "The best part is usually not on the list.",
          "An unplanned afternoon is when the trip gets interesting.",
          "One thing in the morning, one thing after a nap, is our real limit.",
          "We get more out of one thing done twice than two things done once.",
        ],
      },
    ],
    otherReasons: [
      "One packed day, one slow day.",
      "One packed morning, a slow afternoon.",
      "A rest day every third day.",
      "Packed for the first half, slow for the second.",
      "Whatever kind of day the weather makes possible.",
      "Packed in a new place, slow when we go back.",
      "As full as the kids can carry without melting down.",
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
          "The best light is early.",
          "An empty famous place is worth waking up for.",
          "We are morning people, on trips and at home.",
        ],
      },
      {
        value: "morning",
        label: "Mid-morning, once the town is open",
        detail: "Out the door by nine, the busy hour is ours.",
        reasons: [
          "Nine is early enough to beat the crowd.",
          "We want a real breakfast first.",
          "The kids need a proper wake-up.",
        ],
      },
      {
        value: "midday",
        label: "Midday, when the day is warm",
        detail: "The middle hours are the ones we came for.",
        reasons: [
          "The light and the warmth are the point.",
          "Everything worth doing is open by then.",
          "Mornings and evenings are for resting.",
        ],
      },
      {
        value: "afternoon",
        label: "Afternoon, after a slow morning",
        detail: "Out at two, dinner late, the good part in golden hour.",
        reasons: [
          "Afternoon light is the best of the day.",
          "A slow morning earns the afternoon.",
          "The kids peak after lunch, not before.",
        ],
      },
      {
        value: "evening",
        label: "Evening, when the place comes alive",
        detail: "Dinner at nine, the good part after dark.",
        reasons: [
          "Evenings are when the place comes alive.",
          "The kids sleep in on vacation.",
          "Mornings are for coffee, nothing else.",
        ],
      },
    ],
    otherReasons: [
      "Early on the first day, later after we adjust.",
      "Whatever hour has the best light for pictures.",
      "Early one day, late the next, so the day is not the same twice.",
      "Whenever the kids naturally wake up on vacation.",
      "Early on travel days, late on rest days.",
      "Whatever the local rhythm is, wherever we are.",
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
          "A day sitting still is a day we would not have taken the trip for.",
          "The stories we tell at home are always the active ones.",
          "We do at least one physical thing every morning; the afternoon is open.",
        ],
      },
      {
        value: "seeing",
        label: "A viewpoint over the water",
        detail: "Somewhere to sit, something to look at.",
        reasons: [
          "The view is why we came.",
          "Not everybody in the family is up for the activity.",
          "A picture we will look at for years beats a memory of being tired.",
          "The good viewpoints ask for a walk, not a workout.",
          "We would rather see three viewpoints than do one hard thing.",
        ],
      },
    ],
    otherReasons: [
      "Both, on different days.",
      "One thing to do in the morning, one thing to see in the afternoon.",
      "Doing when we are new to a place, seeing when we go back.",
      "Doing for the adults, seeing for the grandparents.",
      "Seeing on the first day, doing once we know where we are.",
      "Whichever the weather picks for us.",
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
        value: "small_inn",
        label: "A small inn or B&B",
        detail: "Ten rooms, somebody who cooks breakfast, a real front desk.",
        reasons: [
          "We want somewhere that feels like a place, not a chain.",
          "Breakfast made by somebody who lives here.",
          "The person at the desk actually knows the town.",
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
      {
        value: "resort",
        label: "A resort where the whole trip lives",
        detail: "The pool, the beach, the meals, all in one place.",
        reasons: [
          "We do not want to think about logistics.",
          "The kids can roam, and we can stop watching.",
          "Everything included is worth the price.",
        ],
      },
    ],
    otherReasons: [
      "Hotel in the city, rental in the country.",
      "Rental for a week or more, hotel for a weekend.",
      "A rental with a real front desk, not just a lockbox.",
      "Whichever puts us walking distance from the good part.",
      "Rental if the kids are with us, hotel if they are not.",
      "A hotel we know, over a rental we do not.",
      "The one with a pool for the kids, regardless.",
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
        value: "transit",
        label: "Trains, subways, and the odd taxi",
        detail: "The city moves you; you skip the parking and the traffic.",
        reasons: [
          "Driving in a city we don't know is a waste of a morning.",
          "Trains let us actually look out the window.",
          "Somebody else deals with the traffic.",
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
          "Twenty minutes on foot is the sweet spot; forty is too far.",
          "A walkable neighborhood is worth paying up for on the room.",
          "Walking is how we find the places nobody told us about.",
        ],
      },
      {
        value: "driver",
        label: "A driver or private guide",
        detail: "Somebody local, at the door, who knows where to go.",
        reasons: [
          "A local driver knows the shortcuts and the good stops.",
          "We are not spending vacation navigating.",
          "A driver for the day out of town, our own two feet in it.",
          "A driver who speaks the language is worth twice the price.",
          "On day one, a driver; from day two, we figure it out.",
        ],
      },
    ],
    otherReasons: [
      "Trains between cities, feet inside them.",
      "A car for the country, feet for the town.",
      "Two hours in the car is our limit for a day trip.",
      "Four hours is our limit before we would rather fly.",
      "We would rather not drive in a country where the wheel is on the other side.",
      "A rental only for trailheads, not for the town itself.",
      "A driver on the first day, our own two feet after.",
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
      "One splurge meal per trip, the rest simple.",
      "We book the one hard reservation before we book the flights.",
      "We would rather wander into a place than plan every meal.",
      "Forty-five minutes is our wait limit; two hours is not.",
      "Kids eat early and simple, adults eat later and better.",
      "Breakfast at the hotel, lunch and dinner out.",
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
          "A queue at noon is a fair price.",
          "An hour in a queue is fine; two is a waste of the day.",
          "We pay for the skip-the-line pass every time it exists.",
          "The kids handle a queue better in the middle of the day than first thing.",
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
      "Only the famous thing that is famous for a real reason.",
      "Skip the queue with a timed ticket if one exists; skip it entirely otherwise.",
      "Worth the queue if it is a one-time trip; skip it if we could come back.",
      "A private guide-line pass beats standing in the queue.",
      "Off-peak days over off-peak hours.",
      "Whichever gets a better picture.",
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
          "A great meal is a memory nobody can take away.",
          "One splurge dinner beats five ordinary ones.",
          "The kids remember what we ate as much as what we did.",
          "We book the hard reservation before we book the flights.",
        ],
      },
      {
        value: "experiences",
        label: "The experiences",
        detail: "The guide, the private tour, the hard-to-get ticket.",
        reasons: [
          "The experience is what we will actually remember.",
          "A good guide is the difference between good and great.",
          "We can eat and sleep anywhere; we can't do this anywhere.",
        ],
      },
      {
        value: "flights",
        label: "Getting there in comfort",
        detail: "Better seats, direct flights, less time in an airport.",
        reasons: [
          "A rough flight ruins the first day.",
          "We would rather pay to skip the connection.",
          "Sleep on the plane, land ready to go.",
        ],
      },
    ],
    otherReasons: [
      "The room in the country, the meal in the city.",
      "One splurge per trip, wherever it lands.",
      "We spend on the room in a place we are staying a week; we spend on the meal in a place we are staying a night.",
      "Whichever splurge the kids will remember, not the one we will.",
      "Never on flights; we can suffer six hours in coach.",
      "Never on tours; we would rather have the day to ourselves.",
      "Direct flights, always, even at twice the price.",
      "The splurge is the reason for the trip; the rest is minimum viable.",
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
