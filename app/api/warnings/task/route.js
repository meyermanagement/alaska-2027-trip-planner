// Making a task out of a passport warning.
//
// Warnings are not rows. They are worked out from the passports and the return
// dates every time a screen is drawn, precisely so that fixing the date makes the
// warning disappear on its own rather than leaving a stale copy behind. That
// leaves nothing for the browser to point at, so this route takes only a trip id
// and works the warnings out again itself.
//
// Which is also the safe way round. The client cannot hand over a task to write:
// it can only name a trip, and if nothing is actually wrong with the passports on
// that trip, the answer is no.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadHeaderNotices } from "@/lib/tips/load";
import { taskFromWarning } from "@/lib/tips/task";

export const runtime = "nodejs";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const tripId = typeof body?.tripId === "string" ? body.tripId : "";
  if (!tripId) {
    return NextResponse.json({ error: "Which trip?" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const { warnings } = await loadHeaderNotices(supabase, today);
  const warning = (warnings || []).find((row) => row.tripId === tripId);
  if (!warning) {
    // Either it was never true or it has just been fixed. Both deserve the same
    // cheerful answer rather than an error.
    return NextResponse.json({
      task: null,
      note: "Nothing is wrong with the passports for that trip.",
    });
  }

  const row = taskFromWarning(warning);
  if (!row) {
    return NextResponse.json({ task: null, note: "Nothing to do." });
  }

  // Twice on the same warning would mean two identical tasks nagging every
  // morning, so an open one that already says this counts as done.
  const { data: already } = await supabase
    .from("predeparture_tasks")
    .select("id, title")
    .eq("trip_id", tripId)
    .eq("is_done", false)
    .eq("title", row.title)
    .maybeSingle();
  if (already) {
    return NextResponse.json({
      task: already,
      note: "That is already on the checklist.",
    });
  }

  const { data: task, error } = await supabase
    .from("predeparture_tasks")
    .insert(row)
    .select("id, title, timing")
    .maybeSingle();

  if (error || !task) {
    return NextResponse.json(
      { error: "Could not add that to the checklist." },
      { status: 500 },
    );
  }

  return NextResponse.json({ task });
}
