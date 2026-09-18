import {
  BAND_MIN,
  BAND_MAX,
  BAND_STEP,
  BAND_MIN_SPAN,
  BAND_DEFAULT,
} from "./dayBand";
import legacyLabels from "./interviewLegacyLabels.json";

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
//             Each selected option contributes reason chips. The first row
//             shares six places fairly; all remaining details stay reachable
//             through More details, without requiring an unrelated reason.
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
// Each option also carries a `more` list: three further chips, written against
// the same option, that the panel draws when More details is opened. Selected
// details stay visible when it is closed. That row used to be generated on the fly
// by a model call keyed to whichever chip had just been tapped. It cost a
// request on a screen where a family is moving fast, it could land late enough
// to move the row under a thumb, and it offered the family a sentence in their
// own voice that nobody had read before it was offered. So the follow-ups are
// written here instead, and the same two rules above apply to them: no
// restating the option's label or detail, and no repeating the question's own
// otherReasons, which share the row with them.
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
    prompt: "How much do you like to plan for each vacation day?",
    options: [
      {
        value: "packed",
        label: "A full day",
        detail: "Several planned activities, with time to get between them.",
        sentence: "Prefer several planned activities each day.",
        reasons: [
          "We like variety throughout the day.",
          "We can rest when we get home.",
          "We prefer shorter visits at each stop.",
        ],
        more: [
          "Group nearby activities to avoid backtracking.",
          "Keep lunch quick so there is more time to explore.",
          "Leave a little room for unexpected stops.",
        ],
      },
      {
        value: "one_thing",
        label: "One main activity",
        detail: "One planned activity, with the rest of the day left open.",
        sentence: "One thing a day, done well, and the rest unscheduled.",
        reasons: [
          "We need downtime between outings.",
          "One ticket a day; the rest should be walking.",
          "We like time for unplanned discoveries.",
        ],
        more: [
          "Leave time to return to our room for a break.",
          "We are happy to revisit the same neighborhood.",
          "Keep any extra stops optional and close by.",
        ],
      },
    ],
    otherReasons: [
      "Include a rest day every few days.",
      "Leave room to adjust for the weather.",
    ],
  },
  {
    slot: "day_shape",
    kind: "band",
    label: "When the day starts and ends",
    prompt: "When do you like to head out and finish for the day?",
    help: "Set your usual sightseeing hours, not your wake-up and bedtime. Breaks can fit within this window.",
    // The two handles the panel draws. The hint is the whole instruction: a
    // two-handle control is legible enough that a paragraph explaining it
    // would be a paragraph explaining a slider.
    startLabel: "Out the door",
    endLabel: "Finished for the day",
    hint: "Adjust either end in 30-minute steps.",
    ownWordsHeading: "Anything to add about your schedule? (Optional)",
    ownWordsPlaceholder:
      "For example, an afternoon break or an earlier start for a special outing.",
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
    label: "Activities and sightseeing",
    prompt: "Do you prefer active experiences or relaxed sightseeing?",
    options: [
      {
        value: "doing",
        label: "Active experiences",
        detail: "Get moving or take part in an activity.",
        sentence: "Prefer active experiences over relaxed sightseeing.",
        reasons: [
          "We enjoy learning a new skill.",
          "We prefer a challenging hike to an easy walk.",
          "A guided activity is worth it for the instruction.",
        ],
        more: [
          "Rent equipment rather than bring our own.",
          "Keep active outings to about half a day.",
          "Offer an easier version when possible.",
        ],
      },
      {
        value: "seeing",
        label: "Relaxed sightseeing",
        detail: "Enjoy the sights without a physically demanding activity.",
        sentence:
          "Prefer relaxed sightseeing over physically demanding activities.",
        reasons: [
          "A twenty-minute walk, not an hour.",
          "Somewhere we can drive most of the way.",
          "We like time to linger at each stop.",
        ],
        more: [
          "Include places to sit and rest.",
          "Look for shade on hot days.",
          "Choose routes with few stairs.",
        ],
      },
    ],
    otherReasons: [
      "Adjust outdoor plans for the weather.",
      "Let people sit out activities they do not want to do.",
    ],
  },
  {
    slot: "staying",
    kind: "multi",
    max: 2,
    label: "Where you sleep",
    prompt: "What kinds of places do you like to stay?",
    help: "Choose up to two. Aly will start with these, but can suggest others when they fit the trip better.",
    options: [
      {
        value: "hotel",
        label: "Hotel",
        short: "a hotel",
        detail: "A private room with hotel services.",
        reasons: [
          "Four stars is our minimum.",
          "A helpful concierge matters more than a bigger room.",
          "A hotel bar we would actually use.",
        ],
        more: [
          "Breakfast included in the room price.",
          "A pool we would actually swim in.",
          "Late checkout when available.",
        ],
      },
      {
        value: "small_inn",
        label: "Small inn or B&B",
        short: "a small inn or B&B",
        detail: "A smaller property with a more personal feel.",
        reasons: [
          "Locally owned rather than a chain.",
          "A host who can recommend local places.",
          "Historic character matters more than extra amenities.",
        ],
        more: [
          "A freshly cooked breakfast.",
          "We are comfortable with a smaller room.",
          "A private bathroom is essential.",
        ],
      },
      {
        value: "rental",
        label: "Vacation rental",
        short: "a rental with a kitchen",
        detail: "An apartment or house with a kitchen and space to spread out.",
        reasons: [
          "Two bedrooms is the minimum.",
          "A washer and dryer on site.",
          "We cook at least half our dinners.",
        ],
        more: [
          "A dining table with enough seats.",
          "Parking on the property.",
          "Walking distance to a grocery store.",
        ],
      },
      {
        value: "resort",
        label: "Resort",
        short: "a resort",
        detail: "The pool, the beach, the meals, all in one place.",
        reasons: [
          "Meals and activities included in the price.",
          "On the beach, not near it.",
          "A supervised activity program for the kids.",
        ],
        more: [
          "More than one restaurant on site.",
          "A quiet pool as well as a busy one.",
          "Help arranging excursions outside the resort.",
        ],
      },
    ],
    otherReasons: [
      "A quiet room away from nightlife.",
      "Within walking distance of places we want to visit.",
    ],
  },
  {
    slot: "getting_around",
    kind: "options",
    label: "How you get around",
    prompt: "How do you usually prefer to get around at your destination?",
    options: [
      {
        value: "car",
        label: "Drive",
        detail:
          "Use your own car or rent one, with control over your route and schedule.",
        sentence: "Prefer driving, using a personal or rental car.",
        reasons: [
          "Two hours in the car is our limit.",
          "An automatic transmission is essential.",
          "We will pay more for accommodation with parking included.",
        ],
        more: [
          "Plan driving breaks on longer routes.",
          "Enough room for everyone and our luggage.",
          "No driving after dark.",
        ],
      },
      {
        value: "transit",
        label: "Public transportation",
        detail: "Use trains, subways, and buses, with taxis when needed.",
        sentence: "Prefer public transportation, with taxis when needed.",
        reasons: [
          "Choose first-class on a train ride longer than two hours.",
          "Trains rather than driving between cities.",
          "A taxi at night, transit in the day.",
        ],
        more: [
          "Stay near a station or transit stop.",
          "Reserve train seats in advance when possible.",
          "Keep transfers to a minimum when carrying luggage.",
        ],
      },
      {
        value: "walk",
        label: "Mostly walk",
        sentence: "Somewhere walkable enough not to need a car.",
        detail: "Stay somewhere walkable and explore on foot.",
        reasons: [
          "Twenty minutes on foot is the sweet spot.",
          "We will pay more to stay in a walkable location.",
          "A car in a city is a headache.",
        ],
        more: [
          "Mostly flat walking routes.",
          "Use a taxi in bad weather.",
          "Everything we need inside one neighborhood.",
        ],
      },
      {
        value: "driver",
        label: "Hire a driver or private guide",
        sentence: "A driver or private guide rather than driving.",
        detail:
          "Arrange transportation so nobody in your group needs to drive.",
        reasons: [
          "A driver who speaks the language.",
          "A private guide who knows where to go.",
          "Pickup and drop-off at our accommodation.",
        ],
        more: [
          "The same driver throughout the trip when possible.",
          "Half-day outings rather than full days.",
          "A guide who will change the plan when we ask.",
        ],
      },
    ],
    otherReasons: [
      "Use a different option when it makes a route easier.",
      "Allow extra time on arrival and departure days.",
    ],
  },
  {
    slot: "food",
    kind: "multi",
    max: 3,
    label: "Meals on a trip",
    prompt: "How do you like to eat when you travel?",
    help: "Choose up to three. Different meals can call for different options.",
    options: [
      {
        value: "line",
        label: "Sought-after restaurants",
        short: "sought-after restaurants",
        detail: "Restaurants worth planning ahead or waiting for.",
        reasons: [
          "Forty-five minutes is worth the wait.",
          "Plan around a hard-to-get restaurant reservation.",
          "One splurge meal a trip: a tasting menu, then the rest simple.",
        ],
        more: [
          "Put us on the waitlist and we will walk the block.",
          "We will eat at five or at nine to get in.",
          "Book it the day the calendar opens.",
        ],
      },
      {
        value: "quiet",
        label: "Quiet, relaxed restaurants",
        short: "quiet, relaxed restaurants",
        detail: "A comfortable table where you can hear each other.",
        reasons: [
          "Enough space to feel comfortable.",
          "We prefer another restaurant if the wait is more than five minutes.",
          "An outdoor table when the weather is good.",
        ],
        more: [
          "Somewhere we can walk to from the room.",
          "A menu we can read before we sit down.",
          "We would rather eat early than wait.",
        ],
      },
      {
        value: "market",
        label: "Markets and casual food",
        short: "markets and casual food",
        detail: "Food stalls, local markets, and quick, informal meals.",
        reasons: [
          "We prefer a quick lunch so we can keep exploring.",
          "We like trying small portions from different stalls.",
          "We look for places popular with local residents.",
        ],
        more: [
          "Check payment options before visiting a market.",
          "One proper sit-down meal a day is plenty.",
          "We like trying seasonal specialties.",
        ],
      },
      {
        value: "cook",
        label: "Cooking in",
        short: "cooking in",
        detail: "Prepare some meals where you are staying.",
        reasons: [
          "A kitchen is a requirement, not a bonus.",
          "Cooking helps keep meal costs down.",
          "Have breakfast where we are staying each morning.",
        ],
        more: [
          "A market within walking distance of the kitchen.",
          "We eat out at lunch and cook at night.",
          "Plan a grocery stop soon after arrival.",
        ],
      },
      {
        value: "familiar",
        // Offered only to a household with children on file. A household of
        // adults ticking this would file a preference about children it does
        // not have, and there is no version of the option that means anything
        // without them.
        needsKids: true,
        label: "Familiar food for the kids",
        short: "places with familiar food for the kids",
        detail: "Menus with choices your children already enjoy.",
        reasons: [
          "At least one familiar dish on every menu.",
          "Early dinners work best for the kids.",
          "Options for adults and children at the same restaurant.",
        ],
        more: [
          "A relaxed setting where children are welcome.",
          "Bread on the table quickly.",
          "The kids will order off the adult menu.",
        ],
      },
    ],
    otherReasons: [
      "Check menus for dietary needs before suggesting a place.",
      "Include nearby meal options on sightseeing days.",
    ],
  },
  {
    slot: "crowds",
    kind: "options",
    label: "Crowds and lines",
    prompt: "How do you feel about crowds and lines at popular sights?",
    options: [
      {
        value: "with",
        label: "Worth it for a place I want to see",
        detail: "A crowd or a wait does not automatically rule it out.",
        sentence: "Willing to accept crowds or wait for a place worth seeing.",
        reasons: [
          "Seeing the main sights is a priority.",
          "A lively atmosphere can be part of the experience.",
          "We can be flexible about how long a visit takes.",
        ],
        more: [
          "Pay extra for an entry option that reduces waiting.",
          "Leave extra time around a popular attraction.",
          "Book timed entry when available.",
        ],
      },
      {
        value: "without",
        label: "Find a quieter way to visit",
        detail: "Choose a quieter time or a less crowded alternative.",
        sentence: "Prefer quieter times or less crowded alternatives.",
        reasons: [
          "Crowds make it harder to enjoy a place.",
          "We prefer space to explore at our own pace.",
          "Long lines take too much time out of the day.",
        ],
        more: [
          "Take the first entry of the day if it is quieter.",
          "Choose a less-famous place with a similar experience.",
          "Travel outside the busiest season when possible.",
        ],
      },
    ],
    otherReasons: [
      "Check expected wait times before deciding.",
      "Have a backup nearby if the line is too long.",
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
    prompt: "If you need to trim the budget, what would you protect first?",
    help: "Choose your highest priority first, then the next. Rank as many as matter to you; anything left unranked means no strong preference, not last place.",
    ownWordsHeading: "Anything to add about your priorities? (Optional)",
    ownWordsPlaceholder:
      "For example, a nonstop flight matters more than a better seat.",
    options: [
      {
        value: "room",
        label: "The room",
        detail: "A nicer bed, a better view, more space to come back to.",
      },
      {
        value: "meals",
        label: "The meals",
        detail: "Restaurants and food experiences you want to make room for.",
      },
      {
        value: "experiences",
        label: "The experiences",
        detail: "Activities, tours, and admission to places you want to see.",
      },
      {
        value: "flights",
        label: "The flight",
        detail:
          "Better seats, nonstop flights, or more convenient flight times.",
      },
    ],
  },
  {
    slot: "limits",
    kind: "limits",
    label: "Needs and limits to plan around",
    prompt: "Are there any needs or limits Aly should plan around?",
    // The only question that does not get the lighter tone, on purpose.
    // Somebody typing a child's peanut allergy into a box is not in the mood
    // for a joke, and a playful prompt here would read as the app not taking
    // the answer seriously. What the rewrite does instead is let the question
    // land on its own line and move the examples into the help paragraph, so
    // the opening reads as one question rather than an interrogation.
    help: "For example, allergies, accessibility needs, medication schedules, motion sickness, or fears. Add one item at a time and choose who it applies to. Share only what you want used for planning, or skip this question.",
    // One limit per row, and each row says whose it is. Whose changes what I do
    // with it: a restaurant that has to be safe for one child is a different
    // search from a food the whole family avoids, and a glass floor is only
    // ruled out for the person afraid of heights.
    // No help line either. Each row asks whose it is on the row itself.
    placeholder:
      "For example, a peanut allergy, motion sickness on small boats, or difficulty with stairs.",
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
    prompt: "Do your pets usually travel with you or stay behind?",
    help: "Choose a usual plan for each animal. Pick “Depends on the trip” if it varies.",
    // The reason panel's heading, overridden here because "Why?" is the wrong
    // question to put under this one: nobody has to justify leaving the dog at
    // home, and what is actually useful is how they are looked after.
    ownWordsHeading: "Any care arrangements to keep in mind? (Optional)",
    ownWordsPlaceholder:
      "e.g. the sitter comes twice a day, or the barn needs a week's notice.",
  },
  {
    slot: "moments",
    kind: "moments",
    label: "Favorite moments",
    prompt: "What are some favorite moments from past trips?",
    // The prompt used to explain its own metaphor in the same breath as using
    // it -- it asked what you still talk about and then said "the kind of
    // thing you would tell a friend about at dinner". The question now is the
    // picture, and what a moment is has moved into the help line below it,
    // where the editor's own controls are already doing half the explaining.
    help: "Add one memory at a time. A small moment counts, and you can skip this if nothing comes to mind.",
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

/** Exact, known labels only. Never guess an option from words in free text. */
export function optionForAnswer(question, answer) {
  return (
    (question?.options || []).find(
      (option) =>
        option.value === answer ||
        option.label === answer ||
        legacyLabels[question.slot]?.options?.[option.value] === answer,
    ) || null
  );
}

/** Keep old base-answer rows out of the separate reasons list. */
export function isInterviewBaseRow(question, body) {
  return [question?.label, legacyLabels[question?.slot]?.label]
    .filter(Boolean)
    .some((label) => String(body || "").startsWith(`${label}: `));
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
