// Being asked for ideas is not being asked to change anything.
//
// Ask Aly for a dinner recommendation and, until now, she proposed a booking:
// three confirmation cards and no reason to press any of them. The family did not
// want the itinerary changed, they wanted to know what is good — the name of the
// place, what it is, roughly where it is, and why it would suit them.
//
// So a request for ideas is treated as a different kind of request. It is allowed
// to look things up on the web, because a travel assistant that cannot name a
// restaurant is not much use, and the changes it proposes are held back until
// somebody actually picks one.
//
// Deliberately narrow. "Add dinner at Orso on Thursday" is an instruction and
// must still go straight through to a card, and so must "suggest some packing
// items" — holding those back would make Aly worse, not better.

// What the question is about. Only the three things the family asks for by name:
// somewhere to eat, somewhere to sleep, something to do.
// An open question about the day itself: "what should we do in Willemstad on the
// Tuesday". No noun to catch, so the shape has to be caught instead. The
// lookahead keeps "what should we do about the passports" out of it, which is a
// question about admin and not about the trip.
const OPEN =
  /\b(?:what|where)\s+(?:should|shall|can|could|would|do)\s+(?:we|i|the family|everyone)\b[^.?!]{0,60}\b(?:do|go|eat|stay|visit|see|explore)\b(?!\s+about)/i;

const SUBJECTS =
  /\b(dinner|lunch|breakfast|brunch|supper|dine|dining|eat|eating|restaurants?|food|meals?|cuisine|bars?|cafes?|coffee|hotels?|resorts?|lodges?|inns?|stay|staying|lodging|accommodations?|airbnb|activit(?:y|ies)|things? to do|excursions?|tours?|attractions?|museums?|hikes?|hiking|sights?|sightseeing|shows?|day trips?|worth doing|worth seeing|to do|to see|to eat|to visit|to explore)\b/i;

// The shape of asking rather than telling.
const ASKS =
  /\b(recommend|recommends|recommended|recommendations?|suggest|suggests|suggestions?|ideas?|options?|shortlist|choices|what should|where should|which should|what would|where would|what can|where can|what do you|where do you|any good|anywhere good|somewhere good|anything good|best|top|favou?rites?|worth|what is there|what's there|whats there|what else|advice|thoughts on|opinions? on|help us (?:find|pick|choose))\b/i;

// The words that make it an instruction. Anything here and the proposal stands:
// the user has already decided, and holding their change back would be rude.
const SAVES =
  /\b(add|adds|added|adding|put|puts|putting|schedule|scheduled|book|booked|booking|reserve|reserved|pencil|save|saved|create|created|log|logged|slot|pop|stick|go ahead|do it|make it so|set (?:it |them )?up|sign us up)\b/i;

/**
 * Is this a question about where to eat, stay or go, rather than an instruction?
 *
 * Both halves are required. "Recommend some packing items" has the asking shape
 * but not the subject, and "add dinner at Orso" has the subject but is plainly an
 * instruction.
 */
export function wantsIdeas(message = "") {
  const said = typeof message === "string" ? message : "";
  if (!said.trim()) return false;
  if (OPEN.test(said)) return true;
  return ASKS.test(said) && SUBJECTS.test(said);
}

/** Has the user asked, in the same breath, for it to go on the plan? */
export function asksToSave(message = "") {
  const said = typeof message === "string" ? message : "";
  return said.trim() ? SAVES.test(said) : false;
}

/** Whether this request should be allowed to look things up on the web. */
export function shouldLookUp(message = "", history = []) {
  if (wantsIdeas(message)) return true;
  return isFollowUp(message) && recentlyAskedForIdeas(history);
}

// A conversation, not a series of unrelated questions. "More for this trip",
// "any others", "somewhere cheaper", "what about lunch instead" all carry their
// subject over from the question before them, and the family should not have to
// repeat the word restaurant to get an answer that has been looked up.
const FOLLOW_UP =
  /^(?:and\s+|ok(?:ay)?,?\s+|so\s+)?(?:more|any\s*more|some\s*more|more\s+(?:options|ideas|choices|for)|others?|any\s+others?|what\s+else|anything\s+else|else|another|a\s+few\s+more|keep\s+going|go\s+on|what\s+about|how\s+about|somewhere|something)\b/i;

// Comparatives that only mean anything against a list that already exists.
const REFINES =
  /^(?:any(?:thing|where)?\s+)?(?:cheaper|closer|nicer|quieter|fancier|posher|nearer|less\s+\w+|more\s+\w+)\b/i;

/** Does this message lean on the question before it rather than stand alone? */
export function isFollowUp(message = "") {
  const said = String(message || "").trim();
  // Long enough to stand on its own two feet, so judge it on its own words.
  if (!said || said.length > 80) return false;
  if (asksToSave(said)) return false;
  return FOLLOW_UP.test(said) || REFINES.test(said);
}

// How far back to look. Far enough to survive a clarifying question and its
// answer, not so far that yesterday's restaurant question makes today's packing
// question go searching.
const LOOK_BACK = 4;

/** Was one of the last few things this person asked a question about ideas? */
export function recentlyAskedForIdeas(history = []) {
  const said = (Array.isArray(history) ? history : [])
    .filter((m) => m && m.role === "user" && typeof m.text === "string")
    .slice(-LOOK_BACK);
  return said.some((m) => wantsIdeas(m.text));
}

// Only the two that write a plan the family has not agreed to. A preference
// learned along the way ("Veda will not eat seafood") is worth keeping whatever
// else the message was, and an update or a deletion is never something Aly
// invents in answer to "where should we eat".
const HELD = new Set(["add_itinerary_item", "add_task"]);

/**
 * Split proposed changes into the ones to show and the ones to hold back.
 *
 * Holding one back is not the same as ignoring it: the caller says in words that
 * nothing was saved and that picking one is all it takes.
 */
export function holdBackChanges(actions = [], { message = "" } = {}) {
  const list = Array.isArray(actions) ? actions : [];
  if (!wantsIdeas(message) || asksToSave(message)) {
    return { kept: list, held: [] };
  }
  const kept = [];
  const held = [];
  for (const action of list) {
    (HELD.has(action?.tool) ? held : kept).push(action);
  }
  return { kept, held };
}

/** The line that replaces the cards that were held back. */
export function heldBackNote(held = []) {
  if (!held.length) return "";
  return "Nothing is on the itinerary yet — tell me which one you want and I will add it.";
}

/**
 * Said when the question was one Aly should have looked up and she could not.
 * Better than silence: the family should know an opening time came out of the
 * model's memory rather than off the restaurant's own page this evening.
 */
export function noSearchNote() {
  return "I could not check the web just now, so this is from what I already know \u2014 worth confirming hours and prices before you count on them.";
}

/**
 * Is the reply a question back rather than an answer? "Which trip did you mean?"
 * needs no web page behind it, so it should not carry a note apologizing for not
 * having read one.
 */
export function isClarifying(reply = "") {
  const said = String(reply || "").trim();
  if (!said || said.length > 200) return false;
  return said.endsWith("?");
}
