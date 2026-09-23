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

/** Said before the finishing instructions so they read as the app's, not the traveler's. */
export const FINISH_NOTE_LEAD = "From the app, not from the traveler:";

/**
 * The conversation the finishing turn is sent: the first turn's, unchanged,
 * with the instructions added as a note after the last thing the person said.
 *
 * The instructions used to be appended to the system prompt, and the calls
 * narrowed through the tool config. Both changed the request ahead of the
 * conversation, and the ledger showed the cost: the finish cached 0 of 50,260
 * tokens while the retry, an exact copy of the first request, cached 42,885.
 * Here nothing ahead of the note differs from the request that just answered.
 *
 * @param {Array<{role: string, text: string, notes?: string[]}>} messages
 * @param {string[]} instructions empty strings are dropped
 */
export function withFinishNote(messages = [], instructions = []) {
  const said = instructions.filter((line) => typeof line === "string" && line.trim());
  if (!said.length) return messages;
  const note = [FINISH_NOTE_LEAD, ...said].join("\n\n");
  const last = messages[messages.length - 1];
  if (last && last.role !== "assistant") {
    return [
      ...messages.slice(0, -1),
      { ...last, notes: [...(Array.isArray(last.notes) ? last.notes : []), note] },
    ];
  }
  return [...messages, { role: "user", text: note }];
}

/** What the note says about calls, since the tool config no longer narrows them. */
export function callsLine(mayCall = []) {
  if (!mayCall.length) return "Do not call any tool on this turn. Reply in words only.";
  return `The only tool you may call on this turn is ${mayCall.join(", ")}. Anything else will be ignored.`;
}

/** A message's text with its notes after it, for providers that take one string per turn. */
export function textWithNotes(m) {
  const notes = Array.isArray(m?.notes) ? m.notes.filter((n) => typeof n === "string" && n) : [];
  return [m?.text, ...notes].filter((t) => typeof t === "string" && t).join("\n\n");
}
