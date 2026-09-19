// Everything a verdict is measured against, read in one go.
//
// The verdict itself is pure, which is the point of it, so somebody has to fetch
// the eight things it compares a fare with. That happens here rather than in the
// screen because two callers need exactly the same set and a second reader
// written to be "close enough" is how a card and Aly end up disagreeing about the
// same fare in front of the same family.
//
// Only reached for when there is at least one fare to judge. A household who has
// never pasted one pays nothing for this.

import { dealVerdict } from "@/lib/deals/verdict";

export async function readDealWorld(supabase, familyId) {
  const [
    trips,
    itinerary,
    costs,
    rosters,
    travelers,
    airports,
    someday,
    rewards,
  ] = await Promise.all([
    supabase
      .from("trips")
      .select(
        "id, name, slug, public_id, destination, start_date, end_date, status, budget_target",
      )
      .eq("family_id", familyId),
    supabase
      .from("itinerary_items")
      .select(
        "id, trip_id, title, item_date, location, category, status, cost_estimate, cost_actual, cost_note",
      ),
    supabase.from("trip_costs").select("*"),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
    supabase.from("travelers").select("id, name").eq("is_person", true),
    supabase
      .from("home_airports")
      .select("code, name, city, region, drive_minutes, is_primary")
      .eq("family_id", familyId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("someday_places")
      .select("*")
      .eq("family_id", familyId)
      .order("created_at", { ascending: true }),
    supabase
      .from("rewards_programs")
      .select("id, name, kind, points_balance, currency_label, is_active")
      .eq("is_active", true),
  ]);

  return {
    trips: trips.data || [],
    itinerary: itinerary.data || [],
    costs: costs.data || [],
    rosters: rosters.data || [],
    travelers: travelers.data || [],
    airports: airports.data || [],
    someday: someday.data || [],
    rewards: rewards.data || [],
  };
}

/**
 * The fares, each with its verdict worked out, ready for a screen.
 *
 * The verdict rides on the row rather than in it: nothing here is saved, and the
 * same row read an hour later after the budget moved comes back with different
 * facts, which is the behavior this whole feature turns on.
 */
export function judged(deals = [], world = {}, today = new Date()) {
  return (deals || []).map((deal) => ({
    ...deal,
    verdict: dealVerdict(deal, { ...world, today }),
  }));
}
