import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generate, GeminiError } from "@/lib/agent/gemini";
import {
  buildContext,
  buildSystemPrompt,
  FOCUS_LABELS,
} from "@/lib/agent/context";
import { allTools, validateAction } from "@/lib/agent/tools";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TURNS = 12;

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = payload?.tripId;
  // Which section of the trip the user was looking at. Whitelisted so it can
  // only ever be one of our known tabs.
  const focus = FOCUS_LABELS[payload?.focus] ? payload.focus : null;
  const history = Array.isArray(payload?.messages) ? payload.messages : [];
  if (history.length === 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
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
  const system = buildSystemPrompt(ctx.text, focus, ctx.focusTripName);
  const tools = allTools();

  const contents = history
    .slice(-MAX_TURNS)
    .filter((m) => typeof m?.text === "string" && m.text.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.text).slice(0, 4000) }],
    }));

  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  let result;
  try {
    result = await generate({ system, contents, tools });
  } catch (err) {
    const status = err instanceof GeminiError ? err.status : 502;
    return NextResponse.json(
      { error: err.message || "The assistant is unavailable right now." },
      { status: status === 403 ? 500 : status }
    );
  }

  const actions = [];
  const problems = [];
  for (const call of result.calls) {
    const { action, error } = validateAction(call, {
      travelerNames: ctx.travelerNames,
      travelerIds: ctx.travelerIds,
      known: ctx.known,
      focusTripId: ctx.focusTripId,
    });
    if (action) actions.push(action);
    else if (error) problems.push(error);
  }

  let reply = result.text;
  if (!reply && actions.length === 0) {
    reply = problems.length
      ? problems.join(" ")
      : "I am not sure how to help with that yet.";
  }

  return NextResponse.json({ reply, actions, problems });
}

// Everything the family has, in one snapshot. RLS keeps it to their own rows.
async function loadEverything(supabase, userName, focusTripId) {
  const [trips, itinerary, packing, tasks, notes, travelers, rosters, preferences] =
    await Promise.all([
      supabase
        .from("trips")
        .select("*")
        .order("start_date", { ascending: true }),
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
    userName,
  });
}
