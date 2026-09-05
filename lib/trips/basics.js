/**
 * What a trip is made of, and how much of one we have so far.
 *
 * A trip is seven questions. Where do you want to go, when, how do you get
 * there, where do you sleep, what do you do, how do you get around once you are
 * there, and roughly what you would like the whole thing to cost. Everything
 * else the app holds -- the itinerary, the packing list, the reservations, the
 * tasks -- is detail hung on those seven. A trip with an answer to each of them,
 * however loose, is plannable. A trip missing one of them has a hole in it that
 * no amount of detail elsewhere fills: knowing the restaurant on the fourth
 * night is worth nothing if nobody has worked out how you land.
 *
 * The seventh is the newest and the one people expect least, and it is here
 * rather than on a settings screen for the same reason as the other six: a trip
 * planned without it gets planned twice. It is a figure the family would like,
 * never a limit the app enforces.
 *
 * So this module exists to answer two questions and nothing else: which of the
 * seven does this trip have, and which one should be asked about next. That is the
 * whole of it. It does no writing, holds no state, and does not talk to the
 * model, which means the trip builder screen, the draft screen, the progress
 * line and Aly's own briefing all agree about what is missing because they are
 * all reading the same function.
 *
 * The answers are deliberately text and deliberately allowed to be vague.
 * "Probably fly into Kona" is a real answer to how you get there, and pushing
 * for a flight number at this stage is how a planning conversation turns into a
 * form. Detail arrives later, on its own screens, when it is actually known.
 */

import { money } from "@/lib/budget/budget";

/** The order the questions get asked in, which is the order a trip gets decided in. */
export const BASIC_IDS = [
  "where",
  "when",
  "getting_there",
  "staying",
  "doing",
  "getting_around",
  "budget",
];

/**
 * The seven, with the words used to ask about them.
 *
 * `question` is what Aly asks and what the draft screen puts above an empty
 * slot, so it is written as a question to a person rather than a field label.
 * `examples` are what a good enough answer looks like -- short, specific, and
 * plainly not a booking -- because the commonest reason one of these goes
 * unanswered is somebody thinking they have to have decided.
 */
export const BASICS = [
  {
    id: "where",
    ask: "I have not decided where to go on this trip. Ask me what I am after and suggest a few places.",
    label: "Where",
    heading: "Where you are going",
    question: "Where do you want to go?",
    why: "Everything else depends on this one, so it is the only one worth pushing on.",
    examples: [
      "The big island of Hawaii",
      "Somewhere in Portugal, we have not decided which part",
      "Tokyo, and maybe a few days somewhere quieter after",
    ],
    placeholder: "Kona and Hilo, on the big island",
  },
  {
    id: "when",
    ask: "I have not settled when this trip should be. Help me work out roughly when to go.",
    label: "When",
    heading: "When you are going",
    question: "When do you want to go?",
    why: "Even a season changes the advice: what is open, what it costs, and what the weather does.",
    examples: [
      "Spring break next year",
      "Ten days sometime next summer",
      "The week of Thanksgiving 2027",
    ],
    placeholder: "Spring break next year, about a week",
  },
  {
    id: "getting_there",
    ask: "How should we get there on this trip? A rough answer is fine.",
    label: "Getting there",
    heading: "How you get there",
    question: "How do you plan to get there?",
    why: "Flying, driving and sailing lead to completely different first and last days.",
    examples: [
      "Fly, probably into Kona",
      "Drive — it is nine hours and we would break it up",
      "Cruise out of Vancouver",
    ],
    placeholder: "Fly, probably into Kona",
  },
  {
    id: "staying",
    ask: "Where should we stay on this trip? Rough is fine — I do not want to book anything yet.",
    label: "Where you stay",
    heading: "Where you stay",
    question: "Where are you thinking of staying?",
    why: "A resort, a rental and a hotel in town produce different days, not just different bills.",
    examples: [
      "A condo near the water, with a kitchen",
      "One hotel the whole time, we do not want to move",
      "Split it: a few nights in town, then somewhere remote",
    ],
    placeholder: "A condo with a kitchen, walking distance to a beach",
  },
  {
    id: "doing",
    ask: "What should we actually do on this trip? Ask me what we are after first.",
    label: "What you do",
    heading: "What you do there",
    question: "What do you most want to do while you are there?",
    why: "One or two things you would be sorry to miss is enough to build a whole itinerary around.",
    examples: [
      "Swim with the manta rays, and see Volcanoes National Park",
      "Not much. Beach, books, one good dinner",
      "Ski four days, and whatever the nine-year-old will tolerate",
    ],
    placeholder: "Swim with the manta rays, see Volcanoes National Park",
  },
  {
    id: "getting_around",
    ask: "How would we get around once we are there on this trip?",
    label: "Getting around",
    heading: "How you get around",
    question: "How will you get around once you are there?",
    why: "It decides how far apart two things can be before the day stops working.",
    examples: [
      "Rent a car, everything is spread out",
      "Trains and walking",
      "Nothing — the resort has a shuttle and we are not leaving",
    ],
    placeholder: "Rent a car",
  },
  {
    id: "budget",
    ask: "What would be a sensible budget for this trip? Ask me what I have in mind.",
    label: "Budget",
    heading: "What you would like it to cost",
    question: "Roughly what would you like the whole trip to cost?",
    why: "A target, not a limit. It is what lets the plan be compared against something, and it is the difference between a suggestion you can act on and one you have to price yourself.",
    examples: [
      "Around $6,000 all in",
      "Five or six thousand, and we would rather spend it on the hotel than the flights",
      "No more than about $2,500 — it is a long weekend",
    ],
    placeholder: "Around $6,000 all in",
  },
];

