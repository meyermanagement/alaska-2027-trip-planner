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
// Each question has an authored answer beside it. These are introductions to
// the product, not personalized requests: they need no model or network call.
// Keep the answers grounded in the same capabilities as the bullets.
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
    heading: "Planning your trip",
    points: [
      "Turn an idea into a day-by-day draft you can change",
      "Plan around your pace, interests, and who is going",
      "Keep it as a draft until you are ready; I do not book it",
    ],
    // Two sentences rather than a dash: the double hyphen is how this file writes
    // an aside in a comment, and it was rendering as two hyphens on the chip.
    ask: "Can you help if I only have a trip idea?",
    answer:
      "Yes. Even an idea like a long weekend by the water gives us a place to start. I can turn it into a day-by-day draft around your pace, interests, and whoever is going, then help you adjust it. It stays a draft until you are ready, and I do not book anything.",
  },
  {
    key: "budget",
    heading: "Your budget",
    // Three claims, in the order they matter to somebody who has not spent the
    // money yet. Planning to the number comes first: a budget that only reports
    // is a receipt, and the useful version is the one that shapes the draft
    // before anything is booked. Then the running total, which is the mechanical
    // part. Then where to cut, which is the question a family asks out loud, and
    // it is worded as advice about their own trip rather than as a saving, a deal
    // or a fare, because advice is the part that is real.
    points: [
      "Use your spending target to guide the plan",
      "Track costs and estimates against that target",
      "Suggest where to cut back while keeping what matters to you",
    ],
    ask: "How do you help me stay within my budget?",
    answer:
      "I use your spending target to guide the plan and keep costs and estimates visible against it. If a draft is running high, I can suggest trade-offs, like keeping the outing you care about and choosing a simpler dinner that day. You decide what is worth keeping.",
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
      "Keep your loyalty programs and card benefits together",
      "Help compare using points with paying cash",
      "Suggest which of your cards and benefits may fit a purchase",
    ],
    ask: "How do my points and card benefits affect your advice?",
    answer:
      "Once your programs and cards are in your wallet, I can consider them alongside the trip you are planning. For a hotel stay, for example, I can help compare points with cash or suggest which of your cards may fit the purchase. Availability and benefit terms still need checking before you book.",
  },
  {
    key: "onTrip",
    heading: "While you are there",
    points: [
      "See today's plans and ask about what is nearby",
      "Get suggestions that fit your day and the weather",
    ],
    ask: "How can you help while I am on a trip?",
    answer:
      "I can help with the day you are actually having, using your plans, preferences, and the weather. If rain interrupts an afternoon outdoors, I can suggest an indoor stop near your next activity rather than sending you across town. You choose whether to change the plan.",
  },
  {
    key: "packing",
    heading: "Packing",
    points: [
      "Build a list for the travelers, activities, and weather",
      "Separate each person's items from things you share",
      "Reuse your usual lists instead of starting over",
    ],
    ask: "What goes into my packing list?",
    answer:
      "I build the list around who is going, what you will be doing, and the expected weather. A boat day might call for a light layer and motion-sickness supplies, while shared sunscreen belongs on the shared list. Your usual lists give us a starting point, so you do not have to remember everything again.",
  },
  {
    key: "place",
    heading: "Before you go",
    points: [
      "Check passport validity against your travel dates",
      "Flag entry requirements that may apply to your travelers",
      "Explain local customs and dress expectations",
    ],
    ask: "What should I check before traveling abroad?",
    answer:
      "I help you check passport validity, entry requirements, and local customs against your travelers and travel dates. For example, a passport that expires after you get home may still fall short of a destination's validity rules. I can flag that for you, but confirm current requirements with the destination's official guidance before you travel.",
  },
  {
    key: "reminders",
    heading: "Reminders",
    points: [
      "Keep trip tasks and due dates in one place",
      "Time preparation tasks around your departure",
      "See what is coming up and check off what is done",
    ],
    ask: "How do reminders help me get ready?",
    answer:
      "I keep preparation tasks and due dates together so you can see what needs attention before departure. Renewing a document belongs well ahead of the trip; charging your devices belongs near the end. You can check off each task as it is done instead of carrying the whole list in your head.",
  },
  {
    key: "tips",
    heading: "Pro tips",
    points: [
      "Get practical advice for your destination and plans",
      "See why a tip matters and when to act on it",
      "Follow its source when you want to check the details",
    ],
    ask: "Where do your tips come from?",
    answer:
      "I use your destination and plans to suggest practical advice, with sources you can open to check the details. For a timed-entry attraction, for example, a tip can explain why reserving ahead matters and when to act. You can follow the source to confirm the current rules rather than relying on a general suggestion.",
  },
];
