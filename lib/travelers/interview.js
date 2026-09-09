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
          "Four things is our sweet spot; six is too many.",
          "A packed morning and an open afternoon is our real limit.",
          "We can rest at home; we came here to see things.",
          "We would rather cut a meal short than cut a stop.",
          "Two hours per stop is enough; four is a museum problem.",
          "The kids do better when they are busy than when they are waiting.",
        ],
      },
      {
        value: "one_thing",
        label: "One thing done well",
        detail: "The rest of the day earned by not being scheduled.",
        reasons: [
          "One thing in the morning, one thing after a nap, is our real limit.",
          "The best part is usually not on the list.",
          "We get more out of one thing done twice than two things done once.",
          "A ninety-minute stop is a real stop; thirty minutes is a photo.",
          "Two paid tickets a day is our cap; the rest should be walking.",
          "A packed day ends in a fight before it ends in a good story.",
        ],
      },
    ],
    otherReasons: [
      "One packed day, one slow day, in that order.",
      "One packed morning, a slow afternoon, every day.",
      "A rest day every third day, non-negotiable.",
      "Packed for the first half of the trip, slow for the second.",
      "Whatever kind of day the weather makes possible.",
      "Packed in a new place, slow when we go back to one.",
      "As full as the kids can carry without melting down; we watch for it.",
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
          "Six a.m. is a normal wake-up for us, on trips and at home.",
          "The empty version of a famous place is worth losing sleep for.",
          "We would rather be back at the room by two than out until dark.",
          "The best light for photos is the first hour after sunrise.",
          "An early start means we skip the parking problem entirely.",
        ],
      },
      {
        value: "morning",
        label: "Mid-morning, once the town is open",
        detail: "Out the door by nine, the busy hour is ours.",
        reasons: [
          "Out the door by nine, back by four, is our real shape.",
          "A real breakfast comes before a real morning.",
          "Nine is early enough to beat the crowd but late enough to be human.",
          "We would rather rush lunch than rush breakfast.",
          "A ten a.m. reservation is our sweet spot for a museum or a tour.",
        ],
      },
      {
        value: "midday",
        label: "Midday, when the day is warm",
        detail: "The middle hours are the ones we came for.",
        reasons: [
          "We plan the day around the warmest three hours.",
          "Mornings are for coffee and evenings are for wine; the middle is the trip.",
          "Skipping breakfast is fine; skipping the middle of the day is not.",
          "A late lunch at two is our anchor; everything moves around it.",
          "Sunscreen and a hat get packed before shoes are.",
        ],
      },
      {
        value: "afternoon",
        label: "Afternoon, after a slow morning",
        detail: "Out at two, dinner late, the good part in golden hour.",
        reasons: [
          "Out at two, dinner at eight, bed at midnight, is our real rhythm.",
          "Golden hour is when the good pictures happen; we plan for it.",
          "The kids peak after lunch, not before, and we plan around it.",
          "A slow morning at the hotel is worth as much as a hard one out.",
          "A four p.m. tour beats a nine a.m. one every time.",
        ],
      },
      {
        value: "evening",
        label: "Evening, when the place comes alive",
        detail: "Dinner at nine, the good part after dark.",
        reasons: [
          "Dinner at nine is early; we can do ten.",
          "The kids sleep in and stay up late on vacation; we do too.",
          "Nightlife is the reason for the trip, not a bonus after it.",
          "An empty city at dawn is a wasted city; we want it full.",
          "We would rather have coffee in the room than eat a hotel breakfast.",
        ],
      },
    ],
    otherReasons: [
      "Early on the first day for the jet lag, later after we adjust.",
      "Whatever hour the local light is best for pictures.",
      "Early one day, late the next, so no day repeats.",
      "Whenever the kids naturally wake up; we work around them.",
      "Early on travel days, late on rest days.",
      "Whatever the local rhythm is; we match it.",
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
          "We do at least one physical thing before lunch; the afternoon is open.",
          "Half a day of moving is our floor, most days.",
          "A hard hike with a real view beats an easy walk to a famous one.",
          "We would rather rent the gear than watch other people use it.",
          "A guided activity is worth it if the guide is what makes it possible.",
          "The stories we tell at home are always the active ones.",
        ],
      },
      {
        value: "seeing",
        label: "A viewpoint over the water",
        detail: "Somewhere to sit, something to look at.",
        reasons: [
          "Three viewpoints in a morning beats one hard thing all day.",
          "A twenty-minute walk to a view is our sweet spot; an hour is too much.",
          "Somewhere to sit at the top matters as much as the view itself.",
          "The good viewpoints ask for a walk, not a workout.",
          "We would rather split up than drag anybody up a hill.",
          "A picture we will still look at in a year is the point.",
        ],
      },
    ],
    otherReasons: [
      "Doing in the morning, seeing in the afternoon, every day.",
      "Doing when we are new to a place, seeing when we come back.",
      "Doing for the adults, seeing for the grandparents, on the same day.",
      "Seeing on the first day to get the shape of the place; doing after.",
      "Whichever the weather picks for us that morning.",
      "A hard thing once a trip; the rest is looking.",
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
          "Four stars is our floor; three feels like a compromise.",
          "A real concierge is worth more than a bigger room.",
          "A pool and a lobby matter for the kids as much as the room does.",
          "Room service on the first night is non-negotiable after a travel day.",
          "A hotel bar we would actually use is worth paying up for.",
          "We want the same brand in every city so the room is familiar.",
        ],
      },
      {
        value: "small_inn",
        label: "A small inn or B&B",
        detail: "Ten rooms, somebody who cooks breakfast, a real front desk.",
        reasons: [
          "Fewer than twenty rooms; more than that and it is a hotel.",
          "Breakfast made by somebody who lives here is the whole point.",
          "The person at the desk knows the good restaurants and calls ahead.",
          "A place with a story beats a place with a spa.",
          "We would rather share a wall than share a lobby with a hundred people.",
          "A working fireplace or a real garden is worth an extra night.",
        ],
      },
      {
        value: "rental",
        label: "A rental, with a kitchen",
        detail: "Groceries in the fridge, room for everyone to spread out.",
        reasons: [
          "Two bedrooms is the minimum; one is a hotel with a kitchenette.",
          "A washer and dryer earns the rental over a hotel for us.",
          "Breakfast in the room, in pajamas, is worth more than downstairs.",
          "Groceries the first night, cooking the second, is our rhythm.",
          "We would rather be four blocks off the main square than on it.",
          "A real front desk over a lockbox; a lockbox is a hard no.",
        ],
      },
      {
        value: "resort",
        label: "A resort where the whole trip lives",
        detail: "The pool, the beach, the meals, all in one place.",
        reasons: [
          "All-inclusive is worth the price; nickel-and-dime ruins the day.",
          "The kids need to roam without us watching every minute.",
          "On the beach, not near it; near it means a shuttle.",
          "A kids' club the kids actually like is the whole win.",
          "Four restaurants on property is our floor; two is not enough.",
          "We would rather stay a full week than move around.",
        ],
      },
    ],
    otherReasons: [
      "Hotel in the city, rental in the country.",
      "Rental for a week or more, hotel for anything shorter.",
      "A rental only if it has a real front desk; no lockboxes.",
      "Whichever puts us walking distance from the good part.",
      "Rental if the kids are with us, hotel if they are not.",
      "A hotel we know over a rental we do not, every time.",
      "Whichever has the pool the kids will use.",
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
          "Two hours in the car is our limit for a day trip.",
          "An automatic is a hard requirement; manual is a non-starter.",
          "A midsize SUV is what we book; nothing smaller.",
          "Free hotel parking is worth paying up for on the room.",
          "We would rather return the car early than pay for a day we don't use.",
          "We drive on the right; a left-hand-drive country is a no.",
        ],
      },
      {
        value: "transit",
        label: "Trains, subways, and the odd taxi",
        detail: "The city moves you; you skip the parking and the traffic.",
        reasons: [
          "First-class on a train longer than two hours; coach is fine under.",
          "A subway map on the phone is enough; we don't book cars ahead.",
          "A taxi at night, transit in the day, is our rule in a new city.",
          "An hour on transit is fine; ninety minutes is a taxi.",
          "We would rather walk twenty minutes than transfer once.",
          "Trains between cities, always; flights only between countries.",
        ],
      },
      {
        value: "walk",
        label: "Walkable enough not to need one",
        detail:
          "The good places are twenty minutes on foot from where you sleep.",
        reasons: [
          "Twenty minutes on foot is the sweet spot; forty is too far.",
          "A walkable neighborhood is worth paying up for on the room.",
          "Ten thousand steps a day, on average, is what a real trip feels like.",
          "Walking is how we find the places nobody told us about.",
          "A car in a city is a headache; we go without when we can.",
          "Cobblestones are a limit; we plan around them for anybody with a bad knee.",
        ],
      },
      {
        value: "driver",
        label: "A driver or private guide",
        detail: "Somebody local, at the door, who knows where to go.",
        reasons: [
          "A driver for the day out of town; our own two feet in it.",
          "A driver who speaks the language is worth twice the price.",
          "On day one a driver, from day two we figure it out ourselves.",
          "An eight-hour day is our shape; a half-day is not enough setup.",
          "A local guide beats a driver-only for anywhere with real history.",
          "We would rather book the same driver twice than a different one each day.",
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
          "Forty-five minutes is our wait limit; ninety is not.",
          "We book the hard reservation before we book the flights.",
          "One splurge meal per trip; the rest can be simple.",
          "Lunch is the line, dinner is quiet, is our rule.",
          "We would rather eat at the bar than skip a walk-in-only place.",
          "A tasting menu once a trip is our floor for anywhere with real food.",
        ],
      },
      {
        value: "quiet",
        label: "The local place with the empty table",
        detail: "Good food, nobody in the way, seated in five minutes.",
        reasons: [
          "Seated in five minutes or we walk; the kids will not wait.",
          "A loud restaurant ruins the meal; we ask about noise before booking.",
          "A table outside, always, if the weather allows.",
          "A six p.m. reservation is our sweet spot; eight is too late.",
          "A hidden good place beats a famous one every time.",
          "We would rather eat well twice than famously once.",
        ],
      },
    ],
    otherReasons: [
      "Lunch is the line, dinner is quiet, always.",
      "One splurge meal per trip; the rest simple.",
      "We book the one hard reservation before we book the flights.",
      "We would rather wander into a place than plan every meal.",
      "Forty-five minutes is our wait limit; two hours is not.",
      "Kids eat early and simple; adults eat later and better.",
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
          "An hour in a queue is fine; two is a waste of the day.",
          "We pay for the skip-the-line pass every time it exists.",
          "A timed ticket is worth booking six months out.",
          "The atmosphere of the crowd is half the reason we came.",
          "The kids handle a queue better mid-day than first thing.",
          "A private guide who skips the line beats a cheaper self-guided ticket.",
        ],
      },
      {
        value: "without",
        label: "Nine, before anybody else is up",
        detail: "Same view, no crowd, and you eat lunch after.",
        reasons: [
          "The first entry of the day is worth losing sleep for.",
          "An empty room is the room; a crowded one is not.",
          "The pictures are the record; we want them empty.",
          "An off-peak day beats an off-peak hour when the choice is ours.",
          "We would rather see three quiet places than one famous packed one.",
          "A shoulder-season week is worth planning the whole trip around.",
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
          "A suite over a room whenever the trip is longer than three nights.",
          "A view worth opening the curtains for is worth paying up for.",
          "Bad sleep ruins the next day; the mattress is not a place to save.",
          "A balcony we can eat breakfast on is our floor for a beach trip.",
          "A bathtub matters more than a shower for the way we travel.",
          "Club lounge access on a longer trip earns the room upgrade.",
        ],
      },
      {
        value: "meals",
        label: "The meals",
        detail: "The tasting menu, the reservation people fly in for.",
        reasons: [
          "We book the hard reservation before we book the flights.",
          "One tasting menu per trip is our floor for anywhere with real food.",
          "A three-hour dinner is not too long if the food earns it.",
          "The kids remember what we ate as much as what we did.",
          "A great meal is a memory nobody can take away; a nice room is not.",
          "We would rather eat like locals for a week than tourists for a night.",
        ],
      },
      {
        value: "experiences",
        label: "The experiences",
        detail: "The guide, the private tour, the hard-to-get ticket.",
        reasons: [
          "A private guide over a group tour, every time.",
          "A hard-to-get ticket booked six months out is worth the effort.",
          "One big experience per trip beats three small ones.",
          "A guide who speaks the language is worth twice the price.",
          "We can eat and sleep anywhere; we can't do this anywhere.",
          "A helicopter or a boat once a trip is a real memory.",
        ],
      },
      {
        value: "flights",
        label: "Getting there in comfort",
        detail: "Better seats, direct flights, less time in an airport.",
        reasons: [
          "Direct flights, always, even at twice the price.",
          "Business class over economy for anything longer than six hours.",
          "An overnight flight in a lie-flat seat beats a day flight in coach.",
          "A lounge day-pass on any layover longer than two hours.",
          "We would rather leave a day earlier than take a red-eye that lands at six.",
          "Early morning departures beat afternoon ones; less to go wrong.",
        ],
      },
    ],
    otherReasons: [
      "The room in the country, the meal in the city.",
      "One splurge per trip, wherever it lands.",
      "Spend on the room for a week-long stay; spend on the meal for a one-nighter.",
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
      "Anything anybody in the family cannot do or does not want in a plan — allergies, medications, mobility, altitude, seasickness, and phobias worth planning around (heights, small spaces, spiders, water, flying). Blank is a fine answer.",
    placeholder:
      "e.g. Veda's peanut allergy, Steph gets seasick on small boats, my knee can't do more than a mile of stairs, Steph is afraid of heights so skip the glass-floor observation decks.",
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