/**
 * The trips column each of the seven is stored in.
 *
 * Four are named after themselves. The other three are not, and the callers that
 * write to a trip row or read one back need to know which is which -- the answer
 * used to be scattered across three files as `id === "where" ? "destination" : id`,
 * and the budget arriving as a number in a column called something else is
 * exactly the case that turns that trick into a bug.
 */
const BASIC_COLUMNS = {
  where: "destination",
  budget: "budget_target",
};

/**
 * Opened from one of the seven baseline cards on a draft's screen.
 *
 * The card presses a question into the drawer -- "What would be a sensible
 * budget for this trip? Ask me what I have in mind." -- and the whole point of
 * pressing it is that the answer ends up ON THE TRIP. That was not happening.
 * Asked on the Portugal draft, Aly gave a genuinely good answer, a $19,000 to
 * $26,000 range broken down by flights, lodging and food, never asked what the
 * family had in mind, and never offered to save anything; the next request put
 * thirteen line-item estimates on the itinerary and the trip's own budget was
 * still blank afterwards. The card asked again the next day, which reads as the
 * app forgetting rather than as nothing having been saved.
 *
 * So the focus says which of the seven was pressed and what finishing it means.
 */
export const BASIC_FOCUS_PREFIX = "basic:";

/** The focus string for one of the seven, or null for anything else. */
export function basicFocus(id) {
  return BASIC_IDS.includes(id) ? `${BASIC_FOCUS_PREFIX}${id}` : null;
}

/** The trips column behind one of the seven. `when` has no single column. */
export function basicColumn(id) {
  if (id === "when") return null;
  return BASIC_COLUMNS[id] || id;
}

/**
 * Every trips column the seven are read from, as a select list.
 *
 * A screen that draws "6 of 7 sketched in" has to load all seven, and the Trips
 * board did not: its select was written when there were six baselines, budget
 * was added as the seventh later, and the column it lives in was never added to
 * the list. A trip with a budget on it then read as a trip still missing one,
 * which is a worse card than no card. So the list is derived from BASICS here
 * instead of typed out there, and the eighth baseline cannot repeat it.
 */
export const BASIC_SELECT = Array.from(
  new Set([
    // `when` has no single column: a note in the family's own words, or the two
    // dates under it.
    "date_note",
    "start_date",
    "end_date",
    ...BASICS.map((basic) => basicColumn(basic.id)).filter(Boolean),
  ]),
).join(", ");

/** The one whose id you have, without every caller writing the same find(). */
export function basicById(id) {
  return BASICS.find((b) => b.id === id) || null;
}

