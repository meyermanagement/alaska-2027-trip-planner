import { isDraftTrip } from "@/lib/format";

// The household's own departure list, and the rules for putting it on a trip.
//
// Kept out of the routes because the interesting part is not the write, it is the
// decision about which tasks apply -- and that decision is wrong in a way nobody
// notices until an alarm gets armed on a house with a child in it.

export const MAX_HOUSE_TASKS = 40;

/**
 * Is the house empty for this trip?
 *
 * Nothing has to ask. The app already knows who is in the family and who is on
 * the trip, so an empty house is just those two sets matching. Pets are
 * deliberately not counted: a dog in a kennel does not keep the mail coming, and
 * a dog left at home with a sitter is the sitter's presence rather than the
 * dog's -- either way it is not a fact this can read off the roster.
 *
 * Unknowable answers come back null rather than false. A trip with no roster at
 * all is not evidence that somebody stayed behind, and treating it as such would
 * silently drop half the list on every trip that never had travelers assigned.
 *
 * @param going traveler names on the trip
 * @param household every person in the family
 * @returns true, false, or null when there is not enough to say
 */
export function houseIsEmpty(going, household) {
  const people = (household || [])
    .map((n) => String(n || "").trim())
    .filter((n) => n && n.toLowerCase() !== "shared");
  const on = new Set(
    (going || [])
      .map((n) => String(n || "").trim().toLowerCase())
      .filter((n) => n && n !== "shared"),
  );
  if (!people.length || !on.size) return null;
  return people.every((n) => on.has(n.toLowerCase()));
}

/**
 * Which of the household's tasks apply to a trip, and why the rest do not.
 *
 * The "why" is half the point. A task that quietly fails to appear is a bug the
 * family finds out about from a neighbor; a task that says "skipped, Veda is
 * home" is a decision they can disagree with.
 */
export function houseTasksFor({ tasks, going, household }) {
  const empty = houseIsEmpty(going, household);
  const staying =
    empty === false
      ? (household || [])
          .map((n) => String(n || "").trim())
          .filter(
            (n) =>
              n &&
              n.toLowerCase() !== "shared" &&
              !(going || []).some(
                (g) => String(g || "").trim().toLowerCase() === n.toLowerCase(),
              ),
          )
      : [];
  const apply = [];
  const skipped = [];
  for (const task of tasks || []) {
    // Unknown counts as empty: the common case by far is that everybody goes,
    // and a list that silently shrinks whenever the roster is blank is worse
    // than one that occasionally offers a task somebody has to tick off.
    if (task.only_when_empty && empty === false) skipped.push(task);
    else apply.push(task);
  }
  return { apply, skipped, empty, staying };
}

/**
 * The rows to write onto a trip.
 *
 * These carry a stage and no date, which is deliberate and is what a hand-typed
 * task does too. The Reminders page and the morning email both run dueInfo at
 * read time, so "the day before" keeps meaning the day before even after the
 * flights move -- whereas a date written down here would still be pointing at
 * the old departure. The stage is the durable fact; the date is a view of it.
 */
export function houseTaskRows({ tasks, trip, going, household, userId }) {
  const { apply, skipped, empty, staying } = houseTasksFor({
    tasks,
    going,
    household,
  });
  const rows = apply.map((task, i) => ({
    trip_id: trip.id,
    house_task_id: task.id,
    title: task.title,
    detail: task.detail || null,
    assignee: task.assignee || "Shared",
    timing: task.timing || "travel_day",
    // Below every hand-typed task on the trip, because these are the ones
    // nobody needs to read until the morning they matter.
    sort_order: (task.sort_order ?? i) + 1000,
  }));
  if (userId) for (const row of rows) row.created_by = userId;
  return { rows, skipped, empty, staying };
}

/**
 * Nothing writes tasks onto a draft, for the same reason nothing writes packing
 * lines onto one: the dates move, and half of them never become trips. A stage
 * measured back from a start date that does not exist yet is not a date.
 */
export function houseTasksWaitForDraft(trip) {
  return isDraftTrip(trip);
}

/**
 * Copy the household list onto a trip, skipping anything already there.
 *
 * Idempotent on purpose. This runs when a trip is created and again whenever
 * somebody presses the button on an existing trip, and the second press should
 * add what is new rather than a second copy of everything.
 */
export async function pushHouseTasks({
  supabase,
  familyId,
  trip,
  going,
  household,
  userId,
}) {
  if (!trip?.id) return { added: 0, skipped: [], reason: "no trip" };
  if (houseTasksWaitForDraft(trip)) {
    return { added: 0, skipped: [], reason: "draft" };
  }
  const { data: tasks } = await supabase
    .from("house_tasks")
    .select("id, title, detail, timing, assignee, only_when_empty, sort_order")
    .eq("family_id", familyId)
    .order("sort_order", { ascending: true });
  if (!tasks?.length) return { added: 0, skipped: [], reason: "empty list" };

  const { rows, skipped, empty, staying } = houseTaskRows({
    tasks,
    trip,
    going,
    household,
    userId,
  });

  // What this trip already carries from the list. Matched on the id where there
  // is one, and on the title otherwise -- a task the family deleted from the
  // household list and then retyped by hand should not come back as a twin.
  const { data: existing } = await supabase
    .from("predeparture_tasks")
    .select("id, title, house_task_id")
    .eq("trip_id", trip.id);
  const haveId = new Set(
    (existing || []).map((r) => r.house_task_id).filter(Boolean),
  );
  const haveTitle = new Set(
    (existing || []).map((r) => String(r.title || "").trim().toLowerCase()),
  );
  const fresh = rows.filter(
    (r) =>
      !haveId.has(r.house_task_id) &&
      !haveTitle.has(String(r.title || "").trim().toLowerCase()),
  );
  if (!fresh.length) {
    return { added: 0, skipped, empty, staying, reason: "already there" };
  }
  const { error } = await supabase.from("predeparture_tasks").insert(fresh);
  if (error) return { added: 0, skipped, empty, staying, error: error.message };
  return { added: fresh.length, skipped, empty, staying };
}
