import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { MAX_HOUSE_TASKS } from "@/lib/tasks/house";
import { TIMING_LABELS } from "@/lib/format";

export const runtime = "nodejs";

const TIMINGS = Object.keys(TIMING_LABELS);

async function household(supabase) {
  const user = await whoIs(supabase);
  if (!user) return { error: "Please sign in again.", status: 401 };
  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) return { error: "No family found.", status: 400 };
  return { user, familyId };
}

function clean(text, max) {
  const s = String(text ?? "").trim();
  if (!s) return null;
  return s.slice(0, max);
}

// The household's departure list. One route, four verbs, because every one of
// them is a single row and a panel that has to call four different URLs to edit a
// list of seven lines is four places for the two to fall out of step.
export async function GET() {
  const supabase = await createClient();
  const who = await household(supabase);
  if (who.error) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  const { data, error } = await supabase
    .from("house_tasks")
    .select("id, title, detail, timing, assignee, only_when_empty, sort_order")
    .eq("family_id", who.familyId)
    .order("sort_order", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ tasks: data || [] });
}

export async function POST(request) {
  const supabase = await createClient();
  const who = await household(supabase);
  if (who.error) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const title = clean(body.title, 200);
  if (!title) {
    return NextResponse.json({ error: "A task needs a name." }, { status: 400 });
  }

  const { count } = await supabase
    .from("house_tasks")
    .select("id", { count: "exact", head: true })
    .eq("family_id", who.familyId);
  if ((count || 0) >= MAX_HOUSE_TASKS) {
    return NextResponse.json(
      {
        error: `That list is at ${MAX_HOUSE_TASKS} tasks. Anything past that stops being read.`,
      },
      { status: 400 },
    );
  }

  const timing = TIMINGS.includes(body.timing) ? body.timing : "travel_day";
  const { data, error } = await supabase
    .from("house_tasks")
    .insert({
      family_id: who.familyId,
      title,
      detail: clean(body.detail, 600),
      timing,
      assignee: clean(body.assignee, 80) || "Shared",
      only_when_empty: body.only_when_empty === true,
      sort_order: count || 0,
      created_by: who.user.id,
      updated_by: who.user.id,
    })
    .select("id, title, detail, timing, assignee, only_when_empty, sort_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ task: data });
}

export async function PATCH(request) {
  const supabase = await createClient();
  const who = await household(supabase);
  if (who.error) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const id = clean(body.id, 60);
  if (!id) return NextResponse.json({ error: "Which task?" }, { status: 400 });

  const patch = { updated_at: new Date().toISOString(), updated_by: who.user.id };
  if (body.title !== undefined) {
    const title = clean(body.title, 200);
    if (!title) {
      return NextResponse.json(
        { error: "A task needs a name." },
        { status: 400 },
      );
    }
    patch.title = title;
  }
  if (body.detail !== undefined) patch.detail = clean(body.detail, 600);
  if (body.assignee !== undefined) {
    patch.assignee = clean(body.assignee, 80) || "Shared";
  }
  if (body.timing !== undefined && TIMINGS.includes(body.timing)) {
    patch.timing = body.timing;
  }
  if (body.only_when_empty !== undefined) {
    patch.only_when_empty = body.only_when_empty === true;
  }
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) {
    patch.sort_order = Number(body.sort_order);
  }

  const { data, error } = await supabase
    .from("house_tasks")
    .update(patch)
    .eq("id", id)
    .eq("family_id", who.familyId)
    .select("id, title, detail, timing, assignee, only_when_empty, sort_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ task: data });
}

// Removing a task from the household list leaves the copies already sitting on
// trips alone -- house_task_id is set null rather than cascading. Somebody
// halfway through a checklist should not watch a line vanish out of it because a
// different screen was tidied up.
export async function DELETE(request) {
  const supabase = await createClient();
  const who = await household(supabase);
  if (who.error) {
    return NextResponse.json({ error: who.error }, { status: who.status });
  }
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const id = clean(body.id, 60);
  if (!id) return NextResponse.json({ error: "Which task?" }, { status: 400 });
  const { error } = await supabase
    .from("house_tasks")
    .delete()
    .eq("id", id)
    .eq("family_id", who.familyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deleted: id });
}