/** Trimmed text, or "" for null, undefined, numbers and whitespace. */
function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * Where each of the seven lives on a trip row.
 *
 * Four of them are their own column and read straight across. The others were
 * already there under other names: where is the destination, when is the date
 * range -- or, on a draft, whatever the family said about when instead of a date
 * range -- and the budget is a number rather than a sentence, so it comes back
 * as money rather than as the digits stored in the column.
 */
export function basicValue(trip, id) {
  if (!trip) return "";
  if (id === "where") return clean(trip.destination);
  if (id === "when") return whenText(trip);
  if (id === "budget") return money(trip.budget_target);
  return clean(trip[id]);
}

/**
 * The when, in whatever form the trip actually has one.
 *
 * A draft is allowed to say "spring break next year" and nothing else, and that
 * counts: it is enough to know the season, the school holiday and roughly the
 * prices. A real date range counts too, obviously. What does not count is an
 * empty note beside empty dates, which is the state a brand new draft starts in.
 *
 * The note wins when both exist, because the note is what a person said and the
 * dates under it are a guess somebody wrote down to make the calendar work.
 */
export function whenText(trip) {
  if (!trip) return "";
  const note = clean(trip.date_note);
  if (note) return note;
  const start = clean(trip.start_date);
  const end = clean(trip.end_date);
  if (start && end) return `${start} to ${end}`;
  // One end of a range is a real answer to "when": a departure date with no
  // return still fixes the season, the prices and the school holiday.
  return start || end || "";
}

/** Whether a trip has any kind of answer to one of the seven. */
export function hasBasic(trip, id) {
  return basicValue(trip, id).length > 0;
}

/**
 * The seven with their answers, in asking order -- the shape the draft screen
 * renders and the shape the tests read.
 */
export function readBasics(trip) {
  return BASICS.map((basic) => {
    const value = basicValue(trip, basic.id);
    return { ...basic, value, answered: value.length > 0 };
  });
}

/** Just the blanks, in the order to ask about them. */
export function missingBasics(trip) {
  return readBasics(trip).filter((b) => !b.answered);
}

/** Just the ones with something in them. */
export function answeredBasics(trip) {
  return readBasics(trip).filter((b) => b.answered);
}

/**
 * How far along a draft is, as a count rather than a percentage, because seven
 * is few enough to say out loud and "50% planned" is a claim this app cannot
 * make.
 */
export function basicsProgress(trip) {
  const rows = readBasics(trip);
  const answered = rows.filter((b) => b.answered).length;
  return {
    answered,
    total: rows.length,
    missing: rows.length - answered,
    complete: answered === rows.length,
  };
}

/**
 * The next thing to ask about, or null when there is nothing left.
 *
 * Where comes first and everything else follows in a fixed order, so two people
 * building the same trip are asked the same questions in the same sequence and
 * the conversation does not wander.
 */
export function nextBasic(trip) {
  return missingBasics(trip)[0] || null;
}

/**
 * What is missing, said in a sentence, for the top of a draft screen.
 */
export function missingSentence(trip) {
  const missing = missingBasics(trip);
  if (missing.length === 0) return "";
  const labels = missing.map((b) => b.label.toLowerCase());
  if (labels.length === 1) return `Still to work out: ${labels[0]}.`;
  const last = labels.pop();
  return `Still to work out: ${labels.join(", ")} and ${last}.`;
}

/**
 * What a first message can look like, shown at full length beside the box.
 *
 * The same trick as the About You examples, for the same reason: a box asking for
 * "a few sentences" gets three words, and a box with four real paragraphs beside
 * it gets a paragraph. These are written the way somebody talks -- because half of
 * them will be dictated -- and they are deliberately uneven. One is three
 * sentences, one is a fragment, one has no dates in it at all. None of them is a
 * complete answer to all seven, which is the point: the conversation fills the rest
 * in, and an example that covered everything would read like a form to fill out.
 *
 * The first is Mark's, kept word for word, because it is the case the whole
 * feature was built around and the test that pins it reads this array.
 */
