import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  validateAction,
  pendingTripNames,
  FAMILY_TABLES,
  REVIEW_TOOLS,
} from "@/lib/agent/tools";
import { appendMessage, ensureConversation } from "@/lib/agent/thread";
import { WIPE_TOOLS } from "@/lib/agent/groups";
import { copiedTemplateItems } from "@/lib/packing/copy";

export const runtime = "nodejs";
// Writing eighty rows one at a time can outlast the default budget, and a
// timeout here reads to the family as a network error.
export const maxDuration = 60;

// High enough that a whole pasted itinerary or a full family packing list goes
// in one card, low enough that a runaway model cannot rewrite the trip.
const MAX_ACTIONS = 80;

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
    return NextResponse.json(
      {
        error: `That is ${incoming.length} changes at once, and ${MAX_ACTIONS} is the limit. Send it in a couple of smaller pieces.`,
      },
      { status: 400 },
    );
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

  // The family this user writes into. RLS enforces it too; we need the id.
  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) {
    return NextResponse.json(
      { error: "No family group found." },
      { status: 403 },
    );
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

  // Re-derive which ids the user may touch, across every trip the family has.
  // The client is never trusted. RLS keeps all of this inside the family.
  const [
    itin,
    pack,
    task,
    notes,
    travelers,
    trips,
    prefs,
    templates,
    templateItems,
  ] = await Promise.all([
    supabase.from("itinerary_items").select("id, title, trip_id"),
    supabase.from("packing_items").select("id, item, trip_id"),
    supabase.from("predeparture_tasks").select("id, title, trip_id"),
    supabase.from("trip_notes").select("id, title, body, trip_id"),
    supabase.from("travelers").select("id, name").order("sort_order"),
    supabase.from("trips").select("id, name"),
    supabase.from("travel_preferences").select("id, body"),
    supabase.from("packing_templates").select("id, name, is_base"),
    supabase.from("packing_template_items").select("id, item, template_id"),
  ]);

  // Which trip each row sits in, so an edit lands on the right trip even when
  // the user is looking at a different one.
  const rowTrip = new Map();
  for (const rows of [itin.data, pack.data, task.data, notes.data]) {
    for (const r of rows || []) rowTrip.set(r.id, r.trip_id);
  }

  const known = {
    itinerary_items: new Map((itin.data || []).map((r) => [r.id, r.title])),
    packing_items: new Map((pack.data || []).map((r) => [r.id, r.item])),
    predeparture_tasks: new Map((task.data || []).map((r) => [r.id, r.title])),
    trip_notes: new Map(
      (notes.data || []).map((r) => [
        r.id,
        (r.title || r.body || "").slice(0, 60),
      ]),
    ),
    trips: new Map((trips.data || []).map((r) => [r.id, r.name])),
    travel_preferences: new Map(
      (prefs.data || []).map((r) => [r.id, (r.body || "").slice(0, 60)]),
    ),
    packing_templates: new Map(
      (templates.data || []).map((r) => [
        r.id,
        { name: r.name, is_base: Boolean(r.is_base) },
      ]),
    ),
    packing_template_items: new Map(
      (templateItems.data || []).map((r) => [
        r.id,
        { item: r.item, template_id: r.template_id },
      ]),
    ),
    rowTrip,
  };
  const travelerNames = Array.from(
    new Set([...(travelers.data || []).map((t) => t.name), "Shared"]),
  );
  const travelerIds = new Map(
    (travelers.data || [])
      .filter((t) => t.id && t.name)
      .map((t) => [t.name, t.id]),
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const results = [];
  // Trips created in this batch, so the client can navigate to a new one.
  let createdSlug = null;
  // A new trip whose packing list is currently just the family base template.
  // Generating a real one takes a model call, and making the family wait for it
  // behind the Apply button would be the wrong trade — so the trip is saved with
  // the template and the client asks for the better list straight afterwards.
  let packingTripId = null;

  // A trip has to exist before anything can go inside it, so new trips are
  // written first no matter what order they arrived in. Emptying a list comes
  // next, so a replacement list written in the same batch survives the wipe.
  // Everything else keeps the order the family approved it in.
  const rank = (a) =>
    a?.tool === "create_trip" || a?.tool === "create_template"
      ? 0
      : WIPE_TOOLS.has(a?.tool)
        ? 1
        : 2;
  const ordered = incoming
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
    .map(({ a }) => a);
  // Names of trips this batch is about to create, so their contents validate
  // against a trip that does not have an id yet.
  const pendingTrips = pendingTripNames(ordered);

  for (const raw of ordered) {
    // Revalidate from scratch rather than trusting the client's patch.
    const { action, error } = validateAction(
      { name: raw?.tool, args: { ...(raw?.patch || {}), id: raw?.id } },
      { travelerNames, travelerIds, known, focusTripId: tripId, pendingTrips },
    );

    if (!action) {
      results.push({ ok: false, summary: raw?.summary || "Change", error });
      continue;
    }

    // Its trip was approved in a different chunk that has not been applied yet.
    if (action.needsTrip) {
      results.push({
        ok: false,
        summary: action.summary,
        error: `Approve the new trip “${action.needsTrip}” first, then this will save into it.`,
      });
      continue;
    }

    const { tool, table, id, patch = {} } = action;
    let dbError = null;
    // Copying is worth counting out loud: "start a Disney list from this trip"
    // is a fair thing to ask and a terrible thing to guess at.
    let extra = "";

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
        // The trip now exists, so the rows that named it can resolve to its id.
        if (!outcome.error && tool === "create_trip" && outcome.id) {
          if (outcome.wantsPacking) packingTripId = outcome.id;
          known.trips.set(outcome.id, patch.name);
          const at = pendingTrips.indexOf(patch.name);
          if (at >= 0) pendingTrips.splice(at, 1);
        }
      } else if (tool === "create_template") {
        const outcome = await writeTemplate({ supabase, patch, familyId });
        dbError = outcome.error;
        if (outcome.id) {
          // Anything else in this batch that named the new list can now find it.
          known.packing_templates.set(outcome.id, {
            name: patch.name,
            is_base: false,
          });
        }
        if (!outcome.error) {
          extra = outcome.copied
            ? ` — ${outcome.copied} item${outcome.copied === 1 ? "" : "s"} copied`
            : " — empty for now";
        }
      } else if (tool === "clear_packing_list") {
        // One statement instead of forty deletes.
        const { error: e } = await supabase
          .from(table)
          .delete()
          .eq("trip_id", patch.trip_id);
        dbError = e;
      } else if (FAMILY_TABLES.has(table)) {
        // Family-wide rows: keyed by id only, with RLS keeping them in family.
        if (tool.startsWith("delete_")) {
          const { error: e } = await supabase.from(table).delete().eq("id", id);
          dbError = e;
        } else if (tool.startsWith("update_")) {
          const { error: e } = await supabase
            .from(table)
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", id);
          dbError = e;
        } else {
          const { error: e } = await supabase
            .from(table)
            .insert({ ...patch, family_id: familyId });
          dbError = e;
        }
      } else if (REVIEW_TOOLS.has(tool)) {
        // Rating and review only, on one itinerary item.
        const query = supabase
          .from("itinerary_items")
          .update({
            ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
            ...(patch.review !== undefined ? { review: patch.review } : {}),
          })
          .eq("id", id);
        const { error: e } = await query;
        dbError = e;
      } else if (tool.startsWith("delete_")) {
        const { error: e } = await supabase.from(table).delete().eq("id", id);
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
          .eq("id", id);
        dbError = e;
      } else {
        // validateAction put the resolved trip on the patch.
        const row = { ...patch };
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
        : { ok: true, summary: `${action.summary}${extra}` },
    );
  }

  const applied = results.filter((r) => r.ok).length;

  // The receipt is part of the conversation, not just a toast. Writing it here
  // means the transcript — and Aly, on the next turn — knows what was actually
  // saved rather than only what was proposed.
  const receipt = describeOutcome(applied, results);
  // It belongs to the conversation the changes were proposed in, so an id the
  // client did not send, or one belonging to someone else, gets a conversation of
  // its own rather than dropping the receipt on the floor.
  const { id: conversationId } = await ensureConversation(supabase, user.id, {
    conversationId:
      typeof payload?.conversationId === "string"
        ? payload.conversationId
        : null,
    tripId,
  });
  await appendMessage(supabase, {
    userId: user.id,
    conversationId,
    tripId,
    role: "assistant",
    body: receipt,
    kind: "receipt",
  });

  return NextResponse.json({
    applied,
    results,
    createdSlug,
    packingTripId,
    receipt,
    conversationId,
  });
}

