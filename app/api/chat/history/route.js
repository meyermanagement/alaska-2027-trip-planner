import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TRANSCRIPT_MESSAGES, loadThread } from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

// The transcript of one conversation. Private per person — RLS on chat_messages
// does the enforcing, so an id belonging to someone else simply reads as empty.
export async function GET(request) {
  const { supabase, error } = await session();
  if (error) return error;

  const params = new URL(request.url).searchParams;
  const conversationId = clean(params.get("conversationId"));
  if (!conversationId) {
    return NextResponse.json({ messages: [], conversation: null });
  }

  const { data: conversation } = await supabase
    .from("chat_conversations")
    .select("id, title, trip_id, focus, created_at, updated_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.id) {
    return NextResponse.json(
      { error: "That conversation is no longer there." },
      { status: 404 },
    );
  }

  const { messages, error: loadError } = await loadThread(
    supabase,
    conversationId,
    TRANSCRIPT_MESSAGES,
  );
  if (loadError) {
    return NextResponse.json(
      { error: "Could not load the conversation." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      tripId: conversation.trip_id,
      focus: conversation.focus,
    },
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.body,
      kind: m.kind || undefined,
      sources:
        Array.isArray(m.sources) && m.sources.length ? m.sources : undefined,
      places: Array.isArray(m.places) && m.places.length ? m.places : undefined,
      followups:
        Array.isArray(m.followups) && m.followups.length
          ? m.followups
          : undefined,
    })),
  });
}

// There is deliberately no way to delete a conversation: the family always wants
// Aly to keep the context of what was already said.
function clean(value) {
  return value && value !== "null" && value !== "undefined" ? value : null;
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
