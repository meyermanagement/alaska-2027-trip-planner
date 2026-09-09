// The two hardcoded families and the two answers Aly gives them, used on
// the Meet Aly screen to show what she does before the real family has
// typed a single field.
//
// The intent of the screen is to prove -- in ninety seconds, without a
// video and without a marketing paragraph -- that Aly gives different
// answers to different families. Reykjavik long weekend was picked because
// it is neither the family's own next trip (which they have not created
// yet) nor a destination anyone in the audience would resent for being
// generic; two adults and a family with a nine-year-old were picked because
// the difference in advice between the two is the exact kind of difference
// the primary is trying to see.
//
// Kept as fixed strings, not model calls, so the first screen the family
// sees paints instantly and never fails. The "Ask her something else" box
// below is where a real live model call happens, on demand and against the
// same two stand-in families.

export const DEMO_QUESTION = "What would you do here for a long weekend?";
export const DEMO_DESTINATION = "Reykjavik, Iceland";

export const DEMO_FAMILIES = [
  {
    key: "adults",
    heading: "Two adults, slow mornings, taste-first",
    facts: [
      "Home is Chicago, six-hour flight",
      "One thing done well over four things rushed",
      "The right restaurant beats the famous museum",
    ],
    answer: {
      opening: "Three nights, one thing a day, dinner as the anchor.",
      lines: [
        "Friday: harbor walk, then dinner at Dill. Book it six weeks out.",
        "Saturday: Golden Circle by car, but only Thingvellir and Gullfoss. Skip Geysir. Dinner at Matur og Drykkur.",
        "Sunday: Sky Lagoon, not the Blue Lagoon -- smaller, quieter, better food.",
      ],
      whyThisWay:
        "No kids and a one-thing pace meant one ticket a day, dinner in every plan, and the local lagoon.",
    },
  },
  {
    key: "family",
    heading: "Two adults and a nine-year-old, packed mornings",
    facts: [
      "Home is Chicago, six-hour flight, and jet lag is real at nine",
      "Packed morning, open afternoon",
      "Cut a stop before you skip a rest",
    ],
    answer: {
      opening:
        "Three nights, morning-heavy, afternoons kept open. She is tired by two.",
      lines: [
        "Friday: harbor walk to the whale statues, early pizza at Flatey, bed by seven to fix the clock.",
        "Saturday: Golden Circle by car, all three stops -- Geysir erupts, and she will care -- back by four. Dinner at Cafe Loki.",
        "Sunday: Whales of Iceland in the morning, Sky Lagoon after. The Blue Lagoon will not take her; this one will.",
      ],
      whyThisWay:
        "A nine-year-old and a rest-before-stops rule meant mornings, an early Friday dinner, Geysir kept, and the lagoon that admits her.",
    },
  },
];

// The system prompt for the "Ask her something else" live demo. Aly is told
// she is on the Meet Aly screen, has no real family yet, and must answer
// each of the two stand-in families in one paragraph and one paragraph
// only. She names the destination when the primary picks one; otherwise
// she leans on the Reykjavik long weekend the fixed answers use.
//
// Three sentences, not four, to match the fixed cards above: those were cut
// down because the screen was doing its arguing in prose, and a live answer
// twice the length of the example beside it would put the wordiness back in
// the one place the family asked for it themselves.
export const DEMO_SYSTEM = `You are Aly, the travel assistant that lives inside a family's household planner.

You are answering on the Meet Aly screen: this is the first thing a family sees before they have typed any of their own information. There is no real family here. You are answering the same question twice, once as if you were talking to a family of two adults who like slow mornings and taste-first days, and once as if you were talking to a family of two adults and a nine-year-old who like packed mornings and rest-cut-over-stop-cut days. Both families live in Chicago.

Rules:
- Answer each family in one short paragraph. Three sentences at most. Say the thing and stop; do not restate the question or explain your reasoning at length. No bullet lists, no numbered lists, no headings.
- The point of showing both answers is that they differ meaningfully. Name at least one concrete thing that changes because of the family's shape (a place, a time, a rule) in each answer.
- Do not preface. Do not say "for the adults" or "for the family" -- the screen labels each answer. Just answer.
- Do not add citations, sources, links, or emoji.
- Use American English spelling.`;
