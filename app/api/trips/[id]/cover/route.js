// Ask for a trip's picture, and ask whether it is done.
//
// POST starts a drawing. GET says where it got to. Two calls rather than one
// long one, because a generation takes twenty to forty seconds and a fetch that
// is left open that long is a fetch that a phone locking its screen will kill
// halfway through -- and the row would then say "drawing" forever.
//
// The permission check is deliberately the ordinary one: read the trip through
// the *caller's* client, so row-level security answers the question of whether
// this person may touch this trip. Only after that does the generator use the
// service role, which it must, because writing to Storage is not something a
// browser session is allowed to do here.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTripCover } from "@/lib/covers/generate";

export const runtime = "nodejs";
// Long, because the whole point is that the model gets its forty seconds. Vercel
// caps this by plan; if it is cut short the row is left saying "drawing" and the
// screen offers another go, which is the same recovery as any other failure.
export const maxDuration = 120;

async function mine(supabase, id) {
  const { data } = await supabase
    .from("trips")
    .select("id, cover_image_status, cover_image_url, cover_image_alt")
    .eq("id", id)
    .maybeSingle();
  return data || null;
}

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const trip = await mine(supabase, id);
  if (!trip)
    return NextResponse.json({ error: "No such trip." }, { status: 404 });

  // Two people pressing the button at once, or a press on a trip that is already
  // drawing, would spend two image requests to end with one picture.
  if (trip.cover_image_status === "drawing") {
    return NextResponse.json({ status: "drawing" });
  }

  let extra = "";
  try {
    const body = await request.json();
    extra = String(body?.extra || "").slice(0, 300);
  } catch {
    extra = "";
  }

  const result = await generateTripCover(id, { extra });
  if (!result.ok) {
    return NextResponse.json(
      { status: "failed", error: result.error },
      { status: 502 },
    );
  }
  return NextResponse.json({ status: "ready", url: result.url });
}

export async function GET(_request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const trip = await mine(supabase, id);
  if (!trip)
    return NextResponse.json({ error: "No such trip." }, { status: 404 });

  return NextResponse.json({
    status: trip.cover_image_status || "none",
    url: trip.cover_image_url || null,
    alt: trip.cover_image_alt || null,
  });
}
