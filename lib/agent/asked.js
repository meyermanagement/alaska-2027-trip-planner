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

// Words that mean somebody wanted to be told something. Deliberately generous:
// being wrong here costs one extra model call, while missing it costs the whole
// question.
const ASKING =
  /\b(what|what's|whats|where|where's|which|who|when|how|why|recommend|recommendations|recommendation|suggest|suggestions|ideas|options|opinion|thoughts|worth|advice|better|best|instead|too much|too far|too long|feasible|doable|realistic|should we|can we|could we|do we|is it|are we|any good)\b/i;

// Asking to be advised, rather than merely asking something. "What do you
// recommend?" is the whole message: there is no instruction in it, nothing named
// to change, nothing to look up -- the entire request is for an opinion and the
// thinking behind it. Answering that one with a card and no words is the worst
// version of the wordless proposal, because the words were the only thing asked
// for.
const ADVICE =
  /\b(recommend|recommends|recommended|recommendation|recommendations|suggest|suggestion|suggestions|advice|advise|opinion|thoughts|which would you|what would you|what should we|what do you think|worth it|better)\b/i;

/** Was the whole point of that message to be told what you would do? */
export function asksAdvice(said) {
  return ADVICE.test(String(said == null ? "" : said));
}

// Long enough to have a reason in it. A proposal answered with "Updated." or
// "Sure -- here you go." is a caption on a card rather than an answer, and the
// question that earned the card is still sitting there.
const ENOUGH = 60;

/**
 * Did she come back with a change and nothing worth reading above it?
 *
 * Both the silent version and the thin version. The thin one matters more than
 * it looks: a model that has proposed something reliably writes a handful of
 * words restating it, which passes any test for "did she say anything" while
 * telling the family nothing about why.
 */
export function needsReasons(text, calls) {
  if (!(Array.isArray(calls) ? calls.length : 0)) return false;
  return String(text == null ? "" : text).trim().length < ENOUGH;
}

// What she proposed, in enough words for her to write about it on the next turn.
// The summaries the confirmation cards use are built further downstream, so this
// reads the raw calls: the tool's name with its underscores taken out, and the
// arguments short enough to be a value rather than a paragraph.
const SKIP = new Set(["id", "trip_id", "item_id", "template_id", "person_id"]);

export function gistOf(calls) {
  return (Array.isArray(calls) ? calls : []).slice(0, 6).map((call) => {
    const name = String(call?.name || "change").replace(/_/g, " ");
    const args = call?.args && typeof call.args === "object" ? call.args : {};
    const parts = [];
    for (const [key, value] of Object.entries(args)) {
      if (SKIP.has(key)) continue;
      if (value == null || typeof value === "object") continue;
      const said = String(value).trim();
      if (!said || said.length > 120) continue;
      parts.push(`${key.replace(/_/g, " ")}: ${said}`);
      if (parts.length === 4) break;
    }
    return parts.length ? `${name} (${parts.join(", ")})` : name;
  });
}

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
export function answerAsWell(said, summaries = [], opts = {}) {
  const listed = (Array.isArray(summaries) ? summaries : [])
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const what = listed.length ? `: ${listed.join("; ")}` : "";
  const question = `The question was: ${String(said || "").slice(0, 600)}`;
  // Asked for a recommendation and answered with a card. The change is not the
  // wrong thing to have proposed -- it is usually exactly right -- but it was
  // offered as though the family had already decided, when what they asked for
  // was the deciding itself.
  if (opts.advice) {
    return [
      "YOU HAVE NOT ANSWERED THEM YET:",
      `They asked you what you would do, and you answered with a change to approve${what} and not one word about it. A card is not a recommendation. It shows them the what and hides every part they actually asked for.`,
      "The change is already in front of them, so do not propose it again and do not spend the answer narrating what it does. Write the recommendation now: what you would do and the reason it is the right call for this family and this trip, the alternative you weighed and why it lost, and the one thing that would change your mind. Lean on what you know about them — the saved preferences, their own reviews, who is on this trip, what is already planned around it — and name it when it drives the choice. Be plain about anything you are unsure of.",
      // No instruction to call offer_followups any more, and this is the half of
      // that fix that matters: the tool is no longer offered on this turn, and a
      // model told to end by calling a tool it has not been given will either
      // fail or, worse, do the tool part first and never get to the words. That
      // is the sentence that produced "That is what I would do -- it is on the
      // card above. I did not manage to write out why this time."
      "Two short paragraphs is usually right, headers only if it genuinely has parts to it.",
      question,
    ].join("\n\n");
  }
  return [
    "YOU HAVE NOT ANSWERED THEM YET:",
    `That message asked you something as well as telling you to change something. The change is already proposed and sitting in front of them, waiting to be approved${what}.`,
    "So do not propose it again, and do not spend the answer describing it. Answer the question itself now, in words, exactly as you would have if they had asked it on its own — headers when it has parts to it, and a shortlist of real places as cards when they asked where to go, eat or stay.",
    question,
  ].join("\n\n");
}

/**
 * The line printed above a card when the words never arrived.
 *
 * A last resort, reached only when the retry above also came back empty. It says
 * the reasoning is missing rather than pretending the card was the answer,
 * because a family who cannot tell the difference between "she thought about it
 * and this is her call" and "something broke" learns to distrust both.
 */
export function wordlessLine() {
  return "That is what I would do — it is on the card above. I did not manage to write out why this time, though. Ask me and I will.";
}
