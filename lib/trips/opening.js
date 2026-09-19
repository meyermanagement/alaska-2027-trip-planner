import { isCurrentTrip } from "@/lib/format";
import { tripPath } from "@/lib/trips/route";

// Calendar arithmetic rather than 24-hour durations keeps DST/year ends safe.
export function tripOpeningTab(trip, today, fallback = "overview") {
  if (!trip || !today || trip.archived_at ||
      ["draft", "complete", "archived", "cancelled", "canceled"].includes(trip.status)) return fallback;
  if (isCurrentTrip(trip, today)) return "itinerary";
  const start = new Date(`${trip.start_date}T12:00:00Z`);
  if (!Number.isFinite(+start)) return fallback;
  start.setUTCDate(start.getUTCDate() - 1);
  return start.toISOString().slice(0, 10) === today ? "packing" : fallback;
}

// Callers supply only authorized trips for the traveler. Never grants access.
export function homeOpeningTrip(trips, today) {
  return trips.filter(trip => tripOpeningTab(trip, today) !== "overview")
    .sort((a, b) =>
      Number(isCurrentTrip(b, today)) - Number(isCurrentTrip(a, today)) ||
      (b.start_date || "").localeCompare(a.start_date || "") ||
      String(a.id).localeCompare(String(b.id)))[0] || null;
}

export function homeOpeningPath(trips, today, params) {
  // Explicit list views and ordinary Back/menu navigation must never bounce.
  if (params.get("arrival") !== "1" || params.has("view")) return null;
  const trip = homeOpeningTrip(trips, today);
  if (!trip || tripPath(trip) === "/trips") return null;
  const tab = tripOpeningTab(trip, today);
  // Itinerary resolves today's date itself. Do not freeze an automatically
  // selected date into a bookmark that might be reopened tomorrow.
  return tripPath(trip, tab);
}

export function openingTabForLink(trip, today, requested, allowed) {
  return allowed.includes(requested) ? requested : tripOpeningTab(trip, today);
}
