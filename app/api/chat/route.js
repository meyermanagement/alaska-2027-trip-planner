import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generate, ModelError } from "@/lib/agent/llm";
import {
  buildContext,
  buildSystemPrompt,
  isKnownFocus,
  NEW_TRIP_FOCUS,
} from "@/lib/agent/context";
import { allTools, validateAction, pendingTripNames } from "@/lib/agent/tools";
import {
  CONTEXT_MESSAGES,
  appendMessage,
  ensureConversation,
  listConversations,
  loadThread,
  recallOtherConversations,
  toModelMessages,
} from "@/lib/agent/thread";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = payload?.tripId;
  // Which section of the trip the user was looking at, or "new_trip" when they
  // came from "Create with Aly". Whitelisted so it can only ever be one of ours.
  const focus = isKnownFocus(payload?.focus) ? payload.focus : null;
  // The client sends only what was just typed. The conversation itself lives in
  // chat_messages, so it survives a reload, a different device, and a change of
  // model provider.
  const said =
    typeof payload?.message === "string" ? payload.message.trim() : "";
  if (!said) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

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

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const userName = profileRow?.display_name;

  // Aly always sees the whole app. A trip id only says which trip is open, so
  // it becomes the default target for anything the user does not pin elsewhere.
  const snapshot = await loadEverything(supabase, userName, tripId || null);
  if (tripId && !snapshot.focusTripId) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }
  const ctx = snapshot;
  const threadTripId = snapshot.focusTripId || null;

  // Which conversation this belongs to. The client sends one it picked from the
  // list, or nothing at all, in which case a new one starts here and its id goes
  // back with the reply.
  const { id: conversationId } = await ensureConversation(supabase, user.id, {
    conversationId:
      typeof payload?.conversationId === "string"
        ? payload.conversationId
        : null,
    tripId: threadTripId,
    focus,
  });
  if (!conversationId) {
    return NextResponse.json(
      { error: "Could not open that conversation." },
      { status: 500 },
    );
  }

  const { messages: past } = await loadThread(
    supabase,
    conversationId,
    CONTEXT_MESSAGES,
  );

  // Conversations are separate, but not sealed off from each other: Aly is told
  // what the others were about, and the words of this question are used to pull
  // the closest lines out of them. Best effort — a failure here only costs her
  // the cross-reference, so it must never cost the answer.
  let extras = {};
  try {
    const [{ conversations }, { hits }] = await Promise.all([
      listConversations(supabase, 20),
      recallOtherConversations(supabase, {
        message: said,
        exclude: conversationId,
      }),
    ]);
    extras = {
      others: (conversations || []).filter((c) => c.id !== conversationId),
      recall: hits || [],
    };
  } catch {
    extras = {};
  }

  const system = buildSystemPrompt(ctx.text, focus, ctx.focusTripName, extras);
  const tools = allTools();

  const messages = [...toModelMessages(past), { role: "user", text: said }];

  // Store the question before answering it, so a failed or timed-out reply still
  // leaves the transcript honest about what was asked.
  await appendMessage(supabase, {
    userId: user.id,
    conversationId,
    tripId: threadTripId,
    role: "user",
    body: said,
  });

  let result;
  try {
    result = await generate({ system, messages, tools });
  } catch (err) {
    const status = err instanceof ModelError ? err.status : 502;
    return NextResponse.json(
      { error: err.message || "The assistant is unavailable right now." },
      { status: status === 403 ? 500 : status },
    );
  }

  const actions = [];
  const problems = [];
  // A trip being created in this same turn has no id yet, so the itinerary and
  // packing rows that came with it are filed against its name instead.
  const pendingTrips = pendingTripNames(result.calls);
  for (const call of result.calls) {
    const { action, error } = validateAction(call, {
      travelerNames: ctx.travelerNames,
      travelerIds: ctx.travelerIds,
      known: ctx.known,
      focusTripId: ctx.focusTripId,
      pendingTrips,
      newTripDraft: focus === NEW_TRIP_FOCUS,
    });
    if (action) actions.push(action);
    else if (error) problems.push(error);
  }

  let reply = result.text;
  if (!reply && actions.length === 0) {
    reply = problems.length
      ? Array.from(new Set(problems)).join(" ")
      : "I am not sure how to help with that yet.";
  }

  // What Aly proposed matters as much as what she said, so the transcript keeps
  // the proposal alongside the reply.
  const record = actions.length
    ? [reply, `(Proposed: ${actions.map((a) => a.summary).join("; ")})`]
        .filter(Boolean)
        .join("\n\n")
    : reply;
  if (record) {
    await appendMessage(supabase, {
      userId: user.id,
      conversationId,
      tripId: threadTripId,
      role: "assistant",
      body: record,
    });
  }

  return NextResponse.json({ reply, actions, problems, conversationId });
}

// Everything the family has, in one snapshot. RLS keeps it to their own rows.
async function loadEverything(supabase, userName, focusTripId) {
  const [
    trips,
    itinerary,
    packing,
    tasks,
    notes,
    travelers,
    rosters,
    preferences,
    rewards,
    templates,
    templateItems,
  ] = await Promise.all([
    supabase.from("trips").select("*").order("start_date", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select("*")
      .order("item_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_items")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_notes")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("travelers").select("id, name").order("sort_order"),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
    supabase
      .from("travel_preferences")
      .select("id, topic, body, traveler_id")
      .order("topic", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewards_programs")
      .select("*")
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_templates")
      .select("id, name, description, is_base")
      .order("is_base", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("packing_template_items")
      .select("id, template_id, category, item, assignee, quantity")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  return buildContext({
    trips: trips.data || [],
    focusTripId,
    itinerary: itinerary.data || [],
    packing: packing.data || [],
    tasks: tasks.data || [],
    notes: notes.data || [],
    travelers: travelers.data || [],
    rosters: rosters.data || [],
    preferences: preferences.data || [],
    rewards: rewards.data || [],
    templates: templates.data || [],
    templateItems: templateItems.data || [],
    userName,
  });
}
