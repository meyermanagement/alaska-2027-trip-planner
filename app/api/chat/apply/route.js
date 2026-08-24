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

  const tripId = payload?.tripId || null;
  const incoming = Array.isArray(payload?.actions) ? payload.actions : [];
  if (incoming.length === 0) {
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

  // The family this user writes into. RLS enforces it too; we need the id.
  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) {
    return NextResponse.json({ error: "No family group found." }, { status: 403 });
  }

  if (tripId) {
    const { data: trip } = await supabase
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .maybeSingle();
    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }
  }

  // Re-derive which ids the user may touch. The client is never trusted.
  const [itin, pack, task, travelers, trips] = await Promise.all([
    tripId
      ? supabase.from("itinerary_items").select("id, title").eq("trip_id", tripId)
      : { data: [] },
    tripId
      ? supabase.from("packing_items").select("id, item").eq("trip_id", tripId)
      : { data: [] },
    tripId
      ? supabase
          .from("predeparture_tasks")
          .select("id, title")
          .eq("trip_id", tripId)
      : { data: [] },
    supabase.from("travelers").select("name").order("sort_order"),
    tripId ? { data: [] } : supabase.from("trips").select("id, name"),
  ]);

  const known = {
    itinerary_items: new Map((itin.data || []).map((r) => [r.id, r.title])),
    packing_items: new Map((pack.data || []).map((r) => [r.id, r.item])),
    predeparture_tasks: new Map((task.data || []).map((r) => [r.id, r.title])),
    trip_notes: new Map(),
    trips: new Map((trips.data || []).map((r) => [r.id, r.name])),
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
  // Trips created in this batch, so the client can navigate to a new one.
  let createdSlug = null;

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

    // A trip id in the request scopes every write to that trip, so trip-level
    // tools are only valid from the general assistant, and vice versa.
    if (table === "trips" && tripId) {
      results.push({
        ok: false,
        summary: action.summary,
        error: "Trips can only be created or removed from the trips list.",
      });
      continue;
    }
    if (table !== "trips" && !tripId) {
      results.push({
        ok: false,
        summary: action.summary,
        error: "Open the trip first and I can change what's inside it.",
      });
      continue;
    }

    try {
      if (table === "trips") {
        const outcome = await writeTrip({
          supabase,
          tool,
          id,
          patch,
          familyId,
        });
        dbError = outcome.error;
        if (outcome.slug) createdSlug = outcome.slug;
      } else if (tool.startsWith("delete_")) {
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
  return NextResponse.json({ applied, results, createdSlug });
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// Create, rename or delete a whole trip. Deleting cascades to the itinerary,
// packing list, tasks and notes at the database level.
async function writeTrip({ supabase, tool, id, patch, familyId }) {
  if (tool === "delete_trip") {
    const { error } = await supabase.from("trips").delete().eq("id", id);
    return { error };
  }

  if (tool === "update_trip") {
    const row = { ...patch };
    if (row.name) row.slug = await freeSlug(supabase, slugify(row.name), id);
    const { error } = await supabase.from("trips").update(row).eq("id", id);
    return { error };
  }

  // create_trip
  const row = { ...patch };
  const copyBase = row.copy_base_packing !== false;
  delete row.copy_base_packing;

  row.family_id = familyId;
  row.slug = await freeSlug(supabase, slugify(row.name) || "trip", null);

  const { data: trip, error } = await supabase
    .from("trips")
    .insert(row)
    .select("id, slug")
    .single();
  if (error) return { error };

  if (copyBase) {
    // Best effort: a missing template should not fail the trip creation.
    const { data: tpl } = await supabase
      .from("packing_templates")
      .select("id")
      .eq("family_id", familyId)
      .eq("is_base", true)
      .maybeSingle();
    if (tpl) {
      const { data: items } = await supabase
        .from("packing_template_items")
        .select("category, item, assignee, quantity, sort_order")
        .eq("template_id", tpl.id);
      if (items?.length) {
        await supabase
          .from("packing_items")
          .insert(items.map((i) => ({ ...i, trip_id: trip.id })));
      }
    }
  }

  return { error: null, slug: trip.slug };
}

// Slugs are how trips are addressed in the URL, so keep them unique.
async function freeSlug(supabase, base, excludeId) {
  const { data } = await supabase.from("trips").select("id, slug");
  const taken = new Set(
    (data || []).filter((t) => t.id !== excludeId).map((t) => t.slug)
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 50; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
