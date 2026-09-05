import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { homeToday } from "@/lib/format";
import { CLOSED } from "@/lib/packing/propagateRun";
import { houseTasksFor, pushHouseTasks } from "@/lib/tasks/house";

export const runtime = "nodejs";
export const maxDuration = 60;

// Putting the household list onto trips that already exist.
//
// New trips get it during creation, but Alaska, Curaçao, Disney and the horse
// show were all built before this list existed, and a feature that only works on
// trips you have not planned yet is a feature the family never sees. So the same
// two-step the template push uses: a plain POST says what it would do, and
// apply: true does it.
export async function POST(request) {
  let body = {};
  try {
    body = (await request.json()) || {};
  } catch {
    body = {};
  }
  const apply = body?.apply === true;
  const onlyTrip = body?.trip_id ? String(body.trip_id) : null;

  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }
  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) {
    return NextResponse.json({ error: "No family found." }, { status: 400 });
  }

  const [{ data: tasks }, { data: people }] = await Promise.all([
    supabase
      .from("house_tasks")
      .select("id, title, detail, timing, assignee, only_when_empty, sort_order")
      .eq("family_id", familyId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("travelers")
      .select("name, is_person")
      .eq("family_id", familyId),
  ]);
  if (!tasks?.length) {
    return NextResponse.json({ trips: [], totals: { trips: 0, adds: 0 } });
  }
  const household = (people || [])
    .filter((p) => p.is_person)
    .map((p) => p.name);

  // Trips that have not ended, are not drafts, and are not called off. The same
  // window the template push uses, so a trip that stops being pushable stops
  // being pushable for both at once.
  const today = homeToday();
  let query = supabase
    .from("trips")
    .select(
      "id, name, status, start_date, end_date, trip_travelers (travelers (name, is_person))",
    )
    .eq("family_id", familyId)
    .neq("status", "draft")
    .order("start_date", { ascending: true });
  if (onlyTrip) query = query.eq("id", onlyTrip);
  else {
    query = query.or(
      `end_date.gte.${today},and(end_date.is.null,start_date.gte.${today})`,
    );
  }
  const { data: trips } = await query;
  const open = (trips || []).filter(
    (t) => !CLOSED.includes(String(t.status || "").toLowerCase()),
  );
  if (!open.length) {
    return NextResponse.json({ trips: [], totals: { trips: 0, adds: 0 } });
  }

  const tripIds = open.map((t) => t.id);
  const { data: already } = await supabase
    .from("predeparture_tasks")
    .select("trip_id, title, house_task_id")
    .in("trip_id", tripIds);
  const byTrip = new Map();
  for (const row of already || []) {
    if (!byTrip.has(row.trip_id)) byTrip.set(row.trip_id, []);
    byTrip.get(row.trip_id).push(row);
  }

  const plan = [];
  for (const trip of open) {
    const going = (trip.trip_travelers || [])
      .map((r) => r.travelers)
      .filter((t) => t?.is_person)
      .map((t) => t.name);
    const { apply: applies, skipped, staying } = houseTasksFor({
      tasks,
      going,
      household,
    });
    const have = byTrip.get(trip.id) || [];
    const haveId = new Set(have.map((r) => r.house_task_id).filter(Boolean));
    const haveTitle = new Set(
      have.map((r) => String(r.title || "").trim().toLowerCase()),
    );
    const fresh = applies.filter(
      (t) =>
        !haveId.has(t.id) &&
        !haveTitle.has(String(t.title || "").trim().toLowerCase()),
    );
    plan.push({
      id: trip.id,
      name: trip.name,
      adds: fresh.map((t) => t.title),
      already: applies.length - fresh.length,
      skipped: skipped.map((t) => t.title),
      staying,
    });
  }

  if (!apply) {
    return NextResponse.json({
      trips: plan,
      totals: {
        trips: plan.filter((p) => p.adds.length).length,
        adds: plan.reduce((n, p) => n + p.adds.length, 0),
      },
    });
  }

  let added = 0;
  const errors = [];
  for (const trip of open) {
    const going = (trip.trip_travelers || [])
      .map((r) => r.travelers)
      .filter((t) => t?.is_person)
      .map((t) => t.name);
    const result = await pushHouseTasks({
      supabase,
      familyId,
      trip,
      going,
      household,
      userId: user.id,
    });
    if (result.error) errors.push(`${trip.name}: ${result.error}`);
    added += result.added || 0;
  }
  return NextResponse.json({
    trips: plan,
    applied: { adds: added, errors },
    totals: {
      trips: plan.filter((p) => p.adds.length).length,
      adds: plan.reduce((n, p) => n + p.adds.length, 0),
    },
  });
}
