import { todayISO } from "@/lib/reminders";

// Shared by the picker, matching, and write endpoint. Missing dates do not make
// a draft unusable, but a finished/archived or already-started trip is not a
// destination for a new offer.
export function canAttachFare(trip, today = todayISO()) {
  if (!trip || !["draft", "planning"].includes(trip.status)) return false;
  if ((trip.end_date || trip.start_date || "9999-12-31") < today) return false;
  return trip.status === "draft" || !trip.start_date || trip.start_date >= today;
}

export function canAttachFareToPlace(place) {
  return Boolean(place && place.status === "open");
}
