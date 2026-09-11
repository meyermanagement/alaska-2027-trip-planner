import {
  BAND_MIN,
  BAND_MAX,
  BAND_STEP,
  BAND_MIN_SPAN,
  BAND_DEFAULT,
} from "./dayBand";

// The questions that make up the family interview.
//
// One interview for the whole household, answered once by the primary. Most of
// the answers become preferences; two become household rules -- what nobody can
// do, and what happens to the animals. Every trip after that is planned against
// them until they are changed.
//
// Eleven questions for a household with an animal, ten for one without: the
// animals question is the only conditional one, and questionsFor below is what
// every caller filters through, so nobody with no animals is asked about them
// or counted short for it.
//
// Seven shapes are used:
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
//             stopped tapping would be putting words in their mouth. The one
//             ranked question carries no reason chips: chips can only belong
//             to one option, so under an order they would appear to explain
//             all four while explaining the first. The order is the reason,
//             and the own-words box takes whatever it cannot say.
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
//   band      Two handles on one track, used only for the hours a day runs.
//             The named alternatives it replaced -- dawn, mid-morning, midday,
//             afternoon, evening -- were all guesses at a number the family
//             already knows, and every one of them had to be translated back
//             into hours before Aly could put anything on a day. Two handles
//             skip the translation. The coarse bucket the older inference
//             rules read is derived from the band in lib/travelers/dayBand.js
//             rather than stored beside it, so there is one answer on file
//             and not two that can disagree.
//
//   text      A plain field, used only for limits (allergies, mobility, etc.).
//
//   pets      One row per animal on file, each with the same three plans:
//             comes with us, stays home, depends on the trip. Asked only of a
//             household that has an animal, and asked per animal because a
//             household answer is wrong the moment there are two of them --
//             the dog rides along, the cat stays with a neighbor, the horse is
//             not going anywhere. Every animal has to be given a plan before
//             the answer counts, since a blank row is not "no plan", it is a
//             question nobody finished. The plans and the sentence they are
//             stored as live in lib/travelers/animals.js.
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

