// App-side defense in depth. Database RLS remains the authorization boundary.
export function canSeeTrip(trip, access, rosterTripIds = []) {
  if (!trip || !access?.familyId || trip.family_id !== access.familyId) return false;
  if (!access.can?.isSecondary) return true;
  return trip.status !== "draft" && Boolean(access.travelerId) &&
    rosterTripIds.includes(trip.id);
}

export async function visibleTripIds(supabase, access) {
  if (!access?.can?.isSecondary || !access.travelerId) return [];
  const { data, error } = await supabase.from("trip_travelers")
    .select("trip_id").eq("traveler_id", access.travelerId);
  if (error) return [];
  return (data || []).map((row) => row.trip_id);
}
