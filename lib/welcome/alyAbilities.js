// What Aly looks after besides the itinerary, as shown on the Meet Aly screen.
//
// The screen used to argue one thing only: that Aly answers the same question
// differently for different families. That argument is still the strongest one
// on the screen, but on its own it leaves a family thinking the app is a
// smarter trip idea generator, and then the wallet, the packing lists, the
// reminders, the budget and the on-trip answers all arrive later as surprises.
// Eight short lines fix that before the first question is ever asked. The first
// of them is building the trip, because a screen that lists only the things
// around a plan reads as though making the plan is somebody else's job and this
// app is where you file the result. There is no second line about maintaining
// the trip: two lines both starting "the days" read as one idea said twice, and
// the useful half of the pair is the one that begins with nothing decided.
//
// Each one is three short bullets rather than a paragraph. They were paragraphs,
// and eight paragraphs on the first screen a stranger reads is a wall: the
// specifics that make the claims worth reading sat mid-sentence, where nobody
// scanning found them. Three bullets per heading is the same eight facts at a
// third of the reading, with the concrete detail at the end of a line the eye is
// already on. Three is the cap, because a fourth is always the one that could
// have been left out. Length is measured rather than guessed: every bullet holds
// to two rendered lines at 390 and at 320 pixels wide, which puts the ceiling at
// about sixty-five characters, and past it a bullet takes three lines on a phone
// and the list stops reading as a list.
//
// Each line names a thing the app actually does today (and budgeting is one of
// them: the trip carries a budget, prices per line, and a running total), in the words a person
// would use for the job rather than the words the codebase uses for the table.
// No line promises a saving, a discount or a deal, because none of that is
// real and the first screen is the worst place to be caught overselling. The
// budgeting line is the one that has to be read carefully for this: planning to
// a number and saying where a cut would hurt least are advice, which Aly gives,
// and both are worded as advice. Finding a fare, holding a price or getting a
// discount are not, and none of those are claimed.
//
// Every line has to carry the same three things, because they are the only
// reasons any of this beats the notes app and a folder of confirmations:
//
//   personalized   -- shaped around the people actually going, not a traveler
//   contextual     -- set against this trip, this day, this place, these dates
//   simplified     -- one list, one number, one answer, instead of the tabs
//
// The three bullets are usually those three ideas in that order, which is both
// why three is enough and why none of them reads as filler.
//
// A line that only names a feature ("a budget", "packing lists") describes a
// spreadsheet. The three ideas are what make it Aly, so none of them should have
// to be inferred from a screen a stranger reads once.
//
// Each line also carries the question a person actually has about it, in their
// own words, because on this screen the line is a button: tapping it asks Aly
// that question and she answers it live, in front of somebody who does not have
// an account yet. A screen that says what she looks after is a claim; a screen
// where you can interrogate any one of those eight claims and watch her answer
// is an introduction to somebody. The bullets are also the whole truth Aly is
// handed when that happens, so the screen and the prompt cannot drift apart into
// two different versions of what this app promises.
//
// The order is not the order the app was built in and not the order a product
// manager would list it in. It is the order a family cares, because nobody reads
// eight of anything: building the trip, then the money twice over, then the help
// on the days themselves, and the chores last. Whatever sits in the first two
// positions is the whole screen for most people, so the money follows the plan
// rather than waiting behind the packing list.
export const ALY_ABILITIES = [
  {
    // Deliberately first, and deliberately about the part before anything is
    // decided. A family that reads only about a plan being kept in order assumes
    // they have to turn up with the plan already made and that this app is
    // somewhere to keep it, which is the opposite of what happens.
    key: "build",
    heading: "Building the trip",
    points: [
      "Say Alaska in August and I hand back one ordered draft",
      "Built around your people: how early you start, how far you walk",
      "Off your calendar until you say it is real, and I book nothing",
    ],
    // Two sentences rather than a dash: the double hyphen is how this file writes
    // an aside in a comment, and it was rendering as two hyphens on the chip.
    ask: "We have not decided anything yet. Can you plan it?",
  },
  {
    key: "budget",
    heading: "Budgeting",
    // Three claims, in the order they matter to somebody who has not spent the
    // money yet. Planning to the number comes first: a budget that only reports
    // is a receipt, and the useful version is the one that shapes the draft
    // before anything is booked. Then the running total, which is the mechanical
    // part. Then where to cut, which is the question a family asks out loud, and
    // it is worded as advice about their own trip rather than as a saving, a deal
    // or a fare, because advice is the part that is real.
    points: [
      "Say what you want to stay under and I build the trip to it",
      "Every line priced into one running total that moves with the plan",
      "Over the number, I say where your family would feel a cut least",
    ],
    ask: "Can you plan this around what we want to spend?",
  },
  {
    // Three sides to this, and the line used to name only one. Spending points
    // is the obvious half; the wallet also knows what each card earns and what
    // it comes with, which is what decides where a booking gets charged and
    // which credits are about to go unused. The catalog behind it carries earn
    // rates, statement credits and perks per card, so this is a claim the app
    // can keep.
    key: "wallet",
    heading: "Points and rewards",
    points: [
      "Your airline, hotel and card programs kept in one wallet",
      "The hotel read as 30,000 of your points, not $340",
      "Dinner on the card earning 3x, credits spent before they expire",
    ],
    ask: "How do our points and perks change what you suggest?",
  },
  {
    key: "onTrip",
    heading: "While you are there",
    points: [
      "What is next, what is near you, what the weather does tonight",
      "Answered from the day you are living, your plan already in it",
      "One question instead of a search and three reviews",
    ],
    ask: "What can you do while we are actually there?",
  },
  {
    key: "packing",
    heading: "Packing",
    points: [
      "One list per trip, from who is going and the real forecast",
      "His boots, her medicine, the car seat, and nothing else",
      "Your house lists kept and reused, so nobody writes one twice",
    ],
    ask: "How do you know what we need to pack?",
  },
  {
    key: "place",
    heading: "Rules of the place",
    points: [
      "Your passport expiry checked against your own travel dates",
      "What an entry rule asks of the people on this particular trip",
      "Whether the place expects long sleeves or a jacket",
    ],
    ask: "What do you check about the place we are going?",
  },
  {
    key: "reminders",
    heading: "Reminders",
    points: [
      "One morning email with what is due today for your family",
      "Counted back from your own departure, not a generic checklist",
      "A passport raised months before the date on it becomes a problem",
    ],
    ask: "What will you remind us about?",
  },
  {
    key: "tips",
    heading: "Pro tips",
    points: [
      "Short things worth knowing, picked for where you are going",
      "Dated to your days: the pass to buy before you fly",
      "Each one says where it came from, so you can check it yourself",
    ],
    ask: "Where do your tips come from?",
  },
];

