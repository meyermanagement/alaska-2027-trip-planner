// The two things every screen has to know before it draws anything.
//
// One: is there a passport that will not survive the six-month rule, anywhere in
// the family, on any trip still ahead of them. Two: is there a pro tip pressing
// enough to be worth interrupting whatever they came here to do.
//
// Read once per page load, in the header, so that a warning cannot be true on one
// screen and absent on another. That is three small queries on every page, which
// is the honest cost of a promise that the band appears everywhere.

import { bannerTips } from "./tip";
import { passportWarnings } from "./warnings";
import { isCurrentTrip, isDraftTrip, lastDayOf } from "../format";

/**
 * @param {object} supabase  a server client for the signed-in visitor
 * @param {string} today     ISO date
 * @returns {{warnings: Array, urgent: Array, current: object|null, upcoming: object|null}}
 */
export async function loadHeaderNotices(supabase, today) {
  // Three columns more than the warnings need — start_date, status and the emoji —
  // because the trip happening today is found in this same set and asking for it
  // separately would be a fourth query on every page load for something already
  // in hand. The filter widened to admit a trip with no end date for the same
  // reason: passportWarnings skips those itself, so nothing downstream changes.
  const { data: trips } = await supabase
    .from("trips")
    .select(
      "id, name, slug, public_id, destination, start_date, end_date, status, cover_emoji, family_id, trip_facts (leaves_country, countries), trip_travelers (travelers (id, name, is_person))",
    )
    .or(`end_date.gte.${today},end_date.is.null`);

  const shaped = (trips || []).map((trip) => ({
    ...trip,
    leavesCountry: trip.trip_facts?.leaves_country === true,
    countries: trip.trip_facts?.countries || [],
    going: (trip.trip_travelers || [])
      .map((row) => row.travelers)
      .filter((person) => person && person.is_person !== false),
  }));

  const travelerIds = [
    ...new Set(shaped.flatMap((trip) => trip.going.map((person) => person.id))),
  ];

  // Only asked for when there is somebody to ask about, and only passports: the
  // driving licenses and Global Entry cards on file are not what stops anyone at
  // a border.
  const documents = travelerIds.length
    ? (
        await supabase
          .from("traveler_documents")
          .select("traveler_id, doc_type, expiration_date")
          .in("traveler_id", travelerIds)
          .eq("doc_type", "passport")
      ).data || []
    : [];

  const { data: tips } = await supabase
    .from("pro_tips")
    .select("*, trips (name, slug, public_id)")
    .eq("status", "active");

  // The trip they are on, if they are on one. Two overlapping trips is not a
  // shape this family has ever had, but the app should not have to guess badly
  // if it happens: the one finishing first is the one whose days are running
  // out, so it is the one worth a band at the top of the screen.
  const current =
    (trips || [])
      .filter((trip) => isCurrentTrip(trip, today))
      .sort((a, b) => lastDayOf(a).localeCompare(lastDayOf(b)))[0] || null;

  // The one after this, for the menu, which shows the trip the family is
  // pointed at whether or not they have left for it yet. The band at the top of
  // the screen is only ever about a trip in progress -- that is what it is for --
  // but a menu with a trip-shaped hole in it for eleven months of the year is a
  // menu whose first row keeps moving, so this falls back to the soonest trip
  // still to come. Drafts are excluded on the same grounds they are excluded
  // from being the next trip anywhere else: an idea with a date on it is not
  // somewhere the family is going.
  const upcoming =
    current ||
    (trips || [])
      .filter(
        (trip) =>
          !isDraftTrip(trip) &&
          trip.start_date &&
          trip.start_date > today &&
          !["complete", "archived", "cancelled"].includes(trip.status),
      )
      .sort((a, b) => a.start_date.localeCompare(b.start_date))[0] ||
    null;

  return {
    warnings: passportWarnings({ trips: shaped, documents, today }),
    urgent: bannerTips(tips || [], today),
    current,
    upcoming,
  };
}
