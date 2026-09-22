// Work out where a trip is again, after its destination changed.
//
// The point on a trip row is only read by the contour drawing behind a plate, so
// this is deliberately quiet: no body, no UI, nothing to wait for. It exists
// because the point is worked out once from the destination's words, and words
// that change leave the old point behind -- a trip edited from "New England" to
// "Lisbon" would keep drawing Maine.
//
// Permission is the ordinary one: read the trip through the caller's own client
// so row-level security answers whether this person may touch it, and only then
// let the service role write the coordinates.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { relocateTrip } from "@/lib/covers/generate";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!trip)
    return NextResponse.json({ error: "No such trip." }, { status: 404 });

  const result = await relocateTrip(id);
  if (!result.ok)
    return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ lat: result.lat, lon: result.lon });
}
