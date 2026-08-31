import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appendMessage } from "@/lib/agent/thread";

export const runtime = "nodejs";

/**
 * A line the screen wrote into a conversation on Aly's behalf.
 *
 * Aly's own look-up runs from the panel rather than from the route -- one
 * grounded question uses most of a route's sixty seconds and walking a trip
 * takes five of them -- so the sentence that says what it found ("Three things
 * worth knowing, now on the screen") was written by the browser and only ever
 * existed there. It appeared under her answer some seconds later, which is
 * exactly the shape of "one question, two responses", and it was gone the next
 * time the conversation was opened. Whatever anybody reads in a transcript
 * should still be there tomorrow, so it is written down.
 *
 * Deliberately narrow: a receipt on a conversation the person already owns.
 * Nothing here can invent a conversation, choose a role, or attach cards.
 */
export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const conversationId = id(payload?.conversationId);
  const body = String(payload?.body || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
  if (!conversationId || !body) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Theirs, and still there. RLS would refuse the write anyway; checking first
  // turns a silent no-op into an answer the screen can act on.
  const { data: conversation } = await supabase
    .from("chat_conversations")
    .select("id, trip_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation?.id) {
    return NextResponse.json(
      { error: "That conversation is no longer there." },
      { status: 404 },
    );
  }

  const { error } = await appendMessage(supabase, {
    userId: user.id,
    conversationId: conversation.id,
    tripId: conversation.trip_id || null,
    role: "assistant",
    kind: "receipt",
    body,
    askId: id(payload?.askId),
  });
  if (error) {
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

function id(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
    ? value
    : null;
}
