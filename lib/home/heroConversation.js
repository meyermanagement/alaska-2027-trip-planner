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
 * a person actually asks at the end of a day on a trip, and it shows that the
 * answer is built from where they are, who is with them and what card they
 * hold. The second is the question they ask about tomorrow, and it shows the
 * part no search engine does: the plan for the morning comes back with what to
 * carry, tied to the specific people going and the specific boat.
 *
 * Nothing here may present an invented fact as a real one. No restaurant is
 * named, no boat operator is named, no price is quoted as a live price, and the
 * card labels itself an example under the last line.
 */

export const HERO_HOUSEHOLD = "the Rivera family";

export const HERO_CONVERSATION = [
  {
    id: "dinner",
    stamp: "Maui · Tuesday, 4:40 pm",
    question: "Where should we eat tonight?",
    answer: [
      "Somewhere close — you are back from the road at six and Mia has been in the sun all day.",
      "A fish counter eight minutes from the condo, tables outside, no reservation needed. Mia eats the tacos, and they cook without shellfish in the same pan, which matters for Dani.",
      "Pay with the Sapphire: it is 3x on dining, and you have $140 of credit left this year.",
    ],
  },
  {
    id: "tomorrow",
    stamp: "Maui · Tuesday, 4:44 pm",
    question: "What are we doing tomorrow?",
    answer: [
      "Whale watching out of the harbor at 7:30 am, back a little after ten. It is a 20 minute drive, so you are up at six and out by six forty.",
      "Then nothing until the afternoon, on purpose: the boat is early and Mia will be tired, so I left the middle of the day open rather than booking into it.",
    ],
    checklist: {
      title: "What to bring",
      items: [
        "Long sleeves and a fleece each — it is cold on the water before the sun is up, whatever the forecast says for the beach",
        "Dani's motion sickness tablets, taken 45 minutes before boarding, not at the dock",
        "Mia's hat, and sunscreen on before you leave rather than on deck",
        "Water, and something to eat on the drive — you will be up before the condo makes coffee",
        "Binoculars from the day bag, and the confirmation on your phone",
      ],
    },
    tail: "I have put this on the packing list for Wednesday morning, and it will be in your email tonight.",
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
    if (turn.checklist) {
      lines.push(turn.checklist.title);
      for (const item of turn.checklist.items) {
        lines.push(item);
      }
    }
    if (turn.tail) {
      lines.push(turn.tail);
    }
  }
  return lines;
}
