import { homeToday, isArchivedTrip, isCurrentTrip, isDraftTrip, isPastTrip } from "@/lib/format";

// Match TripBoard's tab counts: happening-now trips have their own panel, and
// archived trips live in a separate drawer below the Trip log shelf.
export function tripMenuCounts(trips = [], today = homeToday()) {
  const counts = { drafts: 0, planned: 0, logged: 0 };
  for (const trip of trips) {
    if (isDraftTrip(trip)) counts.drafts++;
    else if (isPastTrip(trip, today)) {
      if (!isArchivedTrip(trip)) counts.logged++;
    } else if (!isCurrentTrip(trip, today)) counts.planned++;
  }
  return counts;
}