// What Aly is told when somebody taps one of the eight lines. Deliberately
// narrow: she is answering about one part of this app to somebody who has not
// signed up, so the body of that line is the whole truth she is allowed to work
// from, and inventing a feature here would be a promise the app has to keep.
export const ABILITY_SYSTEM = `You are Aly, the travel assistant that lives inside a family's household planner.

Somebody who has just met you, and who has not entered any of their own information yet, has tapped one of the things you look after and asked you about it. Answer as yourself, about that one part of the app.

Rules:
- Two or three sentences. Say the thing and stop. No bullet lists, no numbered lists, no headings.
- Only describe what the lines you are given about that ability actually cover. Do not invent features, integrations, partners, prices, savings, discounts, or deals. Where those lines cover advice about a family's own money -- planning to a budget they set, or which part of their own plan to trim -- that advice is yours to give; a fare you would find, a price you would hold, a discount or a deal is not.
- Speak in the first person about what you do, and in the second person about the family. Do not describe yourself in the third person.
- Give one concrete example of the thing happening -- a moment, an hour, an item, a number -- rather than restating the description back.
- Do not say the family has told you anything yet, because they have not. Where the answer depends on their trip, put it in the future and treat those details as something that will exist -- "once your dates and travelers are in", "as soon as the hotel is on the trip". Do not say you will ask them for anything, do not ask them a question back, and do not list what you need from them: this is an introduction, not the start of a form.
- Show the three things that make this worth having rather than claiming them: that the answer is shaped around this family, that it is set against their own trip, day, dates or place, and that it saves them work they would otherwise do by hand. Never use the words personalized, contextual or simplified.
- Do not add citations, sources, links, or emoji.
- Use American English spelling.`;
