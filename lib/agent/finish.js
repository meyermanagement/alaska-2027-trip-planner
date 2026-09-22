/**
 * The finishing turn's permissions and its name in the ledger.
 *
 * The finishing turn exists to pay one debt the first turn left: words it never
 * wrote, or cards it never drew. It used to be sent a shorter tool list than the
 * first turn -- show_places alone, or nothing -- and a grounding flag that was
 * usually off where the first turn's was on. The tool list is the front of the
 * prompt, so that made it a different prompt from its first token, and the
 * ledger showed it: 40,000 prompt tokens and none of them cached, on a request
 * whose first turn had just cached 28,000 of the same text.
 *
 * So it now sends the first turn's tools unchanged and narrows what may be
 * called through the tool config instead. These two functions are the only
 * decisions in that, kept here so they can be tested without a route.
 */

/**
 * Which tools the finishing turn may call.
 *
 * show_places when cards are owed, or when the first turn drew none and the
 * words being asked for might want some. Nothing otherwise: every change tool
 * stays withheld so what she proposed cannot be proposed twice, and
 * offer_followups because a model asked for words, given any tool at all, can
 * answer by calling it and writing nothing. A silent turn with no cards owed
 * gets nothing to call.
 *
 * @returns {string[]} names; empty means no calls at all
 */
export function finishTools({ silent = false, needCards = false, shortlistCount = 0 } = {}) {
  if (needCards) return ["show_places"];
  if (silent) return [];
  return shortlistCount ? [] : ["show_places"];
}

/** The debts, in the order they are written into the feature key. */
export const FINISH_DEBTS = ["silent", "reasons", "words", "cards"];

/**
 * chat.finish plus what it was finishing, so the ledger can say why it ran.
 *
 * chat.finish.cards, chat.finish.words, chat.finish.reasons+cards. No schema
 * change: the reason rides in the name the rows are already grouped by, and the
 * area stays Ask Aly because the first segment does not move. A turn with no
 * debt recorded keeps the old bare name.
 */
export function finishFeature({ silent = false, owesReasons = false, owesWords = false, needCards = false } = {}) {
  const owed = { silent, reasons: owesReasons, words: owesWords, cards: needCards };
  const said = FINISH_DEBTS.filter((debt) => owed[debt]);
  return said.length ? `chat.finish.${said.join("+")}` : "chat.finish";
}
