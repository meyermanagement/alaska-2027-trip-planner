/**
 * The scripted conversation the front door plays.
 *
 * This is copy, not a transcript, and it is kept out of the component for two
 * reasons. It is read by a server component so a crawler and a reader with no
 * JavaScript are handed the whole exchange as plain text, and it is the single
 * place a person editing the words has to look -- the player below it holds
 * only timing.
 *
 * The family is invented, and it is the one the rest of the page uses: Dani,
 * Sam, Nana and Mia, in a condo in Kīhei. The conversation happens on Monday
 * evening so that "tomorrow" is the Tuesday the While you are there card
 * draws -- the Mākena snorkel, lunch back at the condo, the same day pack --
 * and the Tuesday the rain nudge interrupts. Putting a real traveler's dietary
 * restriction on a public page is not an option, so the allergy is invented
 * too.
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
 * morning plus the bag for it, offered as a change to Tuesday's day pack
 * rather than as advice to remember.
 *
 * Nothing here may present an invented fact as a real one. No business is
 * named -- the places are described by what they are, because a made-up
 * restaurant name on a public page is a made-up restaurant somebody will look
 * for. The photographs carry no signage. The card labels itself an example
 * above the first line.
 */

export const HERO_CONVERSATION = [
  {
    id: "dinner",
    stamp: "Kīhei · Monday, 4:40 pm",
    question: "Where should we eat tonight?",
    answer: [
      "Somewhere close — you are back from the road at six and Mia has been in the sun all day. Three inside a fifteen minute drive that will seat you without a booking, all of them able to keep shellfish off Dani's plate. My pick first.",
    ],
    places: [
      {
        photo: "/landing/place-1.jpg",
        name: "Fish counter by the harbor",
        area: "Kīhei · 8 min drive",
        price: "$$",
        rating: "4.6",
        count: "1,204",
        why: "Tables outside by the water and no reservation, so you can be eating by 6:30 and Mia is in bed on time. She eats the tacos, and shellfish is cooked on its own grill at the back, away from Dani's plate.",
        lead: true,
      },
      {
        photo: "/landing/place-2.jpg",
        name: "Plate lunch off the highway",
        area: "Kīhei · 6 min drive",
        price: "$",
        rating: "4.4",
        count: "870",
        why: "Closest, quickest and the cheapest of the three — around $60 for the four of you, which keeps this week inside the food budget you set. Counter service, so nobody waits for a table.",
      },
      {
        photo: "/landing/place-3.jpg",
        name: "Taco window in town",
        area: "Wailea · 14 min drive",
        price: "$$",
        rating: "4.7",
        count: "2,318",
        why: "The best rated of the three, and the one closest to what you said you like — a small kitchen doing one thing well. It is the furthest, and you are on the snorkel boat first thing tomorrow, so it may be one to keep for later in the week.",
      },
    ],
    tail: "Whichever you pick, pay with the Sapphire: it is 3x on dining, and you have $140 of credit left this year.",
  },
  {
    id: "tomorrow",
    stamp: "Kīhei · Monday, 4:44 pm",
    question: "What do we need to know about tomorrow?",
    answer: [
      "Snorkeling at Mākena on the 8:20 boat, with check-in at 7:50. It is a 12 minute drive, so be out the door by 7:35. The confirmation is saved to your itinerary, and it asks for photo ID and cash for the balance.",
    ],
    pack: {
      title: "Tuesday's day pack",
      items: [
        { item: "Sunscreen", reason: "Put it on before you leave and bring it to reapply on the boat." },
        { item: "Mia's light jacket", reason: "For the ride back, wet and in the wind." },
        { item: "Photo ID", reason: "The confirmation asks for it at check-in." },
        { item: "Cash for the balance", reason: "The confirmation says it is paid on the day." },
        { item: "Dani's motion sickness tablets", reason: "Have them handy before boarding; follow the label's timing." },
        { item: "Water", reason: "For the drive and the boat ride." },
        { item: "Snacks", reason: "Something to eat before an early boat." },
      ],
    },
    tail: "Lunch is back at the condo at one, and nothing after it on purpose: the boat is early, Mia will be tired, and rain is possible in the afternoon.",
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
