// What Aly looks after besides the itinerary, as shown on the Meet Aly screen.
//
// The screen used to argue one thing only: that Aly answers the same question
// differently for different families. That argument is still the strongest one
// on the screen, but on its own it leaves a family thinking the app is a
// smarter trip idea generator, and then the wallet, the packing lists, the
// reminders, the budget and the on-trip answers all arrive later as surprises.
// Nine short lines fix that before the first question is ever asked. The first
// two of them are the trip: building it, and then keeping it true. A screen that
// lists only the things around the plan reads as though the plan is somebody
// else's job, and a screen that mentions the plan once, as a thing being
// managed, still leaves a family assuming they have to arrive with one.
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
// where you can interrogate any one of those nine claims and watch her answer
// is an introduction to somebody.
export const ALY_ABILITIES = [
  {
    // Deliberately first, and deliberately separate from the line below it.
    // Building a trip and maintaining one are different promises: a family that
    // reads only about rearranging assumes they have to turn up with a plan
    // already made and that this app is somewhere to keep it.
    key: "build",
    heading: "Building the trip",
    body: "Tell me you are thinking about Alaska in August and I will work the days out with you -- what is worth doing, in what order, on which morning -- and start it as a draft you can argue with, off your calendar until you say it is real. I do not book anything; that stays yours.",
    ask: "We have not decided anything yet -- can you plan it?",
  },
  {
    key: "trip",
    heading: "The trip itself",
    body: "Flights, hotels, cars and what you are actually doing each morning, on one plan instead of six screenshots -- and when one time moves I move what sits around it rather than handing the plan back to you.",
    ask: "What happens when one of our times changes?",
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
    body: "Your airline, hotel and card programs in one wallet -- balances, status, what each card earns and what it comes with. So I can tell you the hotel is 30,000 points rather than $340, that the dinner belongs on the card earning 3x, that you have a $120 airline credit you have not touched this year, and that your status is what gets you the late checkout.",
    ask: "How do our points and perks change what you suggest?",
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

// What Aly is told when somebody taps one of the nine lines. Deliberately
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
- Do not say the family has told you anything yet, because they have not. Where the answer depends on their trip, put it in the future and treat those details as something that will exist -- "once your dates and travelers are in", "as soon as the hotel is on the trip". Do not say you will ask them for anything, do not ask them a question back, and do not list what you need from them: this is an introduction, not the start of a form.
- Do not add citations, sources, links, or emoji.
- Use American English spelling.`;
