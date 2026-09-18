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
 * with three places it checked against a nine-year-old's bedtime and a
 * partner's allergy is what this is. The second asks what there is to know
 * about tomorrow, and comes back with the morning plus the bag for it, offered
 * as a change to Wednesday's day pack rather than as advice to remember.
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
      "Somewhere close — you are back from the road at six and Mia has been in the sun all day. Three that can keep shellfish away from Dani's plate, nearest first.",
    ],
    places: [
      {
        photo: "/landing/place-1.jpg",
        name: "Fish counter by the harbor",
        area: "Kihei · 8 min drive",
        price: "$$",
        rating: "4.6",
        count: "1,204",
        why: "Shellfish is cooked on its own grill at the back, so nothing on Dani's plate has shared a surface with it. Tables outside, no reservation, and Mia eats the tacos.",
        lead: true,
      },
      {
        photo: "/landing/place-2.jpg",
        name: "Plate lunch off the highway",
        area: "Kihei · 6 min drive",
        price: "$",
        rating: "4.4",
        count: "870",
        why: "Closest and quickest. The shrimp goes through the same fryer as everything else, so Dani would be ordering off the grill rather than the fried half of the board.",
      },
      {
        photo: "/landing/place-3.jpg",
        name: "Taco window in town",
        area: "Wailea · 14 min drive",
        price: "$$",
        rating: "4.7",
        count: "2,318",
        why: "The best rated of the three and the furthest. They will make Dani's first, before anything with shellfish is on, if you say so when you order.",
      },
    ],
    tail: "Whichever you pick, pay with the Sapphire: it is 3x on dining, and you have $140 of credit left this year.",
  },
  {
    id: "tomorrow",
    stamp: "Maui · Tuesday, 4:44 pm",
    question: "What do we need to know about tomorrow?",
    answer: [
      "Whale watching out of the harbor at 7:30 am, back a little after ten. It is a 20 minute drive, so you are up at six and out by six forty.",
    ],
    pack: {
      title: "Wednesday's day pack",
      items: [
        "Long sleeves and a fleece each — cold on the water before the sun is up",
        "Dani's motion sickness tablets, 45 minutes before boarding",
        "Mia's hat, and sunscreen on before you leave",
        "Water, and something to eat on the drive",
        "Binoculars from the day bag, and the confirmation on your phone",
      ],
      action: "Add 5 to the day pack",
    },
    tail: "Then nothing until the afternoon, on purpose: the boat is early and Mia will be tired, so I left the middle of the day open rather than booking into it.",
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
        lines.push(item);
      }
    }
    if (turn.tail) {
      lines.push(turn.tail);
    }
  }
  return lines;
}
