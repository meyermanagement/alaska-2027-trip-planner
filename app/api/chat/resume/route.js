import { tripRef } from "@/lib/trips/route";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { latestConversation, resumesLastThread } from "@/lib/agent/thread";
import { isKnownFocus } from "@/lib/agent/context";

export const runtime = "nodejs";
export const maxDuration = 60;

// Which conversation to open, when somebody presses Ask Aly rather than picking
// one from the list.
//
// The answer is the one they were last having about this trip. Opening Aly used
// to file every question under a new conversation, so a draft accumulated nine
// short threads that each began with Aly knowing nothing about the last, and
// "Change with Aly" on Tuesday could not see what was agreed on Monday.
//
// Your own thread, even now that the parents can read each other's: this hands
// back the last conversation YOU were having about this trip, never somebody
// else's. Their conversations are on the list, with their name on them, and
// opening one is a choice rather than something Ask Aly does to you.
export async function GET(request) {
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

  const params = new URL(request.url).searchParams;
  const asked = params.get("tripId");
  const tripId =
    asked && asked !== "null" && asked !== "undefined" ? asked : null;
  const focus = isKnownFocus(params.get("focus")) ? params.get("focus") : null;

  // A trip id from the client is trusted only as far as the person's own rows. A
  // trip that is not theirs reads as no trip, which starts a fresh conversation
  // rather than telling them the trip exists.
  let ownTripId = null;
  let ownTripRef = null;
  if (tripId) {
    const { data } = await supabase
      .from("trips")
      .select("id, slug, public_id")
      .eq("id", tripId)
      .maybeSingle();
    ownTripId = data?.id || null;
    ownTripRef = tripRef(data) || null;
  }

  // Nothing to pick up: a question with no trip behind it opens its own thread.
  // See resumesLastThread.
  if (!resumesLastThread(focus, ownTripId)) {
    return NextResponse.json({ conversation: null });
  }

  const { conversation, error } = await latestConversation(supabase, {
    tripId: ownTripId,
    ownerId: user.id,
  });
  // A lookup that fails is not worth an error on the screen: the panel opens on
  // a new conversation, which is what it did before any of this.
  if (error) return NextResponse.json({ conversation: null });

  return NextResponse.json({
    conversation: conversation
      ? {
          id: conversation.id,
          title: conversation.title || null,
          tripId: conversation.trip_id || null,
          // The address, not the id: /trips/<uuid> is a Not Found page.
          tripRef: ownTripRef,
          focus: conversation.focus || null,
          visibility: conversation.visibility || "family",
          mine: true,
        }
      : null,
  });
}
