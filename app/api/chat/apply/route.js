import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateAction } from "@/lib/agent/tools";

export const runtime = "nodejs";

const MAX_ACTIONS = 25;

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = payload?.tripId;
  const incoming = Array.isArray(payload?.actions) ? payload.actions : [];
  if (!tripId || incoming.length === 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (incoming.length > MAX_ACTIONS) {
    return NextResponse.json({ error: "Too many changes at once." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  }

  const { data: trip } = await supabase
    .from("trips")
    .select("id")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) {
    return NextResponse.json({ error: "Trip not found." }, { status: 404 });
  }

  // Re-derive which ids belong to this trip. The client is never trusted.
  const [itin, pack, task, travelers] = await Promise.all([
    supabase.from("itinerary_items").select("id, title").eq("trip_id", tripId),
    supabase.from("packing_items").select("id, item").eq("trip_id", tripId),
    supabase.from("predeparture_tasks").select("id, title").eq("trip_id", tripId),
    supabase.from("travelers").select("name").order("sort_order"),
  ]);

  const known = {
    itinerary_items: new Map((itin.data || []).map((r) => [r.id, r.title])),
    packing_items: new Map((pack.data || []).map((r) => [r.id, r.item])),
    predeparture_tasks: new Map((task.data || []).map((r) => [r.id, r.title])),
    trip_notes: new Map(),
  };
  const travelerNames = Array.from(
    new Set([...(travelers.data || []).map((t) => t.name), "Shared"])
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const results = [];

  for (const raw of incoming) {
    // Revalidate from scratch rather than trusting the client's patch.
    const { action, error } = validateAction(
      { name: raw?.tool, args: { ...(raw?.patch || {}), id: raw?.id } },
      { travelerNames, known }
    );

    if (!action) {
      results.push({ ok: false, summary: raw?.summary || "Change", error });
      continue;
    }

    const { tool, table, id, patch = {} } = action;
    let dbError = null;

    try {
      if (tool.startsWith("delete_")) {
        const { error: e } = await supabase
          .from(table)
          .delete()
          .eq("id", id)
          .eq("trip_id", tripId);
        dbError = e;
      } else if (tool.startsWith("update_")) {
        const row = { ...patch };
        if (table === "packing_items" && row.is_packed !== undefined) {
          row.packed_by = row.is_packed ? user.id : null;
          row.packed_at = row.is_packed ? new Date().toISOString() : null;
        }
        if (table === "predeparture_tasks" && row.is_done !== undefined) {
          row.done_by = row.is_done ? user.id : null;
          row.done_at = row.is_done ? new Date().toISOString() : null;
        }
        const { error: e } = await supabase
          .from(table)
          .update(row)
          .eq("id", id)
          .eq("trip_id", tripId);
        dbError = e;
      } else {
        const row = { ...patch, trip_id: tripId };
        if (table === "trip_notes") {
          row.author_id = user.id;
          row.author_name = profile?.display_name || null;
        }
        const { error: e } = await supabase.from(table).insert(row);
        dbError = e;
      }
    } catch (err) {
      dbError = { message: err?.message || "Unexpected error." };
    }

    results.push(
      dbError
        ? { ok: false, summary: action.summary, error: dbError.message }
        : { ok: true, summary: action.summary }
    );
  }

  const applied = results.filter((r) => r.ok).length;
  return NextResponse.json({ applied, results });
}
