import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildPackingList } from "@/lib/packing/generate";
import { appendMessage } from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

// Fill a brand new trip's packing list. Called straight after the trip is
// created, when the family asked for the list to be worked out for them.
//
// Two ways in. From the New trip screen the list is empty and this fills it.
// From Aly, the trip was created with the base template already copied in — so
// that a slow model never leaves a new trip with nothing — and this is called
// with replace: true to upgrade that copy. Either way it refuses to touch a list
// anyone has started using: if a single item is ticked off, it leaves well alone.
// This is a starting point, never something that can overwrite work.
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

  const replace = payload?.replace === true;

  const { data: existing } = await supabase
    .from("packing_items")
    .select("id, is_packed")
    .eq("trip_id", trip.id);
  if (existing?.length) {
    const untouched = existing.every((row) => !row.is_packed);
    if (!replace || !untouched) {
      return NextResponse.json({ count: 0, source: "skipped" });
    }
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
    replace: replace && existing?.length > 0,
  });

  // When this ran off the back of a conversation with Aly, the transcript should
  // say so too — the same rule the apply route follows, so the screen and the
  // stored conversation never disagree.
  let receipt = null;
  if (replace && result.source === "generated" && result.count) {
    receipt = `Packing list worked out as well — ${result.count} items for ${trip.name}, from what you packed on past trips and where this one goes at that time of year.`;
    await appendMessage(
      supabase,
      user.id,
      trip.id,
      "assistant",
      receipt,
      "receipt",
    );
  }

  return NextResponse.json({ ...result, receipt });
}
