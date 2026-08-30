/**
 * A message is often two things at once.
 *
 * "Well, actually it's not fall, it's spring -- and I want recommendations of
 * where we can physically go if we fly to Lisbon and want to go to the beach; is
 * Morocco too much?" is a correction and a question in one breath. Aly answered
 * the correction with a proposal card and said nothing at all, so what came back
 * was a rename to approve and no sign the question had ever been asked.
 *
 * The app cannot invent the missing answer, but it can notice that it is missing.
 * When a message had a question in it and she came back wordless, she is asked
 * once more for the words alone, with every change tool taken away so the change
 * she already proposed cannot be proposed twice.
 */

// What only an answer can serve. A second turn may show a shortlist and offer
// the next question, because those are things she says rather than things she
// saves -- everything else is withheld, so this can never become a second bite
// at changing the trip.
export const ANSWERING_TOOLS = new Set(["show_places", "offer_followups"]);

// Words that mean somebody wanted to be told something. Deliberately generous:
// being wrong here costs one extra model call, while missing it costs the whole
// question.
const ASKING =
  /\b(what|what's|whats|where|where's|which|who|when|how|why|recommend|recommendations|recommendation|suggest|suggestions|ideas|options|opinion|thoughts|worth|advice|better|best|instead|too much|too far|too long|feasible|doable|realistic|should we|can we|could we|do we|is it|are we|any good)\b/i;

/**
 * Did that message ask for something to be said back?
 *
 * A question mark is the obvious tell. Dictated messages often have none at all,
 * which is exactly how the Lisbon question was lost, so the asking words count
 * too.
 */
export function asksSomething(said) {
  const text = String(said == null ? "" : said);
  if (!text.trim()) return false;
  if (text.includes("?")) return true;
  return ASKING.test(text);
}

/**
 * What she is told on the second turn.
 *
 * Kept short and specific. It names the change as already handled so she does
 * not spend the answer narrating it, and it says the question is the whole job.
 */
export function answerAsWell(said, summaries = []) {
  const listed = (Array.isArray(summaries) ? summaries : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  return [
    "YOU HAVE NOT ANSWERED THEM YET:",
    "That message asked you something as well as telling you to change something. The change is already proposed and sitting in front of them, waiting to be approved" +
      (listed.length ? `: ${listed.join("; ")}` : "") +
      ".",
    "So do not propose it again, and do not spend the answer describing it. Answer the question itself now, in words, exactly as you would have if they had asked it on its own — headers when it has parts to it, a shortlist of real places as cards when they asked where to go, eat or stay, and the questions worth asking next at the end.",
    `The question was: ${String(said || "").slice(0, 600)}`,
  ].join("\n\n");
}
