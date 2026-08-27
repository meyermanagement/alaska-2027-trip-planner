// Making a task out of a tip.
//
// A tip and a task are different promises. A tip is worth knowing and then goes
// quiet, whichever button you press. A task is the app agreeing to chase you: it
// turns up in the morning email, it stays there, and it only stops when somebody
// ticks it off. So the moment a tip is something you have decided to do rather
// than something you have merely read, it wants to be the other kind of thing.
//
// Turning one over clears the tip, because leaving both behind would mean the same
// sentence in two places, one of which nags and one of which does not. The tip is
// not deleted though - it stays in the log with its fingerprint, so the next look
// does not offer it again.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { taskFromTip } from "@/lib/tips/task";

export const runtime = "nodejs";

export async function POST(request, { params }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  // Read the tip rather than trusting a title from the browser: a route that
  // accepts a task body from the client is a route that will eventually write
  // somebody else's words into this family's checklist.
  const { data: tip } = await supabase
    .from("pro_tips")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!tip) {
    return NextResponse.json({ error: "That tip is gone." }, { status: 404 });
  }
  if (!tip.trip_id) {
    return NextResponse.json(
      { error: "That tip is not attached to a trip, so it cannot be a task." },
      { status: 400 },
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const row = taskFromTip(tip, { today });
  if (!row) {
    return NextResponse.json(
      { error: "There is nothing in that tip to do." },
      { status: 400 },
    );
  }

  const { data: task, error } = await supabase
    .from("predeparture_tasks")
    .insert(row)
    .select("id, title, due_date, timing")
    .maybeSingle();

  if (error || !task) {
    return NextResponse.json(
      { error: "Could not add that to the checklist." },
      { status: 500 },
    );
  }

  // The tip has done its job, so it is cleared: it stays in the cleared list, which
  // is exactly what ignoring it would tell the next look it was not.
  await supabase
    .from("pro_tips")
    .update({
      status: "cleared",
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({ task });
}
