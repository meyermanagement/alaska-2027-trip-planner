import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

/**
 * Put a message that has left the inbox back on the pending list.
 *
 * The sibling `unfile` route is the Undo on the Just-filed band: auto-filed only,
 * inside a day, one tap, no confirmation. This is the deliberate version behind
 * the drawer of cleared messages. It has no time limit, it does not care whether
 * Aly filed the message or somebody did it by hand, and it takes messages that
 * were thrown out as well as messages that were filed.
 *
 * The two are kept apart rather than merged because their refusals are the point.
 * Undo refuses outside its window so that the band can promise something narrow
 * and keep the promise. This one refuses nothing, which is only safe because the
 * screen in front of it says what is about to happen and asks first.
 *
 * Reopening takes back what the filing wrote:
 *
 *   1. The itinerary_items rows this message inserted are deleted, found through
 *      the pointer the parsed rows kept. Rows the filing merged INTO are left
 *      alone -- they were on the trip before the message arrived, and deleting
 *      them would take pre-existing data with it. A merge also changed fields
 *      that cannot be rolled back without a before-image, and we do not keep
 *      one, so those edits survive and the family hand-corrects. Accidentally
 *      deleting a reservation somebody else made is the worse failure.
 *
 *   2. Those parsed rows go back to pending, so the message shows its staged
 *      items again and can be filed onto a different trip.
 *
 *   3. The message goes back to pending and forgets where it was filed.
 *
 * What it cannot undo is a delete's effect on storage. Throwing a message out
 * removes the attachment bytes and the attachment rows, on the grounds that they
 * are the expensive part of a piece of junk. So a reopened message that had a PDF
 * comes back without it. The drawer says so on the row rather than letting
 * somebody find out afterwards.
 *
 * Everything runs through RLS as the caller, so somebody outside the family sees
 * a 404 on the lookup and stops. Two concurrent calls resolve to whichever wins
 * the guarded update; the loser finds nothing to reopen and still returns ok.
 */
export async function POST(_request, { params }) {
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

  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  // Already back. Somebody reopened it in another tab, or tapped twice.
  if (message.status === "pending") {
    return NextResponse.json({
      ok: true,
      reopened: false,
      itinerary_removed: 0,
      parsed_reset: 0,
    });
  }
  if (message.status !== "filed" && message.status !== "deleted") {
    return NextResponse.json(
      { error: "This message is still being read." },
      { status: 400 },
    );
  }

  const { data: approvedRows } = await supabase
    .from("inbox_parsed_items")
    .select("id, approved_item_id, merged_into_existing")
    .eq("message_id", id)
    .eq("status", "approved")
    .not("approved_item_id", "is", null);

  const itineraryIds = (approvedRows || [])
    .filter((row) => !row.merged_into_existing)
    .map((row) => row.approved_item_id)
    .filter(Boolean);
  const parsedIds = (approvedRows || []).map((row) => row.id);

  if (itineraryIds.length > 0) {
    await supabase.from("itinerary_items").delete().in("id", itineraryIds);
  }

  if (parsedIds.length > 0) {
    await supabase
      .from("inbox_parsed_items")
      .update({
        status: "pending",
        approved_item_id: null,
        approved_at: null,
        approved_by: null,
        merged_into_existing: false,
      })
      .in("id", parsedIds);
  }

  const { data: reset, error } = await supabase
    .from("inbox_messages")
    .update({
      status: "pending",
      filed_trip_id: null,
      filed_at: null,
      filed_by: null,
      auto_filed: false,
      auto_filed_at: null,
    })
    .eq("id", id)
    .in("status", ["filed", "deleted"])
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    reopened: Boolean(reset),
    itinerary_removed: itineraryIds.length,
    parsed_reset: parsedIds.length,
  });
}
