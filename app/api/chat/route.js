import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generate, GeminiError } from "@/lib/agent/gemini";
import {
  buildTripContext,
  buildSystemPrompt,
  FOCUS_LABELS,
} from "@/lib/agent/context";
import { TOOL_DECLARATIONS, validateAction } from "@/lib/agent/tools";

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
  if (!tripId || history.length === 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  // RLS restricts trips to the user's family, so a hit here proves access.
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  const [itinerary, packing, tasks, notes, travelers, profile] =
    await Promise.all([
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
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

  const ctx = buildTripContext({
    trip,
    itinerary: itinerary.data || [],
    packing: packing.data || [],
    tasks: tasks.data || [],
    notes: notes.data || [],
    travelers: travelers.data || [],
    userName: profile.data?.display_name,
  });

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
    result = await generate({
      system: buildSystemPrompt(ctx.text, focus),
      contents,
      tools: TOOL_DECLARATIONS,
    });
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

  return NextResponse.json({
    reply,
    actions,
    problems,
  });
}
