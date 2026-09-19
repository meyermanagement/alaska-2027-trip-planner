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
