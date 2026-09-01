/**
 * The items that cannot go in a bag early.
 *
 * Most of a packing list can be packed a week out. A few things cannot: the
 * medications somebody is still taking, the toothbrush, the retainer, the charger
 * that stays in the wall until you leave. Those rows sit unticked for the whole
 * run-up, and a list that is permanently at eighty per cent teaches the family to
 * read an unfinished list as finished. So they are marked, and the mark is what
 * explains the gap.
 *
 * The flag is on the item because it is a property of the thing, not of a view --
 * it has to survive being sent to a template and coming back out on the next trip.
 *
 * There used to be more here: a three-day window, a sentence about how far off the
 * trip was, and a split that pulled the marked rows into a card of their own above
 * the list. That card was a copy of part of the list living beside the list, which
 * is one more place to look and one more place for a tick to seem not to have
 * happened. Marked in place, plus the filter pill that already existed, says the
 * same thing without the second copy.
 */

export const LAST_MINUTE_LABEL = "Last minute";

/**
 * Items whose names give the answer away, used only to pre-mark rows the app is
 * creating for the first time.
 *
 * This never overrides a person. It runs when a list is generated or a floor row
 * is filed, so that a brand new list arrives already sensible, and after that the
 * flag belongs to whoever last touched the item. Being wrong here costs one tap;
 * the alternative -- asking the family to mark forty rows by hand before the
 * feature does anything -- costs the feature.
 */
export const LAST_MINUTE_HINTS = [
  /\bmedication|\bmeds\b|\bpills?\b|\bprescription|\binhaler|\bepipen|\binsulin|\bcpap\b/i,
  /\btoiletr|\btoothbrush|\btoothpaste|\bdeodorant|\brazor|\bshampoo|\bcontact lens|\bretainer/i,
  /\bcharger|\bcharging cable|\bpower bank|\bphone\b.*\bcable\b/i,
  /\bglasses\b|\bsunglasses\b|\bhearing aid/i,
  /\bwallet\b|\bkeys\b|\bpurse\b/i,
  /\bboarding pass/i,
  /\bleftovers\b|\bcool ?bag\b|\bcooler\b|\bbreast milk\b/i,
];

export function looksLastMinute(item) {
  const text = String(item || "");
  if (!text.trim()) return false;
  return LAST_MINUTE_HINTS.some((rule) => rule.test(text));
}
