// The stand-in families on the Meet Aly screen, and the answer Aly gives
// each of them about the same weekend in Paris.
//
// The screen has ninety seconds to prove -- without a video and without a
// marketing paragraph -- that Aly gives different answers to different
// families. Four stand-ins do that better than two: two columns can be
// read as one obvious split (kids or no kids), while four make the point
// that the shape of a family is not a single dial. The teenagers get sent
// off on their own, the grandparents get the gallery with the benches, and
// the reader finds the row that is closest to their own house.
//
// Two rules about what these answers say.
//
// Paris, not Reykjavik. The argument only lands if the example is a trip
// the reader has thought about, and an Iceland long weekend reads as a
// sample of somebody else's life.
//
// Short. One paragraph each, two sentences, with the reason folded into
// the advice rather than carried in a separate line underneath. Four cards
// only stay scannable if each one can be read in a breath; the moment a
// card needs a second paragraph, the reader stops comparing and starts
// skimming, and comparing is the entire point of the screen.
//
// Kept as fixed strings, not live calls, so the first screen the family
// sees paints instantly and never fails. The "Ask something of your own"
// box below is where a real live call happens, on demand, against these
// same four families.

export const DEMO_QUESTION = "What would you do here for a long weekend?";
export const DEMO_DESTINATION = "Paris, France";

export const DEMO_FAMILIES = [
  {
    key: "adults",
    heading: "Two adults, slow mornings",
    // The one-line version of this family for the live prompt below.
    brief:
      "two adults who like slow mornings, one anchor thing a day, and dinner as the point of the day",
    facts: ["One thing a day, done well", "Dinner is the point"],
    answer:
      "Nothing before eleven, two hours in the Orsay, then a table in the 11th booked weeks ago. One anchor a day, because you would rather do one thing properly than four in a rush.",
  },
  {
    key: "kid",
    heading: "Two adults and a nine-year-old",
    brief:
      "two adults and a nine-year-old who pack the mornings, keep the afternoons open, and cut a stop before they skip a rest",
    facts: ["Packed mornings, open afternoons", "She is tired by two"],
    answer:
      "The tower at opening while the line is still short, then back to the apartment after lunch. Dinner at six near where you sleep, and the Luxembourg playground until the gates close.",
  },
  {
    key: "teens",
    heading: "Two adults and two teenagers",
    brief:
      "two adults and two teenagers who sleep late, want some independence, and hate being marched around",
    facts: ["Nobody is up before ten", "They want a few hours alone"],
    answer:
      "The catacombs and the Saint-Ouen flea market, which are the two they will actually talk about afterwards. Hand them a metro pass for the afternoon and meet at a creperie in Montmartre.",
  },
  {
    key: "grandparents",
    heading: "Grandparents, watching the stairs",
    brief:
      "grandparents in their seventies for whom a mile of walking is plenty and stairs are the thing that ends a day",
    facts: ["A mile of walking is plenty", "A lift, or it does not happen"],
    answer:
      "The Orangerie instead of the Louvre: one floor, a room of Monet, and benches to sit on. Lunch in the Tuileries next door, then a river cruise for the sightseeing that would otherwise be walking.",
  },
];

// The system prompt for the "Ask her something else" live demo. Aly is told
// she is on the Meet Aly screen, has no real family yet, and must answer
// every stand-in once, briefly. The families are listed from the same array
// the cards above are built from, so the live answers and the examples can
// never drift apart.
//
// Two sentences, not four, to match the fixed cards: a live answer twice the
// length of the example beside it would put the wordiness straight back into
// the one screen that was cut down on purpose.
export const DEMO_SYSTEM = `You are Aly, the travel assistant that lives inside a family's household planner.

You are answering on the Meet Aly screen: this is the first thing a family sees, before they have typed any of their own information. There is no real family here. You answer the same question once for each of these stand-in families, all of whom live in Chicago:

${DEMO_FAMILIES.map((f) => `[${f.key}] ${f.brief}`).join("\n")}

Rules:
- Answer each family in one short paragraph of at most two sentences. Say the thing and stop. No bullet lists, no numbered lists, no headings.
- Begin each paragraph with that family's tag in square brackets, exactly as written above, and answer them in the same order.
- The point of showing the answers together is that they differ. Name at least one concrete thing in each answer that changed because of that family's shape -- a place, an hour, or something skipped.
- Do not describe the family back to them and do not explain your reasoning at length; fold the reason into the advice.
- If the question does not name a destination, answer about a long weekend in Paris.
- Do not add citations, sources, links, or emoji.
- Use American English spelling.`;
