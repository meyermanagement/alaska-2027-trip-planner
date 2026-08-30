/**
 * What the empty message box says you can do.
 *
 * It used to say "Add dinner Thursday at 6, or paste a whole list…" on every
 * screen, which reads as an instruction manual for one trick. Most of what Aly
 * can do is not adding a dinner, and somebody who has only ever seen that line
 * has no reason to think she can be asked a question at all.
 *
 * So the line follows the screen, the way her answers do, and each one names
 * more than one kind of thing: a question to ask, a change to make, and -- where
 * it applies -- the fact that a whole list can go in at once.
 */

// Deliberately short. This is placeholder text in a box on a phone, not
// documentation: two examples and an admission that there are more.
const BY_FOCUS = {
  itinerary:
    "Ask what is on Thursday, add dinner at 6, move something to the morning, or paste a whole day…",
  packing:
    "Ask what is left for Veda, say you packed the swimsuits, or paste a whole list…",
  tasks:
    "Ask what is not done, add a task with a due date, or say one is finished…",
  notes: "Ask what you have written down, or save something worth remembering…",
  // The builder screen. The point of these is that nothing has to be decided.
  new_trip:
    "Say where, and roughly when — a week somewhere warm over spring break is enough…",
  log_trip:
    "Say where you went and when, or what you would want to remember next time…",
  rewards:
    "Ask what your points are worth, which card to book on, or tell her a balance…",
};

const WITH_TRIP =
  "Ask about this trip, make a change, or paste a whole list of plans…";
const ANY_TRIP =
  "Ask about any trip, start a new one, or paste a whole list of plans…";

/**
 * The placeholder for the message box, given the screen it was opened from.
 *
 * `focus` is the section Aly was opened on, and `hasTrip` is whether a trip is
 * open at all -- with none, she is working across all of them, so the line must
 * not talk about "this trip".
 */
export function askPlaceholder({ focus = null, hasTrip = false } = {}) {
  return BY_FOCUS[focus] || (hasTrip ? WITH_TRIP : ANY_TRIP);
}

/** The same idea in the day view, where the question is always about today. */
export const TODAY_PLACEHOLDER =
  "Ask about today — the weather, what is next, or somewhere to eat nearby…";

export const PLACEHOLDERS = BY_FOCUS;
