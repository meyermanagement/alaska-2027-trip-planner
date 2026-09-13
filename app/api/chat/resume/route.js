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
  const user = await whoIsAsking(supabase);
  if (!user) {
    // Said plainly, and named, because the panel has to be able to tell this
    // apart from a trip nobody has asked about yet. Until now both came back as
    // "no conversation", so a session that could not be confirmed opened an
    // empty box on a trip with a fortnight of planning in it.
    return NextResponse.json(
      { error: "Please sign in again.", reason: "signed-out" },
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
    const { data, error } = await supabase
      .from("trips")
      .select("id, slug, public_id")
      .eq("id", tripId)
      .maybeSingle();
    // A trip that could not be read is not a trip that is not theirs. Saying so
    // is the difference between the panel offering another go and the panel
    // quietly pretending this trip has never been discussed.
    if (error) return NextResponse.json({ conversation: null, failed: true });
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
  // A lookup that failed is reported as a failure rather than as an absence. The
  // panel still opens on an empty conversation -- there is nothing else it could
  // do -- but it says it could not reach the old one, and offers another go.
  if (error) return NextResponse.json({ conversation: null, failed: true });

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

/**
 * Who is asking, given a second chance to say.
 *
 * The token is asked about once and then, if that came back with nobody, once
 * more with a refresh in between. Not paranoia: the access token expires while
 * the app is closed, so the first request of the morning arrives holding a stale
 * one, and a trip screen fires a dozen requests at once -- every prefetch, every
 * panel -- which race to spend the same rotating refresh token. One of them
 * wins and the losers are told there is no session, which is how pressing Ask
 * Aly on a trip you were talking to her about yesterday opened an empty box.
 *
 * The refresh is the same one the client library does on its own schedule, so
 * this only ever brings that forward. Middleware cannot do it for us: it lets a
 * held-but-unconfirmed session through on purpose, leaving each route to judge.
 */
async function whoIsAsking(supabase) {
  const first = await supabase.auth.getUser();
  if (first.data?.user) return first.data.user;
  const refreshed = await supabase.auth.refreshSession().catch(() => null);
  if (refreshed?.data?.user) return refreshed.data.user;
  const second = await supabase.auth.getUser();
  return second.data?.user || null;
}