// One more field, and the reason it exists: `sentence`.
//
// A label is what somebody reads on a card; it is not always the answer they
// are giving. "Nine, before anybody else is up" is a picture of a preference
// about crowds, not a preference about nine o'clock -- the question underneath
// it is whether the famous thing is worth the famous hour. The trouble was
// that the label was also what got saved: picking it filed the picture as the
// preference, so a family who answered a question about crowds came out of the
// interview on record as caring about a particular hour. Mark reported it.
//
// So an option whose label is a picture carries `sentence`, the same answer
// said in the abstract, and that is what is written to the travel file and what
// a derived answer's explanation says out loud. The picture stays on the screen
// where it is doing its job.
//
// A picture that cannot survive being read literally does not belong on the
// card at all. The doing-or-seeing question used to offer "A kayak on the
// water" against "A viewpoint over the water", which asked the right question
// and put a boat in the mind of every family who read it -- and a family who
// has never been in a kayak, seeing one quoted back at them, has every reason
// to think the wrong thing got written down. The options say what they mean now
// and mention no equipment.

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
        sentence: "A full day, three or four things in it.",
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
        sentence: "One thing a day, done well, and the rest unscheduled.",
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
    kind: "band",
    label: "When the day starts and ends",
    prompt: "What hours does your day actually run?",
    // The two handles the panel draws. The hint is the whole instruction: a
    // two-handle control is legible enough that a paragraph explaining it
    // would be a paragraph explaining a slider.
    startLabel: "Out the door",
    endLabel: "Day over",
    hint: "Drag either end. Half hours.",
    min: BAND_MIN,
    max: BAND_MAX,
    step: BAND_STEP,
    minSpan: BAND_MIN_SPAN,
    default: BAND_DEFAULT,
    // No reason chips, for the reason the ranked question has none: a chip
    // belongs to one named option, and there are no named options here. The
    // hours are the answer, and the own-words box takes what they cannot say
    // -- "earlier for the jet lag, later once we adjust" is a real answer and
    // it belongs in their handwriting rather than in a chip we wrote.
    otherReasons: [],
  },
  {
    slot: "doing_or_seeing",
    kind: "options",
    label: "Doing something, or looking at something",
    prompt: "Which is the day you would remember?",
    options: [
      {
        value: "doing",
        label: "Out doing something",
        detail: "In it, not beside it.",
        sentence: "Doing something active over looking at something.",
        reasons: [
          "One physical thing before lunch.",
          "A hard hike over an easy walk.",
          "A guided activity is worth it when it gets us doing the thing.",
        ],
      },
      {
        value: "seeing",
        label: "Taking something in",
        detail: "Somewhere to sit, something worth looking at.",
        sentence: "Looking at something over doing something active.",
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
    label: "Where you sleep",
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
    label: "How you get around",
    prompt: "What does getting around look like, most days?",
    options: [
      {
        value: "car",
        label: "A rental car, so you go where you want",
        detail: "Drive yourself, park at the trailhead, leave when you want.",
        sentence: "A rental car, driving themselves, over being moved around.",
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
        sentence: "Trains, subways and the odd taxi over a car.",
        reasons: [
          "First-class on a train over two hours.",
          "Trains between cities, always.",
          "A taxi at night, transit in the day.",
        ],
      },
      {
        value: "walk",
        label: "Walkable enough not to need one",
        sentence: "Somewhere walkable enough not to need a car.",
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
        sentence: "A driver or private guide rather than driving.",
        detail:
          "Somebody at the door in the morning, and nobody in your party driving.",
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
    label: "What you will actually eat",
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
        detail:
          "Good food, a table straight away, and you can hear each other.",
        reasons: [
          "Nobody in the way, and the kids can relax.",
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
        label: "Cooking where you are staying",
        short: "cooking in",
        detail: "A grocery run, and most dinners at the place you sleep.",
        reasons: [
          "A kitchen is a requirement, not a bonus.",
          "One grocery run on the day we arrive.",
          "Breakfast at home, every morning.",
        ],
      },
      {
        value: "familiar",
        // Offered only to a household with children on file. A household of
        // adults ticking this would file a preference about children it does
        // not have, and there is no version of the option that means anything
        // without them.
        needsKids: true,
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
        sentence: "The famous thing at its busiest, crowd and all.",
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
        sentence: "The famous thing early, before the crowd arrives.",
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
    // The one question with no reason chips, on purpose. Chips belong to a
    // single pick, and on an ordered answer they would belong to first place
    // only -- so they would sit under a four-item order looking like they
    // explained it while explaining a quarter of it. The order is its own
    // reason, and the own-words box below it takes anything the order cannot
    // say. Nothing downstream read these chips: no rule anywhere is written
    // against a money reason, so removing them costs the travel file nothing.
    label: "Where money is worth spending",
    prompt: "The budget won't cover them all. What do you protect first?",
    help: "Tap them in the order you would protect them. Two is a real answer -- anything you leave untapped I read as \u201cno strong feeling\u201d, not as last.",
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
      {
        value: "experiences",
        label: "The experiences",
        detail: "Something you could not have arranged on your own.",
      },
      {
        value: "flights",
        label: "Getting there in comfort",
        detail: "Better seats, direct flights, less time in an airport.",
      },
    ],
  },
  {
    slot: "limits",
    kind: "limits",
    label: "Anything anybody can't do",
    prompt:
      "Is there anything I should plan around? Allergies, medications, mobility, altitude, seasickness, or a phobia like heights, small spaces, spiders, water or flying. Blank is a fine answer.",
    // One limit per row, and each row says whose it is. Whose changes what I do
    // with it: a restaurant that has to be safe for one child is a different
    // search from a food the whole family avoids, and a glass floor is only
    // ruled out for the person afraid of heights.
    // No help line either. Each row asks whose it is on the row itself.
    placeholder:
      "e.g. peanut allergy, or seasick on small boats, or can't do more than a mile of stairs.",
  },
  {
    slot: "animals",
    kind: "pets",
    // Asked only when the household has an animal on file. Everything that
    // walks the interview -- the screen, the progress count, the Family
    // launcher -- filters on this, so a family with no animals never sees the
    // question and is never marked down for not answering it.
    when: "pets",
    label: "Whether the animals travel",
    prompt: "What happens to your animals when you travel?",
    help: "One answer each. If it changes trip to trip, say so and I will ask when the trip is real.",
    // The reason panel's heading, overridden here because "Why?" is the wrong
    // question to put under this one: nobody has to justify leaving the dog at
    // home, and what is actually useful is how they are looked after.
    ownWordsHeading: "Anything I should know about looking after them?",
    ownWordsPlaceholder:
      "e.g. the sitter comes twice a day, or the barn needs a week's notice.",
  },
  {
    slot: "moments",
    kind: "moments",
    label: "Favorite moments",
    prompt:
      "What do you still talk about from past trips? Your own favorite moments, in your own words, the kind of thing you would tell a friend about at dinner.",
    // No help line. The editor explains itself -- a box, an Add button, and
    // Edit and Remove on what is already there -- and the prompt already says
    // what a moment is, so a paragraph about it was copy in the way.
    placeholder:
      "e.g. a slow dinner on a terrace in Rome, the morning you found tide pools in Maine.",
  },
];

export const INTERVIEW_SLOT_IDS = INTERVIEW_QUESTIONS.map((q) => q.slot);

/**
 * Whether a question applies to this household.
 *
 * Only one question is conditional so far -- what happens to the animals --
 * and the condition is declared on the question rather than checked at each
 * call site, so adding another conditional question later is a data change.
 *
 * The default is deliberately the narrow one: a caller that does not say
 * whether the household has animals gets the interview WITHOUT the animals
 * question, because showing a question about animals to a family that has none
 * is worse than omitting it from a count somewhere.
 */
export function questionApplies(question, { hasPets = false } = {}) {
  if (!question) return false;
  if (question.when === "pets") return Boolean(hasPets);
  return true;
}

/** The questions this household is actually asked, in interview order. */
export function questionsFor(has) {
  return INTERVIEW_QUESTIONS.filter((q) => questionApplies(q, has));
}

/**
 * The same question with the options this household can actually answer.
 *
 * An option marked `needsKids` is dropped for a household with no children on
 * file: a household of adults ticking "Somewhere the kids will definitely eat"
 * files a preference about children who do not exist. Nothing is dropped when
 * the household shape is unknown, because guessing a family has no children is
 * the more damaging guess.
 */
export function optionsFor(question, ctx) {
  if (!question || !Array.isArray(question.options)) return question;
  if (!ctx || ctx.hasKids !== false) return question;
  const options = question.options.filter((o) => !o?.needsKids);
  if (options.length === question.options.length) return question;
  return { ...question, options };
}

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
export function nextQuestion(ledger, has) {
  const done = new Set([
    ...(ledger?.settled || []),
    ...(ledger?.skipped || []),
    ...(ledger?.told || []),
  ]);
  const questions = questionsFor(has);
  for (let i = 0; i < questions.length; i += 1) {
    if (!done.has(questions[i].slot)) {
      return { question: questions[i], index: i };
    }
  }
  return { question: null, index: questions.length };
}

/**
 * How many of the interview's questions this ledger has answered.
 *
 * Used by the Family launcher to decide whether to say "Get to know" (nothing
 * answered), "Finish getting to know" (some answered), or hide (all answered).
 */
export function interviewProgress(ledger, has) {
  const done = new Set([
    ...(ledger?.settled || []),
    ...(ledger?.skipped || []),
    ...(ledger?.told || []),
  ]);
  const questions = questionsFor(has);
  const answered = questions.filter((q) => done.has(q.slot)).length;
  return {
    answered,
    total: questions.length,
    complete: answered >= questions.length,
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
