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

/**
 * @param {object} supabase  a server client for the signed-in visitor
 * @param {string} today     ISO date
 * @returns {{warnings: Array, urgent: Array}}
 */
export async function loadHeaderNotices(supabase, today) {
  const { data: trips } = await supabase
    .from("trips")
    .select(
      "id, name, slug, destination, end_date, family_id, trip_facts (leaves_country, countries), trip_travelers (travelers (id, name, is_person))",
    )
    .gte("end_date", today);

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
  // driving licences and Global Entry cards on file are not what stops anyone at
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
    .select("*, trips (name, slug)")
    .eq("status", "active");

  return {
    warnings: passportWarnings({ trips: shaped, documents, today }),
    urgent: bannerTips(tips || [], today),
  };
}
