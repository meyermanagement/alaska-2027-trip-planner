// A task's "when", as data rather than as a control.
//
// Two columns, one question: pick a stage or pick a day. Kept out of the
// component so the mapping between the two can be tested without a browser, and
// so the Tasks tab and the Reminders page cannot disagree about it.

import { timingForDate } from "@/lib/reminders";

// Some things are due on a day. Most are due at a stage — book it now, sort it
// the week before - and a stage is not vaguer than a date, it is just measured
// from the trip instead of the calendar. So "when" is one question with two kinds
// of answer, and this is the extra option that switches between them.
export const ON_A_DATE = "__date";

/**
 * The two columns the answer lands in. Whichever way the question was answered,
 * the stage is stored too: a date is worth more than a stage, but the stage is
 * what the Tasks tab groups by, so it is derived rather than left stale.
 */
export function whenColumns(timing, due, trip, today) {
  if (timing !== ON_A_DATE || !due) return { timing, due_date: null };
  return {
    due_date: due,
    timing: timingForDate(due, trip, today) || "before_trip",
  };
}

/**
 * Which pile a task belongs in. Worked out from the date when it has one, so a
 * date Aly sets months later still lands the task in the right place without
 * anything having to remember to rewrite the stage.
 */
export function timingGroupOf(task, trip, today) {
  if (task.due_date) {
    return timingForDate(task.due_date, trip, today) || task.timing || "now";
  }
  return task.timing || "now";
}