export const TRIP_IDEA_EXAMPLES = [
  "I want to go to the big island of Hawaii for spring break next year so that I can swim with the manta rays and see Volcanoes National Park.",
  "Somewhere in Portugal for about ten days, sometime next spring. We would fly, and we want to be in one apartment the whole time rather than moving every two nights. Mostly food and walking, one day trip to the coast.",
  "Long weekend in Chicago with the kids. Train there, hotel near the river, and the only thing we have actually promised them is the science museum.",
  "A cruise. No idea where — we have never done one, we are not sure we will like it, and we would want to fly somewhere warm to get on it rather than drive.",
];

/* -------------------------------------------------------------------------- */
/* Reading an opening line                                                    */
/* -------------------------------------------------------------------------- */

/**
 * What a first sentence already covers.
 *
 * "I want to go to the big island of Hawaii for spring break next year so that I
 * can swim with the manta rays and see Volcanoes National Park" answers three of
 * the seven before anybody has asked anything, and being asked "where do you want
 * to go?" straight after typing that is the exact moment a person decides the
 * app is not listening.
 *
 * This is a signal detector and not a parser, and the difference matters. It
 * reports that a sentence *appears* to say something about a component, and what
 * in the sentence made it think so. It does not extract a value, it is never
 * written to the database, and Aly does the real reading -- she has the whole
 * conversation, the family's saved preferences and an actual model. What this is
 * for is the screen you type on: showing three of seven lighting up as you write
 * is what gets somebody to write the sentence that mentions the manta rays
 * instead of typing "Hawaii" and pressing the button.
 *
 * Being wrong in one direction is much worse than the other. A missed mention
 * costs a question that was going to be asked anyway. A false one tells somebody
 * their trip covers something it does not, so every pattern here is a phrase
 * people actually use rather than a lone suggestive word.
 */

// Anything that ends a place name. "go to the big island of Hawaii for spring
// break" has to stop at "for", or the place becomes the rest of the sentence.
const PLACE_STOP =
  /\b(for|in|on|so|and|with|because|during|over|next|this|but|then|around|about|from|before|after|when|while|to see|to visit|to do|we|i|my|our)\b/;

