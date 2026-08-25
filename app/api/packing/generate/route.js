import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPackingList } from "@/lib/packing/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fill a brand new trip's packing list. Called straight after the trip is
// created, when the family asked for the list to be worked out for them.
//
// Deliberately refuses to run on a trip that already has items: this is a
// starting point, not something that can overwrite work.
export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = typeof payload?.tripId === "string" ? payload.tripId : "";
  if (!tripId) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const { data: trip } = await supabase
    .from("trips")
    .select("id, family_id, name, destination, start_date, end_date, summary")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const { count: existing } = await supabase
    .from("packing_items")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", trip.id);
  if (existing) {
    return NextResponse.json({ count: 0, source: "skipped" });
  }

  // Who is going, so the list is assigned to real people. A brand new trip
  // usually has nobody on it yet, in which case everyone in the family counts.
  const [rosterRes, travelerRes] = await Promise.all([
    supabase
      .from("trip_travelers")
      .select("traveler_id")
      .eq("trip_id", trip.id),
    supabase.from("travelers").select("id, name").order("sort_order"),
  ]);
  const travelers = travelerRes.data || [];
  const going = new Set((rosterRes.data || []).map((r) => r.traveler_id));
  const names = (
    going.size ? travelers.filter((t) => going.has(t.id)) : travelers
  ).map((t) => t.name);

  const result = await buildPackingList({
    supabase,
    trip,
    travelerNames: names,
  });

  return NextResponse.json(result);
}
