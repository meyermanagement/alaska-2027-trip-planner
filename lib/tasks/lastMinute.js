/**
 * The tasks that cannot be done early, and when to put them in front of somebody.
 *
 * A pre-departure list is mostly things to arrange weeks out: book the kennel,
 * renew the passport, tell the neighbours. A few are not. Stop the mail, set the
 * thermostat, empty the fridge, put the cat out, lock the back door -- those are
 * done on the way out of the house, and on the way out of the house nobody opens
 * the Tasks tab and reads down a list of forty. So on the days either side of
 * leaving, the handful that are actually about leaving come to the top of the two
 * screens people do open: the packing list they are ticking, and the tasks screen
 * itself.
 *
 * Why a stage and not a date. The app already stores a task's "when" as one of
 * two things -- a stage measured from the trip, or a date on the calendar -- and
 * lib/tasks/when.js derives the stage whenever there is a date. So "last minute"
 * needs no new column: it is the two stages that already mean the day before and
 * the travel day. A task Aly files with a date lands in one of them by itself.
 *
 * Why a window and not "the day of the trip" exactly. Half of these get done the
 * night before, and the trip's other travel day is the one coming home, when the
 * same kind of thing applies at the hotel end. The box is open to the family from
 * the day before departure through the last day of the trip and is otherwise not
 * drawn at all, which is the part that matters: a permanent accordion is furniture,
 * and furniture stops being read.
 */

import { timingGroupOf } from "@/lib/tasks/when";
import { shiftDays } from "@/lib/reminders";

// The two stages that mean "not until we are going".
export const LAST_MINUTE_STAGES = ["day_before", "travel_day"];

export const LAST_MINUTE_HEADING = "Last-minute tasks";

/**
 * Is the family close enough to leaving for any of this to be worth showing?
 *
 * A trip with no start date cannot answer the question, and answering it wrongly
 * would put the box on every list in the app forever, so it returns false.
 */
export function nearDeparture(trip, today) {
  const start = trip?.start_date;
  if (!start || !today) return false;
  const opensOn = shiftDays(start, -1);
  const closesOn = trip?.end_date || start;
  return today >= opensOn && today <= closesOn;
}

/**
 * The rows the box holds: open tasks sitting at one of the two stages, plus
 * anything whose date has landed on today or yesterday regardless of its stage --
 * a thing that was due this morning is a last-minute thing by then whatever it
 * was called in March.
 *
 * Done rows are left out entirely rather than shown struck through. The box is
 * a prompt, not a record, and the tasks screen below it already keeps the record.
 */
export function lastMinuteTasks(tasks, trip, today) {
  if (!Array.isArray(tasks) || !today) return [];
  const yesterday = shiftDays(today, -1);
  return tasks.filter((task) => {
    if (!task || task.is_done) return false;
    if (task.due_date && task.due_date <= today && task.due_date >= yesterday)
      return true;
    return LAST_MINUTE_STAGES.includes(timingGroupOf(task, trip, today));
  });
}