// Plain language, and specific about what failed.
function describeOutcome(applied, results) {
  const failed = results.filter((r) => !r.ok);
  const head =
    applied > 0
      ? `Saved ${applied} change${applied === 1 ? "" : "s"}.`
      : "Nothing was saved.";
  if (!failed.length) return head;
  const detail = failed.map((f) => f.error || f.summary).join("; ");
  return `${head} ${failed.length} failed: ${detail}`;
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
// A standing packing list, and whatever it was asked to start from. The copy
// reads the source here rather than trusting anything the model sent, so what
// lands on the new list is what is actually on the old one.
async function writeTemplate({ supabase, patch, familyId }) {
  const {
    copy_from_template_id: fromList,
    copy_from_trip_id: fromTrip,
    copy_categories: categories,
    ...row
  } = patch;

  const { data, error } = await supabase
    .from("packing_templates")
    .insert({ ...row, family_id: familyId })
    .select("id")
    .single();
  if (error || !data?.id) {
    return { error: error || { message: "Could not start that list." } };
  }
  const id = data.id;
  if (!fromList && !fromTrip) return { id, copied: 0 };

  const columns = "category, item, assignee, quantity, sort_order";
  const { data: source } = fromTrip
    ? await supabase
        .from("packing_items")
        .select(columns)
        .eq("trip_id", fromTrip)
        .order("category")
        .order("sort_order")
    : await supabase
        .from("packing_template_items")
        .select(columns)
        .eq("template_id", fromList)
        .order("category")
        .order("sort_order");

  const items = copiedTemplateItems(source, {
    templateId: id,
    categories,
  });
  if (!items.length) return { id, copied: 0 };

  const { error: itemsError } = await supabase
    .from("packing_template_items")
    .insert(items);
  if (itemsError) {
    // The list itself did save, so say that rather than implying nothing happened.
    return {
      id,
      copied: 0,
      error: {
        message: `I started “${row.name}” but could not copy the items into it: ${itemsError.message}`,
      },
    };
  }
  return { id, copied: items.length };
}

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

  // `wantsPacking` says the family asked for a packing list on this trip, which
  // is true whether or not there was a template to copy. What is in there now is
  // only the floor.
  return { error: null, slug: trip.slug, id: trip.id, wantsPacking: copyBase };
}

// Slugs are how trips are addressed in the URL, so keep them unique.
async function freeSlug(supabase, base, excludeId) {
  const { data } = await supabase.from("trips").select("id, slug");
  const taken = new Set(
    (data || []).filter((t) => t.id !== excludeId).map((t) => t.slug),
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 50; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
