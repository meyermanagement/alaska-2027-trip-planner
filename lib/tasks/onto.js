/**
 * Put the household's leaving-the-house list onto a trip that has just stopped
 * being a draft.
 *
 * Nothing writes these tasks onto a draft, and that rule is right: half of drafts
 * never become trips, and a stage measured back from a start date that does not
 * exist yet is not a date. But it left a hole nobody could see from either end.
 * A trip created outright gets the list during creation, and Aly pushes it when
 * she builds or rosters a trip -- while a trip that was sketched first and moved
 * across later got a packing list and no house list, because the one moment it
 * became eligible was the one moment nothing looked.
 *
 * So both of the screens that can move a trip out of Drafts call this afterwards.
 * The route it posts to is the same one the Packing page's button uses, and
 * pushHouseTasks is idempotent -- matched on the household task's own id and on
 * the title -- so calling it here cannot produce a second copy of a list the
 * family already has, and cannot resurrect a line they deleted and retyped.
 *
 * Best effort by design, and quiet about failure. A trip that arrives without the
 * bins on it is still the trip they asked for, and the Packing page can put them
 * there; a red message about house tasks in the middle of moving a trip would be
 * the app worrying at somebody who was doing something else.
 *
 * @param tripId the trip, now out of Drafts
 * @returns how many tasks were added, 0 if none or if anything went wrong
 */
export async function houseListOnto(tripId) {
  if (!tripId) return 0;
  try {
    const res = await fetch("/api/house-tasks/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true, trip_id: tripId }),
    });
    if (!res.ok) return 0;
    const out = await res.json();
    return Number(out?.applied?.adds || 0);
  } catch {
    return 0;
  }
}
