// Who needs an email this morning, and about what.
//
// Kept away from the database and the mailer on purpose: deciding who is on the
// hook for what is the part that can quietly go wrong, and it is the part worth
// being able to test on its own. Everything here is a pure function of rows that
// were already read.
//
// The rules, in one place:
//   - A task with a due date is due on that date.
//   - A task with no date still has a stage, and a stage is a date once the trip
//     start is known - except "Book now", whose date is always today, and which
//     would therefore email every single morning forever.
//   - "Shared" means the family, so it reaches everyone travelling with an
//     address on their row. A name means that person alone.
//   - Nothing goes out for a task already ticked off, or for a trip that has
//     finished or is still a draft.

import { isDraftTrip, isPastTrip } from "@/lib/format";
import { dueInfo } from "@/lib/reminders";

const SHARED = "shared";

/** A stage whose date is a real day rather than "whenever you read this". */
function datedStage(task) {
  return (task.timing || "now") !== "now";
}

/**
 * What a task is due on today, if anything.
 * @returns {null | {date: string, exact: boolean, note: string|null}}
 */
export function dueOn(task, trip, today) {
  if (!task || task.is_done) return null;
  if (!trip || isPastTrip(trip, today) || isDraftTrip(trip)) return null;
  if (task.due_date) {
    return task.due_date === today
      ? { date: task.due_date, exact: true, note: null }
      : null;
  }
  if (!datedStage(task)) return null;
  const info = dueInfo(task, trip, today);
  return info.date === today ? { ...info, exact: false } : null;
}

/**
 * Everyone who could be emailed at all: a person, with an address, who has not
 * turned these off. wants_reminders is only false when someone has explicitly
 * said no, so a row that predates the column still gets its reminders.
 */
function reachable(travelers) {
  return (travelers || []).filter(
    (t) => t && t.email && t.is_person !== false && t.wants_reminders !== false,
  );
}

/**
 * Who is responsible for one task.
 *
 * A named assignee is matched by name, because that is what the column holds -
 * the app has always let you type a name that is not on the roster, and someone
 * who is not a person in the app cannot be emailed.
 */
export function responsibleFor(task, travelers, rosterIds = null) {
  const people = reachable(travelers);
  const name = String(task?.assignee || "").trim();
  if (!name || name.toLowerCase() === SHARED) {
    // Shared work reaches whoever is actually going, when we know who that is.
    return rosterIds
      ? people.filter((p) => rosterIds.has(p.id))
      : people.slice();
  }
  const match = people.filter(
    (p) =>
      String(p.name || "")
        .trim()
        .toLowerCase() === name.toLowerCase(),
  );
  return match;
}

/**
 * One batch of email to send: a person, and the tasks of theirs due today.
 *
 * @param {object} input
 * @param {Array} input.tasks   task rows, each with `trip`
 * @param {Array} input.travelers  people rows with name/email/is_person
 * @param {Map<string, Set<string>>} [input.rosterByTrip]  trip id → traveler ids
 * @param {string} input.today  YYYY-MM-DD
 * @param {Set<string>} [input.alreadySent]  "taskId:travelerId" pairs done today
 */
export function remindersDueToday({
  tasks,
  travelers,
  rosterByTrip = null,
  today,
  alreadySent = null,
}) {
  const byPerson = new Map();

  for (const task of tasks || []) {
    const trip = task.trip || task.trips || null;
    const due = dueOn(task, trip, today);
    if (!due) continue;

    const roster = rosterByTrip?.get(trip.id) || null;
    for (const person of responsibleFor(task, travelers, roster)) {
      if (alreadySent?.has(`${task.id}:${person.id}`)) continue;
      if (!byPerson.has(person.id)) {
        byPerson.set(person.id, { person, items: [] });
      }
      byPerson.get(person.id).items.push({
        id: task.id,
        title: task.title,
        detail: task.detail || null,
        priority: (task.priority || "normal").toLowerCase(),
        assignee: task.assignee || "Shared",
        exact: due.exact,
        note: due.note,
        tripName: trip.name || "Trip",
        tripSlug: trip.slug || null,
      });
    }
  }

  // High priority first inside each person's list, then whatever a named date
  // beats a stage, then alphabetically so the order is at least stable.
  const weight = { high: 0, normal: 1, low: 2 };
  for (const batch of byPerson.values()) {
    batch.items.sort(
      (a, b) =>
        (weight[a.priority] ?? 1) - (weight[b.priority] ?? 1) ||
        Number(b.exact) - Number(a.exact) ||
        String(a.title).localeCompare(String(b.title)),
    );
  }

  // A predictable order out, so a run reads the same way twice.
  return [...byPerson.values()].sort((a, b) =>
    String(a.person.name || "").localeCompare(String(b.person.name || "")),
  );
}
