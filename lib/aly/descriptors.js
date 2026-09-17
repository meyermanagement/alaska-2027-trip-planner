/**
 * The four words Aly uses for herself, and the line they resolve into.
 *
 * These came from the beta invitation, where Aly opens by refusing to pick
 * one: "Assistant, advisor, concierge, planner… let's just say wherever you're
 * headed, I've got your back." The refusal is the point. Every single word is
 * either too small for what she does or carries a promise she does not make --
 * a concierge books, a planner stops at the itinerary, an assistant waits to be
 * asked -- and the honest answer is the whole list plus the sentence
 * underneath it.
 *
 * They live here rather than in the email because the front door now says the
 * same thing, and two copies of a brand line drift within a month. Anything
 * that describes Aly in these terms reads them from this file.
 *
 * Order matters and is not alphabetical. It runs from the smallest claim to
 * the largest and then to the one that sounds most like a competitor, so the
 * list reads as somebody circling a definition rather than listing features.
 */

export const ALY_DESCRIPTORS = ["assistant", "advisor", "concierge", "planner"];

/** The payoff the list resolves into. Second person, because she is speaking. */
export const ALY_PAYOFF = "Wherever you’re headed, I’ve got your back.";

/**
 * The list as the invitation writes it: sentence case on the first, commas
 * between, an ellipsis rather than an "and" because she is not finishing the
 * thought.
 */
export function alyDescriptorList() {
  const [first, ...rest] = ALY_DESCRIPTORS;
  const capped = first.charAt(0).toUpperCase() + first.slice(1);
  return [capped, ...rest].join(", ");
}
