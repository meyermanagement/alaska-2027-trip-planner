/**
 * The scripted conversation the front door plays.
 *
 * This is copy, not a transcript, and it is kept out of the component for two
 * reasons. It is read by a server component so a crawler and a reader with no
 * JavaScript are handed the whole exchange as plain text, and it is the single
 * place a person editing the words has to look -- the player below it holds
 * only timing.
 *
 * The family is invented. The app already uses Alex Rivera as the name it
 * shows a person filling in the welcome form, so the demonstration borrows the
 * same household rather than inventing a second fiction or, worse, putting a
 * real traveler's dietary restriction on a public page. Dani is the partner,
 * Mia is nine.
 *
 * Two exchanges, in this order and for this reason. The first is the question
 * a person actually asks at the end of a day on a trip, and it comes back the
 * way the product comes back: not a paragraph naming somewhere, but a
 * shortlist of places with photographs, distances, ratings, a reason each, and
 * the buttons that put one on the itinerary. That is the whole argument. An
 * assistant that answers in prose is a chat window; an assistant that answers
 * with three places it checked against how long the drive is, what the family
 * said they would spend, a nine-year-old who has been in the sun all day and a
 * partner's allergy is what this is.
 *
 * Each of the three carries a different reason, deliberately. One reason
 * repeated three times reads as the only thing Aly knows how to weigh, and the
 * point of the shortlist is that it was sorted on everything the family has
 * told the app: distance and the hour they got back, what dinner costs against
 * the budget, whether a child will eat there and be in bed on time, how well
 * rated it is, whether they can walk in without a booking, and the one dietary
 * restriction that rules some kitchens out. The allergy is said once in the
 * opening line and once on the place it actually decides.
 *
 * The second asks what there is to know about tomorrow, and comes back with the
 * morning plus the bag for it, offered as a change to Wednesday's day pack
 * rather than as advice to remember.
 *
 * Nothing here may present an invented fact as a real one. No business is
 * named -- the places are described by what they are, because a made-up
 * restaurant name on a public page is a made-up restaurant somebody will look
 * for. The photographs carry no signage. The card labels itself an example
 * above the first line.
 */

export const HERO_HOUSEHOLD = "the Rivera family";

export const HERO_CONVERSATION = [
  {
    id: "dinner",
    stamp: "Maui · Tuesday, 4:40 pm",
    question: "Where should we eat tonight?",
    answer: [
      "Somewhere close — you are back from the road at six and Mia has been in the sun all day. Three inside a fifteen minute drive that will seat you without a booking, all of them able to keep shellfish off Dani's plate. Nearest first.",
    ],
    places: [
      {
        photo: "/landing/place-1.jpg",
        name: "Fish counter by the harbor",
        area: "Kihei · 8 min drive",
        price: "$$",
        rating: "4.6",
        count: "1,204",
        why: "Tables outside by the water and no reservation, so you can be eating by 6:30 and Mia is in bed on time. She eats the tacos, and shellfish is cooked on its own grill at the back, away from Dani's plate.",
        lead: true,
      },
      {
        photo: "/landing/place-2.jpg",
        name: "Plate lunch off the highway",
        area: "Kihei · 6 min drive",
        price: "$",
        rating: "4.4",
        count: "870",
        why: "Closest, quickest and the cheapest of the three — around $45 for the three of you, which keeps this week inside the food budget you set. Counter service, so nobody waits for a table.",
      },
      {
        photo: "/landing/place-3.jpg",
        name: "Taco window in town",
        area: "Wailea · 14 min drive",
        price: "$$",
        rating: "4.7",
        count: "2,318",
        why: "The best rated of the three, and the one closest to what you said you like — a small kitchen doing one thing well. It is the furthest, and you are up at six for the boat, so it may be one to keep for later in the week.",
      },
    ],
    tail: "Whichever you pick, pay with the Sapphire: it is 3x on dining, and you have $140 of credit left this year.",
  },
  {
    id: "tomorrow",
    stamp: "Maui · Tuesday, 4:44 pm",
    question: "What do we need to know about tomorrow?",
    answer: [
      "Whale watching out of the harbor at 7:30 am, back a little after ten. It is a 20 minute drive, so you are up at six and out by six forty. The booking confirmation is already saved to your itinerary.",
    ],
    pack: {
      title: "Wednesday's day pack",
      items: [
        { item: "Fleeces", reason: "One each for the cold early morning on the water." },
        { item: "Dani's motion sickness tablets", reason: "Have them handy before boarding; follow the label's timing." },
        { item: "Mia's hat", reason: "For shade out on the boat." },
        { item: "Sunscreen", reason: "Apply before leaving and bring it for reapplying." },
        { item: "Water", reason: "For the drive and the boat ride." },
        { item: "Snacks", reason: "Something to eat on the early drive." },
        { item: "Binoculars", reason: "Put them in the day bag for spotting whales." },
      ],
    },
    tail: "Then nothing until the afternoon, on purpose: the boat is early and Mia will be tired, so I left the middle of the day open instead of filling it.",
  },
];

/** Plain text of the whole exchange, for the version a crawler is handed. */
export function heroConversationLines() {
  const lines = [];
  for (const turn of HERO_CONVERSATION) {
    lines.push(turn.question);
    for (const paragraph of turn.answer) {
      lines.push(paragraph);
    }
    for (const place of turn.places || []) {
      lines.push(`${place.name} — ${place.area}. ${place.why}`);
    }
    if (turn.pack) {
      lines.push(turn.pack.title);
      for (const item of turn.pack.items) {
        lines.push(`${item.item}: ${item.reason}`);
      }
    }
    if (turn.tail) {
      lines.push(turn.tail);
    }
  }
  return lines;
}
