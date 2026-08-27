"use client";

// The one question a task has to answer: when.
//
// Two screens ask it — the Tasks tab inside a trip, and the Reminders page across
// all of them — so the control, the two columns it writes to, and the pill that
// reads them back live here rather than being written twice and drifting apart.

import { TIMING_LABELS, TIMING_ORDER, formatShortDay } from "@/lib/format";
import { dueWording } from "@/lib/reminders";
import { ON_A_DATE, timingGroupOf, whenColumns } from "@/lib/tasks/when";

export { ON_A_DATE, timingGroupOf, whenColumns };

/**
 * The one "when" control: the stages, then a date. Picking a stage forgets the
 * date and picking a date forgets the stage, because a task saying both is a task
 * that will eventually contradict itself.
 */
export function WhenField({ timing, due, onTiming, onDue, idPrefix }) {
  const dated = timing === ON_A_DATE;
  return (
    <>
      <select
        className="field"
        value={timing}
        onChange={(e) => onTiming(e.target.value)}
        aria-label="When it needs doing"
        id={`${idPrefix}-when`}
      >
        {TIMING_ORDER.map((t) => (
          <option key={t} value={t}>
            {TIMING_LABELS[t]}
          </option>
        ))}
        <option value={ON_A_DATE}>On a date…</option>
      </select>
      {dated && (
        <input
          className="field"
          type="date"
          value={due}
          required
          onChange={(e) => onDue(e.target.value)}
          aria-label="Due date"
          id={`${idPrefix}-due`}
        />
      )}
    </>
  );
}

/**
 * A date on a pill. Late is red and says so first, because "Overdue" is the word
 * you need and the date is the detail; the next two days get words for the same
 * reason. Everything further out is just the day.
 */
export function DueChip({ due, today }) {
  const word = dueWording(due, today);
  const day = formatShortDay(due);
  if (word?.late) {
    return (
      <span className="chip bg-rose/15 text-rose">Overdue · was {day}</span>
    );
  }
  if (word?.text) {
    return (
      <span className="chip bg-amber/15 text-amber">
        {word.text} · {day}
      </span>
    );
  }
  return <span className="chip bg-amber/15 text-amber">Due {day}</span>;
}
