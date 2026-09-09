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
    subheading: "Anna and Ben. No kids. Dinner is the point of the day.",
    facts: [
      "Home is Chicago, six-hour flight",
      "Prefer one thing done well over four things rushed",
      "Would rather stand in line for the right restaurant than the famous museum",
    ],
    answer: {
      opening:
        "Three nights, one thing a day, dinner as the anchor. The point of Reykjavik on a long weekend is the light, the water, and the food -- not the checklist.",
      lines: [
        "Friday: land, walk the harbor, dinner at Dill (book six weeks out). The tasting menu is what you flew for.",
        "Saturday: drive the Golden Circle in a rental, but stop at only two of the three -- Thingvellir and Gullfoss. Skip Geysir; it is a parking lot with a puddle. Dinner at Matur og Drykkur.",
        "Sunday: Sky Lagoon in the afternoon, not the Blue Lagoon. Smaller, quieter, better food. Fly out Monday morning.",
      ],
      whyThisWay:
        "Two adults, no kids, one-thing-done-well pace: that meant one paid ticket a day, dinner in every plan, and the Blue Lagoon cut for the local one.",
    },
  },
  {
    key: "family",
    heading: "Two adults and a nine-year-old, packed mornings",
    subheading: "Same trip, same weekend -- different family entirely.",
    facts: [
      "Home is Chicago, six-hour flight, jet lag is real for a nine-year-old",
      "Prefer a packed morning and an open afternoon",
      "Would rather cut a stop than skip a rest",
    ],
    answer: {
      opening:
        "Three nights, morning-heavy days with afternoons kept open. A nine-year-old on Iceland time gets tired by two; every plan below ends before the meltdown does.",
      lines: [
        "Friday: land, harbor walk to the whale statues, early pizza at Flatey. Bed by seven local time to get the clock right.",
        "Saturday: Golden Circle by car, all three stops (Geysir does erupt, and a nine-year-old will care), back in town by four. Family-friendly dinner at Cafe Loki.",
        "Sunday: Whales of Iceland museum in the morning (real-size models -- a nine-year-old's kind of museum), Sky Lagoon in the afternoon (kids nine and up allowed, unlike the Blue Lagoon). Fly Monday.",
      ],
      whyThisWay:
        "A nine-year-old, a packed-morning pace, and a rest-cut-over-stop-cut rule: that meant morning activities, an early dinner Friday, Geysir kept in for the kid, and the Blue Lagoon cut for the one that lets nine-year-olds in.",
    },
  },
];

// The system prompt for the "Ask her something else" live demo. Aly is told
// she is on the Meet Aly screen, has no real family yet, and must answer
// each of the two stand-in families in one paragraph and one paragraph
// only. She names the destination when the primary picks one; otherwise
// she leans on the Reykjavik long weekend the fixed answers use.
export const DEMO_SYSTEM = `You are Aly, the travel assistant that lives inside a family's household planner.

You are answering on the Meet Aly screen: this is the first thing a family sees before they have typed any of their own information. There is no real family here. You are answering the same question twice, once as if you were talking to a family of two adults who like slow mornings and taste-first days, and once as if you were talking to a family of two adults and a nine-year-old who like packed mornings and rest-cut-over-stop-cut days. Both families live in Chicago.

Rules:
- Answer each family in one short paragraph. Four sentences at most. No bullet lists, no numbered lists, no headings.
- The point of showing both answers is that they differ meaningfully. Name at least one concrete thing that changes because of the family's shape (a place, a time, a rule) in each answer.
- Do not preface. Do not say "for the adults" or "for the family" -- the screen labels each answer. Just answer.
- Do not add citations, sources, links, or emoji.
- Use American English spelling.`;
