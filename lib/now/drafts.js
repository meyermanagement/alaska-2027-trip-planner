import { isArchivedTrip, isDraftTrip } from "@/lib/format";
import { basicsProgress } from "@/lib/trips/basics";
import { tripPath } from "@/lib/trips/route";

/**
 * The draft to say out loud on the home screen when nothing is on the calendar.
 *
 * A household that has started a trip and not finished it used to get a screen
 * whose first move was Start a trip, with the half-built one mentioned nowhere
 * but the menu. So the invitation names it instead, and the first button picks it
 * up rather than beginning a second.
 *
 * One draft is named. Several are counted and handed to the trips screen filtered
 * to drafts, because a line that named one of four would be choosing for the
 * family, and a line that named all four would not be a line.
 *
 * Progress is read from the seven questions rather than from the itinerary: what
 * makes a draft worth returning to is how much of it is answered, and that is
 * what the trip builder asks about the moment it opens.
 */
export function draftsWaiting(trips = []) {
  // A failed query hands this null rather than an empty list, and a home screen
  // that throws over a missing draft line would be a poor trade.
  const drafts = [];
  for (const trip of Array.isArray(trips) ? trips : []) {
    if (!trip || !isDraftTrip(trip)) continue;
    if (isArchivedTrip(trip) || trip.archived_at) continue;
    drafts.push(trip);
  }
  if (!drafts.length) return null;
  if (drafts.length > 1) {
    return { count: drafts.length, href: "/trips?view=drafts" };
  }
  const [trip] = drafts;
  const { answered, total } = basicsProgress(trip);
  return {
    count: 1,
    href: tripPath(trip),
    name: trip.name || "Untitled trip",
    // Said only when there is something to say. A draft with nothing answered
    // is the common case on the day it is started, and "0 of 7 answered" reads
    // as a scolding rather than as a place to carry on from.
    progress: answered ? `${answered} of ${total} answered` : null,
  };
}
