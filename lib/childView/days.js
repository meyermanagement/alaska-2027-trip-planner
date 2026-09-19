import { isPastTrip, lastDayOf } from "@/lib/format";
import { tripOpeningTab, homeOpeningTrip } from "@/lib/trips/opening";

// Calendar dates, not elapsed hours: this also works across DST and year ends.
export function childOpeningTab(trip, today) {
  return tripOpeningTab(trip, today, "itinerary");
}

// Only receives the server-authorized roster projection. Current trips outrank
// tomorrow's departures; ties are stable and do not depend on response order.
export function childHomeTrip(trips, today) {
  return homeOpeningTrip(trips, today);
}

export function childItineraryDay(trip, today, selectedDay = null) {
  const days = tripDays(trip);
  return days.includes(selectedDay) ? selectedDay : days.includes(today) ? today
    : days.includes(trip.start_date) ? trip.start_date : days[0];
}

export function tripDays(trip) {
  const days = new Set((trip.itinerary || []).map(item => item.item_date).filter(Boolean));
  const start = new Date(`${trip.start_date}T12:00:00Z`);
  const end = new Date(`${trip.end_date || trip.start_date}T12:00:00Z`);
  for (let date = start, n = 0; date <= end && n < 366; n++, date = new Date(+date + 86400000)) {
    days.add(date.toISOString().slice(0, 10));
  }
  const result = [...days].sort();
  if (trip.itinerary.some(item => !item.item_date)) result.push("Unscheduled");
  return result;
}
export function itemsOnDay(trip, day) {
  return trip.itinerary.filter(item => day === "Unscheduled" ? !item.item_date
    : item.item_date === day || (item.item_date < day && item.end_date >= day));
}
// Same completed/archived/date rules as the regular trips screen. The server
// still owns roster authorization; filtering here never grants access.
export function groupChildTrips(trips, today) {
  const safe = trips.filter(trip => trip.status !== "draft");
  return {
    upcoming: safe.filter(trip => !isPastTrip(trip, today))
      .sort((a, b) => (a.start_date || "9999").localeCompare(b.start_date || "9999") || a.name.localeCompare(b.name)),
    past: safe.filter(trip => isPastTrip(trip, today))
      .sort((a, b) => lastDayOf(b).localeCompare(lastDayOf(a)) || a.name.localeCompare(b.name)),
  };
}
