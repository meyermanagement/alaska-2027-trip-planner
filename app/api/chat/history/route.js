import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TRANSCRIPT_MESSAGES, loadThread } from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

// The transcript for one thread: a trip, or the all-trips view when tripId is
// absent. Private per person — RLS on chat_messages does the enforcing.
export async function GET(request) {
  const { supabase, user, error } = await session();
  if (error) return error;

  const tripId = tripFrom(request);
  const { messages, error: loadError } = await loadThread(
    supabase,
    user.id,
    tripId,
    TRANSCRIPT_MESSAGES,
  );
  if (loadError) {
    return NextResponse.json(
      { error: "Could not load the conversation." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    messages: messages.map((m) => ({
      role: m.role,
      text: m.body,
      kind: m.kind || undefined,
    })),
  });
}

// There is deliberately no way to delete a thread: the family always wants Aly
// to keep the context of what was already said.
function tripFrom(request) {
  const value = new URL(request.url).searchParams.get("tripId");
  return value && value !== "null" ? value : null;
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
