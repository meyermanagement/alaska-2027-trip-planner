/**
 * The items that cannot go in a bag early, and when to make a point of them.
 *
 * Most of a packing list can be packed a week out. A few things cannot: the
 * medications somebody is still taking, the toothbrush, the retainer, the charger
 * that stays in the wall until you leave. Those rows sit unticked for the whole
 * run-up, and a list that is permanently at eighty per cent teaches the family to
 * read an unfinished list as finished.
 *
 * The flag is on the item because it is a property of the thing, not of a view --
 * it has to survive being sent to a template and coming back out on the next trip.
 * The decision this file owns is the quieter one: how loudly to say it, and when.
 * Marked items are named in place all the time, and they only get pulled out into
 * their own block once the trip is close enough that walking out the door is the
 * next thing that happens.
 */

/**
 * How close is close. Three days is the window where the answer to "have I
 * packed?" stops being "mostly" and starts being "I am leaving on Thursday".
 * Earlier than that and a pinned block is just a second copy of the list.
 */
export const NEAR_DAYS = 3;

export const LAST_MINUTE_LABEL = "Last minute";
export const LAST_MINUTE_HEADING = "Before you walk out the door";

/**
 * Whole days from one YYYY-MM-DD to another, done on the strings.
 *
 * Deliberately not `new Date(a) - new Date(b)` on local dates: this same question
 * gets asked on the server, where the clock is UTC, and in the browser, where it
 * is not. Both have to get the same number or the section appears a day early in
 * one place and a day late in the other. Noon UTC keeps it clear of every offset.
 */
export function daysBetween(fromIso, toIso) {
  const from = dayValue(fromIso);
  const to = dayValue(toIso);
  if (from === null || to === null) return null;
  return Math.round((to - from) / 86400000);
}

function dayValue(iso) {
  const text = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const value = Date.parse(`${text}T12:00:00Z`);
  return Number.isNaN(value) ? null : value;
}

/**
 * Where this trip is relative to today, as far as packing cares.
 *
 * `near` is the only thing the screen acts on, and it stays true for the duration
 * of the trip rather than only on the run-up. That is not laziness: you pack the
 * toothbrush to come home too, and the day you check out is exactly the morning
 * you would forget it.
 */
export function packingPhase({ start, end, today }) {
  const days = daysBetween(today, start);
  if (days === null)
    return { days: null, near: false, running: false, past: false };
  const untilEnd = end ? daysBetween(today, end) : days;
  const running = days <= 0 && (untilEnd === null || untilEnd >= 0);
  const past = untilEnd !== null && untilEnd < 0;
  return {
    days,
    near: !past && days <= NEAR_DAYS,
    running,
    past,
  };
}

/** How the pinned block introduces itself, given how far off the trip is. */
export function nearSaid(phase) {
  if (!phase?.near) return "";
  // The departure day is asked before the running check on purpose: it is both,
  // and "you leave today" is the more useful of the two things to say.
  if (phase.days === 0) return "You leave today. These are the ones still out.";
  if (phase.running) return "Things to pick up on your way out each morning.";
  if (phase.days === 1)
    return "You leave tomorrow. These cannot go in a bag yet.";
  return `You leave in ${phase.days} days. These cannot go in a bag yet.`;
}

export function isLastMinute(row) {
  return !!row?.last_minute;
}

/**
 * The list split in two, with order preserved inside each half. The rest of the
 * list keeps its categories and its sort; the pinned block is a flat list, because
 * six things you are about to grab do not need to be filed.
 */
export function splitLastMinute(items = []) {
  const held = [];
  const rest = [];
  for (const row of items) (isLastMinute(row) ? held : rest).push(row);
  return { held, rest };
}

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
