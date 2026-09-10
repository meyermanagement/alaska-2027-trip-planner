// What Aly looks after besides the itinerary, as shown on the Meet Aly screen.
//
// The screen used to argue one thing only: that Aly answers the same question
// differently for different families. That argument is still the strongest one
// on the screen, but on its own it leaves a family thinking the app is a
// smarter trip idea generator, and then the wallet, the packing lists, the
// reminders, the budget and the on-trip answers all arrive later as surprises.
// Eight short lines fix that before the first question is ever asked. The
// first of them is the trip itself, because a screen that lists only the things
// around the plan reads as though the plan is somebody else's job.
//
// Each line names a thing the app actually does today (and budgeting is one of
// them: the trip carries a budget, prices per line, and a running total), in the words a person
// would use for the job rather than the words the codebase uses for the table.
// No line promises a saving, a discount or a deal, because none of that is
// real and the first screen is the worst place to be caught overselling.
//
// Each line also carries the question a person actually has about it, in their
// own words, because on this screen the line is a button: tapping it asks Aly
// that question and she answers it live, in front of somebody who does not have
// an account yet. A screen that says what she looks after is a claim; a screen
// where you can interrogate any one of those eight claims and watch her answer
// is an introduction to somebody.
export const ALY_ABILITIES = [
  {
    key: "trip",
    heading: "The trip itself",
    body: "The days in order -- flights, hotels, cars and what you are actually doing each morning -- planned with you and rearranged when one time changes, so there is one plan instead of six screenshots.",
    ask: "How do you build the days?",
  },
  {
    key: "wallet",
    heading: "Points and rewards",
    body: "Your airline, hotel and park programs in one wallet -- numbers, status and point balances -- so what you already have counts when I suggest where to stay.",
    ask: "How do our points change what you suggest?",
  },
  {
    key: "packing",
    heading: "Packing",
    body: "One list per trip, built from who is going and what the weather is doing there, with house lists you keep and reuse instead of rewriting.",
    ask: "How do you know what we need to pack?",
  },
  {
    key: "budget",
    heading: "Budgeting",
    body: "A price on each line of the trip and a running total against what you meant to spend, so a change to the plan shows up as a number the same day.",
    ask: "What happens to the budget when we change the plan?",
  },
  {
    key: "tips",
    heading: "Pro tips",
    body: "Short things worth knowing before you go, dated against your own trip, each one saying where it came from so you can check it.",
    ask: "Where do your tips come from?",
  },
  {
    key: "reminders",
    heading: "Reminders",
    body: "A morning email with what is due today, and a nudge about the passport months before the date on it becomes a problem.",
    ask: "What will you remind us about?",
  },
  {
    key: "onTrip",
    heading: "While you are there",
    body: "On the trip I answer from the day you are actually living: what is next, what is near you now, what the weather is doing at seven tonight.",
    ask: "What can you do while we are actually there?",
  },
  {
    key: "place",
    heading: "Rules of the place",
    body: "Passport expiry checked against your travel dates, what an entry rule asks for, and whether a place expects long sleeves or a jacket.",
    ask: "What do you check about the place we are going?",
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
- Only describe what the given description of that ability actually covers. Do not invent features, integrations, partners, prices, savings, discounts, or deals.
- Speak in the first person about what you do, and in the second person about the family. Do not describe yourself in the third person.
- Give one concrete example of the thing happening -- a moment, an hour, an item, a number -- rather than restating the description back.
- Do not say the family has told you anything yet, because they have not. If the answer depends on knowing them, say what you would ask for.
- Do not add citations, sources, links, or emoji.
- Use American English spelling.`;
