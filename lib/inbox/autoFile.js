import { createAdminClient } from "@/lib/supabase/admin";
import { decideAutoFile } from "@/lib/inbox/matcher";
import {
  findExistingItineraryItem,
  buildItineraryMergePatch,
} from "@/lib/inbox/itemMatch";

/**
 * Try to file a freshly-parsed message onto one of its family's trips
 * without a person in the loop.
 *
 * Called from the tail of parseInboxMessage, when the parsed items have
 * just been staged and we already know they came out of a successful
 * parse. If the matcher says the message is unambiguous and confident,
 * this route:
 *
 *   1. Files the message: status='filed', filed_trip_id, filed_at,
 *      filed_by, auto_filed=true, auto_filed_at. filed_by is null in this
 *      path because there is no real user behind the decision; the
 *      auto_filed flag is the honest record of who did it.
 *
 *   2. Promotes every parsed item to a real itinerary_items row on that
 *      trip, in the parser's own sort order, appended to the trip's tail.
 *      Uses the admin client, so RLS is bypassed -- family scoping is
 *      already guaranteed by the matcher's family_id check.
 *
 *   3. Marks each parsed row approved with a pointer back to the
 *      itinerary_items row it became.
 *
 * If the matcher says no, this returns without touching the row and the
 * message stays pending on /inbox for a person to file. Any error inside
 * the write path is logged and swallowed: the fallback is always
 * "pending on /inbox", which is where the row already is.
 *
 * Idempotency: the file step is guarded by an eq('status', 'pending')
 * update. Two concurrent auto-file workers, or a race where the primary
 * clicks File it while auto-file is deciding, resolve to whichever wrote
 * first; the other update matches zero rows and the caller returns.
 */
export async function autoFileMessage({ messageId, familyId }) {
  const supabase = createAdminClient();
  if (!supabase) return { ok: false, reason: "no admin client" };

  const todayISO = new Date().toISOString().slice(0, 10);
  const decision = await decideAutoFile(supabase, {
    messageId,
    familyId,
    todayISO,
  });
  if (!decision.auto) return { ok: false, ...decision };

  const now = new Date().toISOString();

  // Guarded update. If two workers race, only one flips the status to
  // 'filed'; the other one's matched-row count is zero and we return.
  const { data: filed, error: fileErr } = await supabase
    .from("inbox_messages")
    .update({
      status: "filed",
      filed_trip_id: decision.tripId,
      filed_at: now,
      auto_filed: true,
      auto_filed_at: now,
    })
    .eq("id", messageId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (fileErr) return { ok: false, reason: `file: ${fileErr.message}` };
  if (!filed) return { ok: false, reason: "lost the race" };

  // Read the staged items in the parser's order, so a multi-leg itinerary
  // lands in the order the model wrote it.
  const { data: parsed } = await supabase
    .from("inbox_parsed_items")
    .select(
      "id, category, title, location, item_date, end_date, start_time, confirmation_number, notes, sort_order",
    )
    .eq("message_id", messageId)
    .eq("status", "pending")
    .order("sort_order", { ascending: true });

  if (!parsed || parsed.length === 0) {
    // Nothing to approve. The message is filed on its own. Very unusual
    // but not fatal -- the trip just has one more filed message.
    return { ok: true, tripId: decision.tripId, approved: 0 };
  }

  // Base sort_order for the trip. A fresh trip returns null and we start
  // at 1. Read fresh so an item added by a person between decide and file
  // does not get shoved above by an auto-filed row.
  const { data: last } = await supabase
    .from("itinerary_items")
    .select("sort_order")
    .eq("trip_id", decision.tripId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  let nextSort =
    (Number.isFinite(last?.sort_order) ? last.sort_order : 0) + 1;

  let approved = 0;
  let merged = 0;
  for (const row of parsed) {
    if (!row.item_date) continue;

    // A booking system that resends the same reservation as an "update" or
    // a "tour moves" message must not put a second copy on the trip. If the
    // trip already has a matching row, merge into it instead of inserting.
    const existing = await findExistingItineraryItem(
      supabase,
      decision.tripId,
      row,
    );

    let itemId = null;
    if (existing) {
      const mergePatch = buildItineraryMergePatch(existing, row);
      if (Object.keys(mergePatch).length > 0) {
        await supabase
          .from("itinerary_items")
          .update(mergePatch)
          .eq("id", existing.id);
      }
      itemId = existing.id;
      merged += 1;
    } else {
      const patch = {
        trip_id: decision.tripId,
        title: row.title,
        category: row.category,
        item_date: row.item_date,
        end_date: row.end_date || null,
        start_time: row.start_time || null,
        location: row.location || null,
        confirmation_number: row.confirmation_number || null,
        notes: row.notes || null,
        sort_order: nextSort,
      };

      const { data: inserted, error: insErr } = await supabase
        .from("itinerary_items")
        .insert(patch)
        .select("id")
        .maybeSingle();
      if (insErr || !inserted?.id) continue;
      itemId = inserted.id;
      nextSort += 1;
      approved += 1;
    }

    await supabase
      .from("inbox_parsed_items")
      .update({
        status: "approved",
        approved_item_id: itemId,
        approved_at: now,
        merged_into_existing: Boolean(existing),
      })
      .eq("id", row.id);
  }

  return { ok: true, tripId: decision.tripId, approved, merged };
}
