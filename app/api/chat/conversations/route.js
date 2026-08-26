import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureConversation, listConversations } from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

// The list you land on when you open Aly: every conversation you have had with
// her, newest first, so you can pick one up rather than scrolling back through
// one endless transcript. Private per person — RLS does the enforcing.
export async function GET() {
  const { supabase, error } = await session();
  if (error) return error;

  const { conversations, error: listError } = await listConversations(supabase);
  if (listError) {
    return NextResponse.json(
      { error: "Could not load your conversations." },
      { status: 500 },
    );
  }
  return NextResponse.json({ conversations });
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

  const { id, error: makeError } = await ensureConversation(supabase, user.id, {
    tripId: ownTripId,
    focus,
  });
  if (makeError || !id) {
    return NextResponse.json(
      { error: "Could not start a new conversation." },
      { status: 500 },
    );
  }
  return NextResponse.json({ conversationId: id, tripId: ownTripId });
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
