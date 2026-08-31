/**
 * When the answer above the cards is just the cards read out.
 *
 * The panel puts Aly's words above the shortlist, because the words are the
 * answer and the cards illustrate it. What kept happening instead was this, and
 * it is her whole reply verbatim:
 *
 *   "Equestrian Center at Herdade da Malhadinha Nova; Livraria Bertrand; Private
 *    Dolphin & Cave Cruise from Albufeira Marina; Quinta da Regaleira; Vila Vita
 *    Spa by Sisley Paris. Tap Add to itinerary on any one, or tell me which."
 *
 * Five names that are already on the five cards directly underneath, and a line
 * asking which one they want. Nothing about which she would book, nothing about
 * how they differ, nothing a card could not already say. The prompt forbids all
 * three of those things explicitly and she did them anyway, which is why this is
 * code and not another sentence of instruction.
 *
 * So: notice it, and ask once more for the words alone with the shortlist tool
 * taken away so she cannot answer by listing them a third time.
 */

const words = (text) =>
  String(text || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];

/**
 * Lines that are about operating the cards rather than about the places.
 *
 * These are hers, and the app already says all of it in the interface: every card
 * carries the button, so a sentence pointing at the button is not an answer. They
 * come out before the residue is measured, or "Tap Add to itinerary on any one,
 * or tell me which" would read as fifteen words of content.
 */
const CARD_TALK = [
  /\btap(?:ping)?\s+(?:the\s+)?["“]?add to itinerary["”]?[^.!?]*/gi,
  /\badd(?:ing)?\s+(?:one|any(?:\s+one)?|it)\s+(?:to\s+the\s+itinerary\s+)?is\s+(?:just\s+)?a\s+tap[^.!?]*/gi,
  /\b(?:or\s+)?(?:just\s+)?tell me which(?:\s+one)?(?:\s+you\s+\w+)?[^.!?]*/gi,
  /\b(?:let me know|say the word)\s+which[^.!?]*/gi,
  /\bhere are (?:some|a few|five|four|three|two)?\s*(?:options|ideas|places|suggestions)[^.!?]*/gi,
  /\bshown? (?:below|as cards)[^.!?]*/gi,
];

/**
 * How much of the shortlist the reply reads out, and what is left when it has.
 *
 * Names are removed longest-first so that "Centro" inside "Centro Rooftop" cannot
 * eat the shorter name's match and undercount the roll call.
 */
export function residue(text, places = []) {
  let rest = String(text || "");
  const names = (Array.isArray(places) ? places : [])
    .map((p) => String(p?.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  let named = 0;
  for (const name of names) {
    // Whole-name match, punctuation and all, wherever it appears.
    const pattern = new RegExp(
      name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );
    if (pattern.test(rest)) {
      named += 1;
      rest = rest.replace(new RegExp(pattern.source, "gi"), " ");
    }
  }

  for (const pattern of CARD_TALK) rest = rest.replace(pattern, " ");

  return { named, of: names.length, left: words(rest).length };
}

/** Below this many words of its own, a reply is not saying anything. */
export const ENOUGH_WORDS = 25;

/** Naming at least this share of the shortlist is reading it out. */
export const MOST_OF_IT = 0.6;

/**
 * Is this reply just the cards again?
 *
 * Both halves are needed, and each one is what stops the other being wrong.
 *
 * Reading out most of the shortlist is not by itself a fault -- a real answer that
 * works through all five and says which to book will mention all five names, and
 * that answer has hundreds of words of its own. And having little to say is not by
 * itself a fault either: "I would book Clyde's, it is the only one that seats five
 * on a Friday" is eleven words and a complete answer to the question asked. It
 * names one card, not most of them.
 *
 * It is the combination -- most of the names, almost nothing else -- that can only
 * be a roll call.
 */
export function isRollCall(text, places = []) {
  const list = Array.isArray(places) ? places : [];
  // One card is not a list, and there is nothing to read out.
  if (list.length < 2) return false;
  if (!String(text || "").trim()) return false;

  const { named, of, left } = residue(text, list);
  if (!of) return false;
  if (left >= ENOUGH_WORDS) return false;
  return named >= Math.max(3, Math.ceil(of * MOST_OF_IT));
}

/**
 * Does this answer still need writing?
 *
 * The roll call is one of two ways the words above the cards come out worthless,
 * and it turned out to be the milder one. The other is silence: the model treats
 * the shortlist as the whole answer, calls the tool, writes nothing at all, and
 * the panel has cards with a bare line of names above them that the route wrote
 * because it had to write something. "Which of these should we add?" came back
 * that way -- ten names, none of them said anything about, from a question that
 * was asking to be advised.
 *
 * isRollCall says no to empty text on purpose: nothing cannot be measured for
 * how much of the list it reads out. This is the question the route wants asked
 * instead, and one card with nothing said about it counts, because a card the
 * model chose to show and would not comment on is the same failure smaller.
 */
export function needsWords(text, places = []) {
  const list = Array.isArray(places) ? places : [];
  if (!list.length) return false;
  if (!String(text || "").trim()) return true;
  return isRollCall(text, list);
}

/**
 * What she is told when it happens.
 *
 * Short, and specific about the two things she got wrong: the names are already
 * on screen, and the reply is read above them rather than after them.
 */
export function writeTheWords(said, places = []) {
  const names = (Array.isArray(places) ? places : [])
    .map((p) => String(p?.name || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return [
    "YOU HAVE NOT ANSWERED THEM YET:",
    `The shortlist is already on their screen as cards${
      names.length ? `: ${names.join("; ")}` : ""
    }. Each card already carries the name, the area, the price, the photograph, a link to the place, a link to the map, an Add to itinerary button and a Tell me more button.`,
    "So your reply cannot be those names again, and it cannot be a line telling them to tap a button they can already see. Both of those are worth nothing to them.",
    "Your words are printed ABOVE the cards, as the answer the cards illustrate. Write that answer now: which one you would book and why, what would change your mind, and how they actually differ from each other — the walkable one against the taxi ride, the loud one against the quiet one, the one that needs a table three weeks out. Two short paragraphs, or a few headed sections when the shortlist splits into groups worth naming. Say a name only when you are saying something about it that is not already on its card.",
    `What they asked was: ${String(said || "").slice(0, 600)}`,
  ].join("\n\n");
}
