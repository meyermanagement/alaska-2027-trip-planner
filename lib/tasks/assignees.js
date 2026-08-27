// Who a task can be handed to.
//
// The Tasks tab inside a trip can offer the whole family and be right, because
// you are already looking at one trip. The Reminders page is looking at all of
// them at once, so the answer has to be per trip: the names it offers are the
// people actually going, or the family if nobody has been added to that trip
// yet, and "Shared" for work that belongs to everybody.

const SHARED = "Shared";

/**
 * @param {object} input
 * @param {Array} input.trips     {id, family_id}
 * @param {Array} input.travelers {id, name, is_person, family_id} in display order
 * @param {Array} input.roster    {trip_id, traveler_id}
 * @returns {Record<string, string[]>} trip id → names to offer, "Shared" last
 */
export function assigneeOptions({ trips, travelers, roster }) {
  const byId = new Map((travelers || []).map((t) => [t.id, t]));
  const out = {};
  for (const trip of trips || []) {
    if (!trip?.id) continue;
    const going = (roster || [])
      .filter((r) => r.trip_id === trip.id)
      .map((r) => byId.get(r.traveler_id))
      .filter((t) => t && t.is_person !== false);
    // An empty roster is a trip nobody has been added to yet, not a trip nobody
    // is going on, so fall back to the whole family rather than to nothing.
    const people = going.length
      ? going
      : (travelers || []).filter(
          (t) => t.is_person !== false && t.family_id === trip.family_id,
        );
    const names = [];
    for (const person of people) {
      const name = String(person.name || "").trim();
      if (name && name !== SHARED && !names.includes(name)) names.push(name);
    }
    out[trip.id] = [...names, SHARED];
  }
  return out;
}