const WHEN_PATTERNS = [
  // Months, named holidays and school breaks.
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/,
  /\b(jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\b/,
  /\b(spring break|winter break|fall break|summer break|school holidays?)\b/,
  /\b(thanksgiving|christmas|new year'?s?|easter|hanukkah|memorial day|labor day|fourth of july|july 4th|independence day|halloween)\b/,
  // Seasons, but only as a time and not as a place: "spring" alone is a town in
  // Texas and a thing in a mattress, "next spring" and "in the spring" are a
  // when.
  /\b(next|late|early|mid|this|coming)\s+(spring|summer|fall|autumn|winter)\b/,
  /\bin\s+the\s+(spring|summer|fall|autumn|winter)\b/,
  // A year on its own is a when. 2020 through 2099, so a street number or a
  // room rate does not become a date.
  /\b20[2-9]\d\b/,
  // Relative time, including the "sometime" hedge that means the answer is
  // vague rather than absent.
  /\b(next|this|coming)\s+(year|month|week|weekend|summer|winter|fall|autumn|spring)\b/,
  /\b(sometime|someday)\b/,
  // A length of stay: "ten days", "a long weekend", "two weeks".
  /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fourteen)\s+(night|nights|day|days|week|weeks|month|months)\b/,
  /\b(long weekend|a weekend|over a weekend)\b/,
  /\bfor\s+a\s+(week|weekend|month|fortnight)\b/,
];

const GETTING_THERE_PATTERNS = [
  /\b(fly|flying|flight|flights|flew|direct flight|nonstop)\b/,
  /\b(drive|driving|road trip|roadtrip|drove)\b/,
  /\b(cruise|cruising|sail|sailing|ship out of|embark)\b/,
  /\b(train|rail|amtrak|eurostar)\s*(there|out|up|down|in|to|from)?\b/,
  /\b(land in|fly into|flying into|fly in to|arrive into|arriving in|out of)\b/,
];

const STAYING_PATTERNS = [
  /\b(hotel|hotels|resort|resorts|condo|villa|cabin|cottage|lodge|hostel|airbnb|air bnb|vrbo|rental house|house rental|apartment|apartments|flat)\b/,
  /\b(camp|camping|campsite|rv|motorhome|glamping)\b/,
  /\b(stay|staying|stayed)\s+(at|in|on|near|with|somewhere)\b/,
  /\b(all[- ]inclusive|bed and breakfast|b&b|timeshare|dvc|stateroom|cruise cabin)\b/,
];

const DOING_PATTERNS = [
  // The clearest signal of all: a reason given for the trip.
  /\b(so (that )?(i|we) can|so (i|we) can|because (i|we) want to|in order to)\b/,
  /\b(to see|to visit|to swim|to hike|to ski|to snorkel|to dive|to surf|to eat|to try|to ride|to watch|to climb|to explore|to tour|to shop|to fish|to golf|to relax|to celebrate)\b/,
  /\b(see|visit|swim with|snorkel|scuba|dive|hike|hiking|ski|skiing|surf|surfing|kayak|fish|fishing|golf|golfing|climb|climbing|bike|biking|zip ?line|whale watch|safari)\b/,
  /\b(national park|national monument|museum|museums|beach|beaches|volcano|volcanoes|glacier|glaciers|reef|waterfall|waterfalls|theme park|water park|festival|concert|game|match|wedding|reunion|marathon|show|shows)\b/,
  /\b(want to|would like to|hoping to|dying to|would love to)\s+\w+/,
  /\b(relax|unwind|do nothing|read on the beach|eat our way)\b/,
];

const GETTING_AROUND_PATTERNS = [
  /\b(rent a car|rental car|car rental|hire a car|rent a jeep|rent a van)\b/,
  /\b(public transpo\w*|public transit|the metro|the subway|the tube|the bus|buses|trams?|streetcars?)\b/,
  // "Trains and walking" is how you get around; "taking the train up" is how you
  // get there. The difference is the pairing, so this wants two modes joined
  // rather than one mode named -- nobody describes their flight as "trains and
  // walking".
  /\b(trains?|trams?|metro|subway|buses|bus|ferries|ferry)\s*(?:,|and|\+|\/)\s*(walk\w*|bus\w*|tram\w*|bike\w*|train\w*|ferr\w*|metro|subway)\b/,
  /\b(walk\w*|bike\w*|cycl\w*)\s*(?:,|and|\+|\/)\s*(trains?|trams?|buses|bus|the bus|metro|subway|ferries|ferry)\b/,
  /\b(uber|lyft|taxi|taxis|cabs?|rideshare)\b/,
  /\b(walk everywhere|walkable|on foot|walking distance)\b/,
  /\b(shuttle|shuttles|resort transport|hotel shuttle|monorail|skyliner)\b/,
  /\b(rent bikes?|bike around|scooters?|mopeds?)\b/,
];

// Money, when the opening line already says what they would like to spend. A
// figure is the only reliable signal here: "cheap", "budget-friendly" and "not
// too expensive" are moods rather than numbers, and lighting the budget up for
// one of them would tell somebody their target was recorded when nothing was.
const BUDGET_PATTERNS = [
  /\$\s?\d[\d,.]*\s?(k|m)?\b/,
  /\b\d[\d,.]*\s?(k|thousand)\b/,
  /\b(budget|spend|spending|all in|all-in|price range)\b[^.]{0,30}\b\d/,
  /\b\d[^.]{0,30}\b(budget|to spend|all in|all-in)\b/,
  /\b(under|around|about|roughly|no more than|up to)\s*\$?\s?\d[\d,.]*\s?(k|thousand|dollars|bucks)?\b/,
];

/**
 * A place, if the sentence says one.
 *
 * Only from an explicit "to somewhere" or "in somewhere", never from
 * capitalization -- the box is dictated as often as it is typed, and dictation
 * capitalizes almost nothing.
 */
function findPlace(lower) {
  const patterns = [
    /\b(?:go|going|travel|traveling|travelling|head|heading|fly|flying|drive|driving|sail|sailing|get)\s+(?:back\s+)?to\s+(.+)/,
    /\b(?:trip|vacation|holiday|honeymoon|getaway)\s+to\s+(.+)/,
    /\b(?:visit|see|explore|tour)\s+(.+)/,
    /\b(?:days?|nights?|weeks?)\s+in\s+(.+)/,
    /\bsomewhere\s+in\s+(.+)/,
  ];
  for (const pattern of patterns) {
    const found = lower.match(pattern);
    if (!found) continue;
    let tail = found[1];
    const stop = tail.search(PLACE_STOP);
    if (stop > 0) tail = tail.slice(0, stop);
    // Anything that reads like a place rather than a leftover article. Two
    // characters rules out "a" and "to"; the article strip stops "the" being
    // the answer.
    const place = tail
      .replace(/[.,;:!?]+$/, "")
      .replace(/^(the|a|an)\s+/, "")
      .trim();
    // "go to the" leaves "the" behind, and an article on its own is not a
    // destination. Three characters rules out "a" and "to"; this rules out the
    // words that survive the strip only because nothing followed them.
    if (/^(the|a|an|there|here|it|that|this|one)$/.test(place)) continue;
    if (place.length >= 3) return place;
  }
  return "";
}

function firstMatch(lower, patterns) {
  for (const pattern of patterns) {
    const found = lower.match(pattern);
    if (found) return found[0].trim();
  }
  return "";
}

/**
 * Read a free-text trip idea and say which of the seven it seems to touch.
 *
 * Returns one row per component in asking order, each with `mentioned` and the
 * `evidence` that decided it, so a screen can show its work rather than
 * asserting.
 */
export function readIdea(text) {
  const lower = clean(text).toLowerCase();
  if (!lower) {
    return BASICS.map((b) => ({ id: b.id, mentioned: false, evidence: "" }));
  }

  const evidence = {
    where: findPlace(lower),
    when: firstMatch(lower, WHEN_PATTERNS),
    getting_there: firstMatch(lower, GETTING_THERE_PATTERNS),
    staying: firstMatch(lower, STAYING_PATTERNS),
    doing: firstMatch(lower, DOING_PATTERNS),
    getting_around: firstMatch(lower, GETTING_AROUND_PATTERNS),
    budget: firstMatch(lower, BUDGET_PATTERNS),
  };

  // A cruise is how you get there and, for most of the trip, where you sleep.
  // Saying so here saves asking somebody where they are staying on a ship.
  if (/\bcruise|cruising|sailing\b/.test(lower) && !evidence.staying) {
    evidence.staying = "cruise";
  }

  return BASICS.map((b) => ({
    id: b.id,
    mentioned: Boolean(evidence[b.id]),
    evidence: evidence[b.id] || "",
  }));
}

/** How many of the seven an opening line appears to cover. */
export function ideaCoverage(text) {
  const rows = readIdea(text);
  const covered = rows.filter((r) => r.mentioned);
  return {
    covered: covered.length,
    total: rows.length,
    ids: covered.map((r) => r.id),
    rows,
  };
}

/**
 * What to say under the box as somebody types, in the app's own voice.
 *
 * Never a scold and never a requirement. Seven of seven is not the goal -- Aly asks
 * about the rest, and that conversation is the feature.
 */
export function coverageLine(text) {
  const { covered, total, ids } = ideaCoverage(text);
  if (covered === 0) {
    return "Aly will ask about all seven. You can start with one line.";
  }
  const names = ids
    .map((id) => basicById(id)?.label.toLowerCase())
    .filter(Boolean);
  const left = total - covered;
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  if (left === 0) return `That covers all six — ${list}. Aly can draft it now.`;
  return `That already covers ${list}. Aly will ask about the other ${left === 1 ? "one" : left}.`;
}

/* -------------------------------------------------------------------------- */
/* Whether the trip is real yet                                               */
/* -------------------------------------------------------------------------- */

/**
 * The idea, with the one question nobody can read off it attached.
 *
 * Everything used to land as a draft, which is right for a daydream and wrong for
 * a trip somebody has already paid for -- the Baoase booking existed before any
 * of the Curacao planning did, and filing that as an idea is wrong in a way that
 * matters. A booked trip belongs on the calendar, gets a countdown, gets its
 * passports checked and its packing list built. An idea should do none of that.
 *
 * The app cannot infer which it is. "We're going to Hawaii in April" is exactly
 * what somebody says about a trip they have paid for AND about one they are
 * dreaming about, so guessing from the sentence would be confident and wrong.
 *
 * It used to be three buttons on the new-trip screen, and that was a mistake of a
 * different kind: they sat directly above the start button, so a button labelled
 * "Not sure yet -- ask me" read as a fourth answer to "Is this trip real yet?"
 * rather than as the way in for somebody with nothing typed. So the question goes
 * where questions belong -- Aly asks it, in the same reply as her other ones --
 * and this function's whole job is to make sure she cannot forget to.
 */
export function ideaAskingReality(text) {
  const said = String(text || "").trim();
  if (!said) return "";
  return `${said}\n\nBefore you create anything, ask me whether this trip is already booked, decided on but not booked, or still just an idea — and then use the status I give you.`;
}

/* -------------------------------------------------------------------------- */
/* What to offer next on a draft                                              */
/* -------------------------------------------------------------------------- */

/**
 * The next few things worth doing to a draft, worked out from the draft itself.
 *
 * Dynamic in the honest sense: nothing here is generated, nothing costs a model
 * call, and the same draft always produces the same list -- but the list changes
 * as the draft fills in, which is the part that matters. A draft with no dates is
 * offered dates; one with dates and no days is offered a day-by-day; one that is
 * finished is offered the way out.
 *
 * The six components are NOT in here. They have cards of their own on that
 * screen, and offering the same question twice on one page reads like a bug.
 *
 * Each entry carries the sentence to hand Aly, so pressing one starts a real
 * conversation rather than opening an empty box next to a suggestion.
 */
export function draftSuggestions(
  trip,
  { itinerary = [], tasks = [], packing = [] } = {},
) {
  const out = [];
  const t = trip || {};
  const place = String(t.destination || "").trim();
  const missing = missingBasics(t);
  const hasWhere = !missing.some((b) => b.id === "where");
  const hasWhen = !missing.some((b) => b.id === "when");

  // Dates first, because most of the rest of the app cannot do anything without
  // them: no countdown, no weather, no day-by-day, and no way out of Drafts.
  if (!t.start_date || !t.end_date) {
    out.push({
      id: "dates",
      label: "Work out the dates",
      why: "A day-by-day and a countdown both need a first and last day.",
      seed: t.date_note
        ? `We said ${t.date_note} for this trip. Help me turn that into actual dates.`
        : "Help me work out when we should go on this trip.",
    });
  } else if (t.dates_approximate) {
    out.push({
      id: "settle-dates",
      label: "Settle the dates",
      why: "These are penciled in, so moving the trip across would turn a guess into its real first and last day.",
      seed: "Are these dates still the best window for this trip? I want to settle them.",
    });
  }

  if (hasWhere && hasWhen && itinerary.length === 0) {
    out.push({
      id: "sketch",
      label: "Sketch out the days",
      why: "A rough shape to argue with beats an empty trip.",
      seed: `Sketch out a rough day-by-day for this trip${
        place ? ` in ${place}` : ""
      }. Keep it loose — I will move things around.`,
    });
  } else if (itinerary.length > 0) {
    out.push({
      id: "gaps",
      label: "Find the empty days",
      why: "The days with nothing on them are the ones worth a suggestion.",
      seed: "Which days on this trip have nothing on them yet, and what would you put there?",
    });
  }

  if (hasWhere && tasks.length === 0) {
    out.push({
      id: "book-first",
      label: "What to book first",
      why: "The things that sell out are worth knowing about while it is still a draft.",
      seed: `What should we book first for this trip${
        place ? ` to ${place}` : ""
      }, and how far ahead does each one need to be?`,
    });
  }

  // No packing suggestion, on purpose. A draft's dates and destination are both
  // still moving, and a list worked out against them is thrown away twice -- once
  // when the season changes under it and once when the trip does not happen. The
  // list is offered the moment the draft moves to Upcoming trips instead. See
  // lib/packing/draft.js.

  if (hasWhere && t.doing) {
    out.push({
      id: "regret",
      label: "Anything we would regret missing",
      why: "Worth asking before the days fill up.",
      seed: `Given what we already want to do${
        place ? ` in ${place}` : ""
      }, what would we regret missing?`,
    });
  }

  // Four is as many as anybody reads, and the order above is deliberate.
  return out.slice(0, 4);
}
