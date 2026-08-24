import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generate, GeminiError } from "@/lib/agent/gemini";
import {
  buildTripContext,
  buildSystemPrompt,
  buildGlobalContext,
  buildGlobalSystemPrompt,
  FOCUS_LABELS,
} from "@/lib/agent/context";
import {
  TOOL_DECLARATIONS,
  TRIP_TOOL_DECLARATIONS,
  validateAction,
} from "@/lib/agent/tools";

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

  // No trip id means the assistant was opened from the trips list, so it works
  // across every trip and only gets the trip-level tools.
  let ctx;
  let system;
  let tools;

  if (!tripId) {
    const [trips, itinerary, packing, tasks, notes, travelers] =
      await Promise.all([
        supabase
          .from("trips")
          .select(
            "id, name, slug, destination, start_date, end_date, status, summary"
          )
          .order("start_date", { ascending: true }),
        supabase.from("itinerary_items").select("trip_id"),
        supabase.from("packing_items").select("trip_id, is_packed"),
        supabase.from("predeparture_tasks").select("trip_id, is_done"),
        supabase.from("trip_notes").select("trip_id"),
        supabase.from("travelers").select("name").order("sort_order"),
      ]);

    ctx = buildGlobalContext({
      trips: trips.data || [],
      itinerary: itinerary.data || [],
      packing: packing.data || [],
      tasks: tasks.data || [],
      notes: notes.data || [],
      travelers: travelers.data || [],
      userName,
    });
    system = buildGlobalSystemPrompt(ctx.text);
    tools = TRIP_TOOL_DECLARATIONS;
  } else {
    ctx = await tripScope(supabase, tripId, userName);
    if (!ctx) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }
    system = buildSystemPrompt(ctx.text, focus);
    tools = TOOL_DECLARATIONS;
  }

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
      known: ctx.known,
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

// Everything the model needs to reason about one trip.
async function tripScope(supabase, tripId, userName) {
  // RLS restricts trips to the user's family, so a hit here proves access.
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return null;

  const [itinerary, packing, tasks, notes, travelers] = await Promise.all(
    [
      supabase
        .from("itinerary_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("item_date", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("packing_items")
        .select("*")
        .eq("trip_id", tripId)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true }),
      supabase
        .from("predeparture_tasks")
        .select("*")
        .eq("trip_id", tripId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("trip_notes")
        .select("*")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: false }),
      supabase.from("travelers").select("name").order("sort_order"),
    ]
  );

  return buildTripContext({
    trip,
    itinerary: itinerary.data || [],
    packing: packing.data || [],
    tasks: tasks.data || [],
    notes: notes.data || [],
    travelers: travelers.data || [],
    userName,
  });
}
