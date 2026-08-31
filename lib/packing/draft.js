import { isDraftTrip } from "@/lib/format";

/**
 * A draft does not get a packing list.
 *
 * A draft is an idea the family is still turning over: the dates move, the
 * destination moves, and half of them never become trips at all. Working out
 * eighty-odd items against a plan that has not settled is work thrown away
 * twice over -- once when the dates change and the seasonal guesses go stale,
 * and once when somebody has to read a list for a trip they decided against.
 * Worse, a list appearing under a draft reads as a promise the app has not
 * earned: it looks like the trip is real.
 *
 * So nothing writes packing lines onto a draft. Not the roster tap, not the
 * generator, not Aly, and not a push from a template. The moment the family
 * presses "Move to Upcoming trips" the trip is worked out enough to pack for,
 * and every one of those doors opens at once.
 *
 * Choosing which add-on lists a trip is -- "this is a cruise" -- is a decision
 * rather than a list, so that stays available on a draft and is waiting when the
 * list is finally built.
 */
export function packingWaitsForDraft(trip) {
  return isDraftTrip(trip);
}

/**
 * Said the same way everywhere, because the family will meet this rule in four
 * different places and it should sound like one rule rather than four refusals.
 *
 * @param name the trip's name, when there is one to use
 */
export function draftPackingWords(name) {
  const which = name ? `${name} is` : "That trip is";
  return `${which} still a draft, so there is no packing list for it yet — no point working one out before the trip is. Move it to Upcoming trips and the list can be started from your base list straight away.`;
}
