import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

/**
 * File one inbox message onto a trip.
 *
 * The message stays in the database -- filing is a status change plus a
 * pointer to the trip -- so a family can still see what has arrived and where
 * it went. Any attribution the primary set at filing time (attributed_traveler_id)
 * is written here too, so the message ends up with a real person on it even
 * when the sender was originally unknown.
 *
 * The parse into itinerary_items is a follow-up commit. This route only
 * files the message; the trip page will pick up filed messages in its own
 * time and offer to parse them.
 */
export async function POST(request, { params }) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing message id." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const tripId = body?.trip_id;
  const travelerId = body?.traveler_id || null;
  if (!tripId) {
    return NextResponse.json(
      { error: "Which trip should this be filed under?" },
      { status: 400 },
    );
  }

  // Read the row through RLS -- if the caller is not on the family, they get
  // an empty result and a 404 back rather than a diagnostic that would
  // confirm the id exists.
  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, family_id, status, attributed_traveler_id")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Confirm the trip is on the same family, so filing a message from one
  // family onto another family's trip is not even a shape the API accepts.
  const { data: trip } = await supabase
    .from("trips")
    .select("id, family_id")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip || trip.family_id !== message.family_id) {
    return NextResponse.json(
      { error: "That trip is not on this family." },
      { status: 400 },
    );
  }

  const update = {
    status: "filed",
    filed_trip_id: tripId,
    filed_at: new Date().toISOString(),
    filed_by: user.id,
  };
  // Only overwrite attribution when the caller sent one -- filing a message
  // that already had a traveler linked should not blank it out because the
  // primary happened not to pick one in the file-it dialog.
  if (travelerId) update.attributed_traveler_id = travelerId;

  const { error } = await supabase
    .from("inbox_messages")
    .update(update)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
