import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureConversation, listConversations } from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

// The list you land on when you open Aly: every conversation you have had with
// her, newest first, so you can pick one up rather than scrolling back through
// one endless transcript. Private per person — RLS does the enforcing.
export async function GET() {
  const { supabase, user, error } = await session();
  if (error) return error;

  const { conversations, error: listError } = await listConversations(supabase);
  if (listError) {
    return NextResponse.json(
      { error: "Could not load your conversations." },
      { status: 500 },
    );
  }
  // Who is asking, so the list can say "Steph" on the ones that are hers and
  // keep the delete button off them.
  return NextResponse.json({ conversations, me: user.id });
}

// Starting a fresh one. Nothing has been said yet, so it has no title until the
// first message arrives; a trigger names it after that message.
export async function POST(request) {
  const { supabase, user, error } = await session();
  if (error) return error;

  const payload = await request.json().catch(() => ({}));
  const tripId =
    typeof payload?.tripId === "string" && payload.tripId
      ? payload.tripId
      : null;
  const focus = typeof payload?.focus === "string" ? payload.focus : null;

  // A trip id from the client is only trusted as far as the person's own rows:
  // if it is not one of their trips, the conversation is simply not tied to one.
  let ownTripId = null;
  if (tripId) {
    const { data } = await supabase
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .maybeSingle();
    ownTripId = data?.id || null;
  }

  // Deliberately a new one, not the trip's existing thread: this endpoint is
  // only reached by asking for a fresh conversation, and Aly opening on the last
  // one is handled before the panel is drawn.
  const { id, error: makeError } = await ensureConversation(supabase, user.id, {
    tripId: ownTripId,
    focus,
    resume: false,
  });
  if (makeError || !id) {
    return NextResponse.json(
      { error: "Could not start a new conversation." },
      { status: 500 },
    );
  }
  return NextResponse.json({ conversationId: id, tripId: ownTripId });
}

// Who can read it.
//
// Conversations with Aly start shared: the parents plan the same trips, and a
// thread where one of them worked out the Curacao ferry is worth more on both
// screens than on one. Sharing reaches the other PRIMARY people in the family
// and nobody else -- Veda cannot read her parents' conversations and they
// cannot read hers -- and the owner can pull any single conversation back to
// themselves here. RLS scopes the update to rows they can see; the owner check
// below is what keeps somebody from re-sharing a thread that is not theirs.
export async function PATCH(request) {
  const { supabase, user, error } = await session();
  if (error) return error;

  const payload = await request.json().catch(() => ({}));
  const id = typeof payload?.id === "string" ? payload.id : null;
  const visibility =
    payload?.visibility === "private" || payload?.visibility === "family"
      ? payload.visibility
      : null;
  if (!id || !visibility) {
    return NextResponse.json(
      { error: "Which conversation, and shared with whom?" },
      { status: 400 },
    );
  }

  const { data, error: updateError } = await supabase
    .from("chat_conversations")
    .update({ visibility })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, visibility");

  if (updateError) {
    return NextResponse.json(
      { error: "Could not change who can see that." },
      { status: 500 },
    );
  }
  if (!data?.length) {
    return NextResponse.json(
      { error: "That one is not yours to share." },
      { status: 404 },
    );
  }
  return NextResponse.json({ id, visibility });
}

// Throwing one away. The messages go with it: chat_messages cascades from the
// conversation, so this one delete takes the whole transcript. RLS scopes the
// row to the person asking, which is what stops this reaching anyone else's
// conversation even if an id is guessed — so a miss means "not yours or not
// there", and either way the honest answer is that it was not found.
export async function DELETE(request) {
  const { supabase, error } = await session();
  if (error) return error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Which conversation?" }, { status: 400 });
  }

  const { data, error: deleteError } = await supabase
    .from("chat_conversations")
    .delete()
    .eq("id", id)
    .select("id");

  if (deleteError) {
    return NextResponse.json(
      { error: "Could not delete that conversation." },
      { status: 500 },
    );
  }
  if (!data?.length) {
    return NextResponse.json(
      { error: "That conversation is already gone." },
      { status: 404 },
    );
  }
  return NextResponse.json({ deletedId: id });
}

async function session() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { error: "Please sign in again." },
        { status: 401 },
      ),
    };
  }
  return { supabase, user, error: null };
}
