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
//   rank      The same named alternatives, but ordered rather than picked --
//             used only for the money question, where "we spend on the room"
//             is a thinner answer than "the room first, then the meals, and
//             the rest we do not feel strongly about". Tapped in order rather
//             than dragged: a drag needs a pointer and a steady hand, and the
//             one control on a phone that reliably has neither is the one
//             every accessibility guide warns about. Each tap stamps the next
//             number; tapping a numbered card takes it back out and renumbers
//             the rest.
//
//             A PARTIAL order is a real answer. Somebody who ranks two of the
//             four has said everything they mean, and the two they left alone
//             are recorded as unranked rather than as third and fourth --
//             writing "they care least about the flights" because they
//             stopped tapping would be putting words in their mouth. The
//             reason chips are those of whatever they put first, because the
//             reasons for protecting the room are the reasons the first pick
//             carries.
//
//   multi     The same named alternatives, but several of them -- used where a
//             single pick was forcing a family to lie. Where the family sleeps
//             and what the family eats are both like this: a household that
//             books a hotel in a city and a rental by the sea has two answers,
//             and a week of dinners is usually a rotation rather than one kind
//             of restaurant. Each question carries a `max`, because a
//             multi-select with no cap collects a tick on everything and says
//             nothing: two for where they sleep, three for the food.
//
//             What is LEFT OUT is read as "do not lead with this", never as
//             "never". Aly still raises an unticked option when nothing ticked
//             fits the destination, and the panel says so, because a family
//             that ticks a rental has not sworn off hotels.
//
//             The reason chips are those of the FIRST option tapped, the same
//             rule the ranked question follows. Showing every ticked option's
//             chips at once turns the drawer into three drawers, and the first
//             tap is the closest thing the shape has to a headline answer.
//
//             A mixed answer deliberately implies nothing for later questions.
//             The inference rules read a slot's single value, and "they eat at
//             the place with the line AND the quiet table" is exactly the case
//             where their queue tolerance is unknown -- so a multi answer with
//             more than one tick carries no value into the rules rather than
//             carrying its first tick as though the rest were not there.
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
    kind: "multi",
    max: 2,
    label: "Where the family sleeps",
    prompt: "Which of these would you actually book?",
    help: "Pick up to two. Two is a real answer -- plenty of families take a hotel in a city and a rental by the sea. What you leave out I will not lead with, but I will still raise it when nothing else fits.",
    options: [
      {
        value: "hotel",
        label: "A hotel, somebody making the bed",
        short: "a hotel",
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
        short: "a small inn or B&B",
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
        short: "a rental with a kitchen",
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
        short: "a resort",
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
    kind: "multi",
    max: 3,
    label: "What the family will actually eat",
    prompt: "Which of these are in the rotation on a good week?",
    help: "Pick as many as fit, up to three. A week of dinners is usually a rotation, so one tick is a strong answer and three is a normal one.",
    options: [
      {
        value: "line",
        label: "The local place with the line",
        short: "the local place with the line",
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
        short: "a quiet table",
        detail: "Good food, a table straight away, and we can hear each other.",
        reasons: [
          "Nobody in the way, and the kids can be kids.",
          "Seated in five minutes or we walk.",
          "A table outside, always.",
        ],
      },
      {
        value: "market",
        label: "Markets, stands and a counter",
        short: "a market counter",
        detail: "A paper plate, eaten standing up, and back out into the day.",
        reasons: [
          "Lunch should never cost an hour.",
          "A market on the first morning.",
          "We eat where the locals stand.",
        ],
      },
      {
        value: "cook",
        label: "Cooking where we are staying",
        short: "cooking in",
        detail: "A grocery run, and most dinners at the place we sleep.",
        reasons: [
          "A kitchen is a requirement, not a bonus.",
          "One grocery run on the day we arrive.",
          "Breakfast at home, every morning.",
        ],
      },
      {
        value: "familiar",
        label: "Somewhere the kids will definitely eat",
        short: "somewhere the kids will definitely eat",
        detail: "Something plain on the menu, and nobody negotiating at seven.",
        reasons: [
          "One safe thing on every menu.",
          "Fed before seven or the evening is gone.",
          "We split up rather than fight about dinner.",
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
    kind: "rank",
    label: "Where money is worth spending",
    prompt: "The budget won't cover them all. What do you protect first?",
    help: "Tap them in the order you would protect them. Two is a real answer -- anything you leave untapped I read as \u201cno strong feeling\u201d, not as last.",
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

/**
 * The prose sentence a ranked answer is stored as.
 *
 * Written to sit after the question's own label, because that is how every
 * other answer is filed -- "Where money is worth spending: The room first,
 * then the meals." -- and because the reader on the Preferences page and the
 * prompt Aly is given both take the row as one sentence.
 *
 * Aly reads preferences as sentences, not as arrays, so an order has to be
 * written out in words before it is filed: an array of option values in a
 * `body` column would be a row nothing downstream can read. `values` is the
 * order the primary tapped, best-protected first; anything the question offers
 * that is not in it is unranked, and unranked is said out loud rather than
 * left implied, because silence about the rest reads as "these come last".
 *
 * Returns null when nothing was ranked, so callers can fall back to treating
 * the question as unanswered rather than filing an empty claim.
 *
 * @param question one of INTERVIEW_QUESTIONS, kind "rank"
 * @param values array of option values, most protected first
 */
export function rankSentence(question, values) {
  const options = question?.options || [];
  const ranked = optionLabels(question, values);
  if (!ranked.length) return null;

  const lower = (label) => label.charAt(0).toLowerCase() + label.slice(1);
  const rest = ranked.slice(1).map(lower);
  const order =
    rest.length === 0
      ? `${ranked[0]} first.`
      : `${ranked[0]} first, then ${rest.join(", then ")}.`;

  const unranked = options
    .filter((o) => !ranked.includes(o.label))
    .map((o) => lower(o.label));
  if (!unranked.length) return order;
  const listed =
    unranked.length === 1
      ? unranked[0]
      : `${unranked.slice(0, -1).join(", ")} and ${unranked[unranked.length - 1]}`;
  // Phrased around "they left X unranked" rather than "X was left unranked"
  // because the labels do not agree in number -- "the experiences" is one
  // option with a plural name, and a verb picked from the count of unranked
  // items got that wrong in both directions.
  return `${order} They left ${listed} unranked, which means no strong feeling rather than last.`;
}

/**
 * The option labels a list of values refers to, in the order the values were
 * given -- "The room, then the meals" on the ranked question, "A hotel,
 * somebody making the bed" and "A rental, with a kitchen" on a multi one.
 * Used by the running summary, the practice recap and the save endpoint, all
 * of which want the answer back in the primary's own labels without a sentence
 * around it. Values the question no longer offers are dropped rather than
 * shown raw, and duplicates collapse.
 */
export function optionLabels(question, values) {
  const options = question?.options || [];
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const label = options.find((o) => o.value === value)?.label;
    if (label && !out.includes(label)) out.push(label);
  }
  return out;
}

/**
 * The shorter phrases a multi answer's values refer to -- "a hotel", "a rental
 * with a kitchen" -- for use inside a sentence. Falls back to the label when
 * an option has no short form, which reads worse but never reads wrong.
 */
export function optionShorts(question, values) {
  const options = question?.options || [];
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const opt = options.find((o) => o.value === value);
    const phrase = opt?.short || opt?.label;
    if (phrase && !out.includes(phrase)) out.push(phrase);
  }
  return out;
}

/**
 * The prose sentence a multi answer is stored as, written to sit after the
 * question's own label the same way every other answer is: "Where the family
 * sleeps: a hotel or a rental with a kitchen. Anything not listed is not
 * ruled out -- it is what I fall back on when nothing here fits."
 *
 * The tail is not filler. Without it the row reads as a whitelist, and the
 * next reader -- Aly, the Preferences page, or the primary six months from now
 * -- has no way to tell a considered exclusion from a family that ticked two
 * boxes and moved on.
 *
 * Returns null when nothing was ticked, so callers can treat the question as
 * unanswered rather than filing an empty claim.
 *
 * @param question one of INTERVIEW_QUESTIONS, kind "multi"
 * @param values array of option values, in the order they were tapped
 */
export function multiSentence(question, values) {
  const shorts = optionShorts(question, values);
  if (!shorts.length) return null;
  const listed =
    shorts.length === 1
      ? shorts[0]
      : `${shorts.slice(0, -1).join(", ")} or ${shorts[shorts.length - 1]}`;
  const everything = shorts.length >= (question?.options || []).length;
  if (everything) {
    return `${listed} -- all of them, so treat none of these as ruled out.`;
  }
  return `${listed}. Anything not listed is not ruled out, it is what I fall back on when nothing here fits.`;
}
