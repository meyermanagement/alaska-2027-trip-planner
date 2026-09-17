/**
 * The index on the public page: everything Aly looks after, grouped.
 *
 * This is deliberately NOT lib/welcome/alyAbilities.js, and the two must not be
 * merged back together. That file is eight tappable claims on the Meet Aly
 * screen -- each one carries three bullets and a question Aly answers live, so
 * it is bound by what a signed-out stranger can be shown in one screen and by
 * what the model can be told without drifting from it. This file is an index
 * and nothing else: a name per capability, no argument, no prompt.
 *
 * It exists because the landing page above it already argues six scenes at
 * length -- building the trip, before you go, while you are there, when it
 * changes, the money, pro tips -- and a row of chips that repeated those six
 * was a second telling of the page rather than a wider view of the product. So
 * the rule for a line here is: it names something the scenes above do not say,
 * or it names the specific version of something they only gesture at.
 *
 * Why headings at all. Twenty names in one run is a wall; the eye slides off it
 * and takes nothing. Five headings turn the same twenty into something you scan
 * in about a third of the time, because you read five words and then only read
 * the group you came for.
 *
 * Why the headings are verbs. "Bookings and documents" describes a filing
 * cabinet. "What she keeps for you" describes an assistant, which is the thing
 * the page is actually selling, and it is the reason a bucket list and a past
 * review sit together under what she knows rather than in a thin group of their
 * own about memory.
 *
 * Money is "what she does about money" rather than "what she does with your
 * money" on purpose. She never touches it. She says which card, which program,
 * when to buy, and what you are already covered for -- advice about the
 * family's own money, which is allowed, as distinct from finding or holding a
 * price, which is not and must never appear on this list.
 *
 * Every line here has to be something the product does today. In order:
 * inbox ingestion (lib/inbox), document extraction and expiry watching
 * (lib/documents), the document cache in public/sw.js, calendar export
 * (lib/calendar), per-person limits (lib/travelers/limits.js), pets travelling
 * or staying home (lib/pets, lib/tasks/house.js), the traveler profile
 * (lib/travelers/profile.js), shared family access, the bucket list
 * (lib/someday), private reviews (lib/reviews), fare alerts read against a trip
 * (lib/deals, lib/rewards-offers.js), web push for what cannot wait
 * (lib/push/send.js), entry rules (lib/trips/basics.js), booking advice
 * (lib/rewards.js, lib/tasks/when.js), the wallet (lib/rewards-catalog.js),
 * insurance and card coverage (lib/insurance/policy.js), packing and templates
 * (lib/packing), morning-of tasks (lib/tasks), distance from where the phone is
 * (lib/places), and dictation (lib/dictation.js).
 */

export const ALY_INDEX = [
  {
    key: "keeps",
    heading: "What she keeps for you",
    items: [
      "Every booking in one place",
      "Travel documents, read and watched",
      "Tickets that open with no signal",
      "On your own calendar",
    ],
  },
  {
    key: "knows",
    heading: "What she knows about you",
    items: [
      "Allergies, phobias and limits",
      "Pets, with you or left at home",
      "What Aly knows about you",
      "Everyone on the same trip",
      "Your bucket list",
      "Private reviews of where you went",
    ],
  },
  {
    key: "watches",
    heading: "What she watches for you",
    items: [
      "Fare alerts read against your trips",
      "Alerts that cannot wait",
      "Rules of the place",
    ],
  },
  {
    key: "money",
    heading: "What she does about money",
    items: [
      "How and when to book it",
      "Points and rewards",
      "What you are already covered for",
    ],
  },
  {
    key: "hands",
    heading: "What she hands you",
    items: [
      "Packing lists that come back",
      "The morning you leave",
      "Measured from where you are",
      "Ask her out loud",
    ],
  },
];
