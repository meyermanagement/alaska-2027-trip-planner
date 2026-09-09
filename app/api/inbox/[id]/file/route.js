import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

/**
 * File one inbox message onto a trip, and promote the parsed items the
 * primary approved into real itinerary_items on that trip.
 *
 * The message stays in the database -- filing is a status change plus a
 * pointer to the trip -- so a family can still see what has arrived and where
 * it went. Any attribution the primary set at filing time
 * (attributed_traveler_id) is written here too, so the message ends up with
 * a real person on it even when the sender was originally unknown.
 *
 * Approval of parsed items is the second half of filing. The parser stages
 * each candidate row into inbox_parsed_items rather than writing straight to
 * the itinerary, so a garbled confirmation cannot plant confidently-wrong
 * flight numbers into a trip overnight. Filing is when a person looks at
 * those staged rows and says yes to the ones that read right. Rows the caller
 * did not tick are left in place with status='pending': they can still be
 * approved later, and rejecting one is a separate DELETE.
 *
 * Body:
 *   trip_id           uuid                    required
 *   traveler_id       uuid                    optional (overwrites attribution)
 *   approve_item_ids  uuid[]                  optional (empty = file only)
 */
export async function POST(request, { params }) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing message id." }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const tripId = body?.trip_id;
  const travelerId = body?.traveler_id || null;
  // A list of parsed-item ids to promote alongside filing. Non-array or absent
  // means "just file"; the message still moves to filed and the staged items
  // stay pending for later.
  const approveIds = Array.isArray(body?.approve_item_ids)
    ? body.approve_item_ids.filter(
        (v) => typeof v === "string" && v.length > 0,
      )
    : [];

  if (!tripId) {
    return NextResponse.json(
      { error: "Which trip should this be filed under?" },
      { status: 400 },
    );
  }

  // Read the row through RLS -- if the caller is not on the family, they get
  // an empty result and a 404 back rather than a diagnostic that would
  // confirm the id exists.
  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, family_id, status, attributed_traveler_id")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Confirm the trip is on the same family, so filing a message from one
  // family onto another family's trip is not even a shape the API accepts.
  const { data: trip } = await supabase
    .from("trips")
    .select("id, family_id")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip || trip.family_id !== message.family_id) {
    return NextResponse.json(
      { error: "That trip is not on this family." },
      { status: 400 },
    );
  }

  const update = {
    status: "filed",
    filed_trip_id: tripId,
    filed_at: new Date().toISOString(),
    filed_by: user.id,
  };
  // Only overwrite attribution when the caller sent one -- filing a message
  // that already had a traveler linked should not blank it out because the
  // primary happened not to pick one in the file-it dialog.
  if (travelerId) update.attributed_traveler_id = travelerId;

  const { error: fileErr } = await supabase
    .from("inbox_messages")
    .update(update)
    .eq("id", id);
  if (fileErr) {
    return NextResponse.json({ error: fileErr.message }, { status: 400 });
  }

  // If nothing to approve, the file-it is the whole job. Return early rather
  // than making the round trips for an empty set.
  if (approveIds.length === 0) {
    return NextResponse.json({ ok: true, approved: 0 });
  }

  const approved = await approveParsedItems(supabase, {
    userId: user.id,
    messageId: id,
    tripId,
    parsedIds: approveIds,
  });

  return NextResponse.json({ ok: true, approved });
}

/**
 * Promote each ticked parsed item to a real itinerary_items row on the trip.
 *
 * Read-then-write rather than an upsert because we need the parsed row's
 * shape to build the itinerary row, and we need to skip parsed rows that are
 * already approved (idempotent for a re-click or a retry). RLS gates the
 * reads and writes to the family, so a foreign parsed-item id in the caller's
 * list is silently dropped rather than 400'd -- it will simply not appear in
 * the fetched batch.
 *
 * sort_order: append to the tail of whatever the trip already has, so an
 * imported flight lands after the last hand-entered item rather than shoving
 * itself to the top. The parser's own sort_order within the message is
 * preserved by ordering the batch by it before insert.
 *
 * Silent-per-row errors: if inserting one itinerary_items row fails, keep
 * going with the rest. A single flight that could not be written is much less
 * bad than losing all four legs because the second one had a bad time value.
 */
export async function approveParsedItems(
  supabase,
  { userId, messageId, tripId, parsedIds },
) {
  // Pull only the pending rows that belong to this message and are in the
  // requested set. Family scoping falls out of RLS. Sort by the parser's
  // own order so multi-leg itineraries stay in the order the model wrote
  // them.
  const { data: parsed } = await supabase
    .from("inbox_parsed_items")
    .select(
      "id, category, title, location, item_date, end_date, start_time, confirmation_number, notes, sort_order, status",
    )
    .eq("message_id", messageId)
    .in("id", parsedIds)
    .eq("status", "pending")
    .order("sort_order", { ascending: true });

  if (!parsed || parsed.length === 0) return 0;

  // The base sort_order to append onto. Read fresh here instead of trusting
  // a snapshot, because the trip may have gained items since the /inbox page
  // was rendered. A trip with no itinerary items yet returns null and we
  // start at 1.
  const { data: last } = await supabase
    .from("itinerary_items")
    .select("sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSort =
    (Number.isFinite(last?.sort_order) ? last.sort_order : 0) + 1;

  let approvedCount = 0;
  for (const row of parsed) {
    // Build the itinerary_items patch from the parsed row. The parser has
    // already trimmed and enum-checked these fields, but item_date is the
    // one hard requirement -- if a parsed row somehow slipped through with
    // no date, the itinerary would refuse it anyway, so skip it here and
    // leave the parsed row pending for a person to fix.
    if (!row.item_date) continue;

    const patch = {
      trip_id: tripId,
      title: row.title,
      category: row.category,
      item_date: row.item_date,
      end_date: row.end_date || null,
      start_time: row.start_time || null,
      location: row.location || null,
      confirmation_number: row.confirmation_number || null,
      notes: row.notes || null,
      sort_order: nextSort,
      created_by: userId,
    };

    const { data: inserted, error: insErr } = await supabase
      .from("itinerary_items")
      .insert(patch)
      .select("id")
      .maybeSingle();
    if (insErr || !inserted?.id) continue;

    nextSort += 1;

    // Mark the parsed row approved and point at the itinerary row that
    // came out of it. If this update fails the itinerary row still stands;
    // the worst case is a stale pending parsed row the primary can reject
    // later.
    await supabase
      .from("inbox_parsed_items")
      .update({
        status: "approved",
        approved_item_id: inserted.id,
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .eq("id", row.id);

    approvedCount += 1;
  }

  return approvedCount;
}
