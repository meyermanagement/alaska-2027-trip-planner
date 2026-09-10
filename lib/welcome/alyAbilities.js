// What Aly looks after besides the itinerary, as shown on the Meet Aly screen.
//
// The screen used to argue one thing only: that Aly answers the same question
// differently for different families. That argument is still the strongest one
// on the screen, but on its own it leaves a family thinking the app is a
// smarter trip idea generator, and then the wallet, the packing lists, the
// reminders, the budget and the on-trip answers all arrive later as surprises.
// Seven short lines fix that before the first question is ever asked.
//
// Each line names a thing the app actually does today (and budgeting is one of
// them: the trip carries a budget, prices per line, and a running total), in the words a person
// would use for the job rather than the words the codebase uses for the table.
// No line promises a saving, a discount or a deal, because none of that is
// real and the first screen is the worst place to be caught overselling.
export const ALY_ABILITIES = [
  {
    key: "wallet",
    heading: "Points and rewards",
    body: "Your airline, hotel and park programs in one wallet -- numbers, status and point balances -- so what you already have counts when I suggest where to stay.",
  },
  {
    key: "packing",
    heading: "Packing",
    body: "One list per trip, built from who is going and what the weather is doing there, with house lists you keep and reuse instead of rewriting.",
  },
  {
    key: "budget",
    heading: "Budgeting",
    body: "A price on each line of the trip and a running total against what you meant to spend, so a change to the plan shows up as a number the same day.",
  },
  {
    key: "tips",
    heading: "Pro tips",
    body: "Short things worth knowing before you go, dated against your own trip, each one saying where it came from so you can check it.",
  },
  {
    key: "reminders",
    heading: "Reminders",
    body: "A morning email with what is due today, and a nudge about the passport months before the date on it becomes a problem.",
  },
  {
    key: "onTrip",
    heading: "While you are there",
    body: "On the trip I answer from the day you are actually living: what is next, what is near you now, what the weather is doing at seven tonight.",
  },
  {
    key: "place",
    heading: "Rules of the place",
    body: "Passport expiry checked against your travel dates, what an entry rule asks for, and whether a place expects long sleeves or a jacket.",
  },
];
