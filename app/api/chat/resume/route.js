import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FRESH_EACH_TIME, latestConversation } from "@/lib/agent/thread";
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
// Private per person, and enforced rather than promised: RLS on
// chat_conversations restricts every row to auth.uid(), so this cannot hand back
// somebody else's thread about a trip they share. Two people on the same trip
// keep two conversations. There is nothing in the response either way that says
// whether anyone else has one.
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

  // Building a trip from nothing starts fresh every time — see FRESH_EACH_TIME.
  if (FRESH_EACH_TIME.has(focus)) {
    return NextResponse.json({ conversation: null });
  }

  // A trip id from the client is trusted only as far as the person's own rows. A
  // trip that is not theirs reads as no trip, which resumes their general thread
  // rather than telling them the trip exists.
  let ownTripId = null;
  if (tripId) {
    const { data } = await supabase
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .maybeSingle();
    ownTripId = data?.id || null;
  }

  const { conversation, error } = await latestConversation(supabase, {
    tripId: ownTripId,
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
          focus: conversation.focus || null,
        }
      : null,
  });
}
