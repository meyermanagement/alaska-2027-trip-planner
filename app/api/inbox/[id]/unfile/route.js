import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

// The window during which an auto-filed message can be undone. A day is
// long enough that the family sees it on the morning email, the trip page,
// and the /inbox banner and still has time to catch a bad match; short
// enough that the itinerary is not haunted by ghost undo buttons forever.
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Undo an auto-file.
 *
 * Auto-filing is a big win when it is right and a real annoyance when it
 * is wrong. The undo affordance is the deal that lets the app be brave in
 * the common case: the family can trust that a bad match is one tap of
 * work to reverse, provided they catch it within a day.
 *
 * The undo route:
 *
 *   1. Refuses to touch a message that was not auto-filed, or whose
 *      auto-file is older than the window. A manually-filed message stays
 *      filed here -- unfiling that is a different, more careful operation.
 *
 *   2. Deletes any itinerary_items rows the auto-file created. Those are
 *      the ones pointed at by inbox_parsed_items.approved_item_id where
 *      the parsed row belongs to this message.
 *
 *   3. Resets those parsed items to status='pending', clears
 *      approved_item_id / approved_at, so the file-it list picks them up
 *      again the next time the primary opens the message.
 *
 *   4. Puts the message back to status='pending', clears filed_trip_id,
 *      filed_at, filed_by, auto_filed, auto_filed_at. The message
 *      reappears at the top of /inbox with its staged rows intact.
 *
 * All four steps run through RLS as the caller. A caller who is not on
 * the family sees a 404 for the message and stops there. Two concurrent
 * undo calls resolve to whichever wins the guarded update; the loser
 * finds nothing to unfile and returns ok.
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

  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, status, auto_filed, auto_filed_at, filed_trip_id")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (!message.auto_filed) {
    return NextResponse.json(
      { error: "This message was not filed automatically." },
      { status: 400 },
    );
  }
  const filedAt = message.auto_filed_at
    ? new Date(message.auto_filed_at).getTime()
    : 0;
  if (!filedAt || Date.now() - filedAt > UNDO_WINDOW_MS) {
    return NextResponse.json(
      { error: "The undo window on this message has closed." },
      { status: 400 },
    );
  }

  // Collect the itinerary_items this auto-file created, via the pointer
  // the parsed rows kept. Approved-but-not-linked rows (e.g. a parsed row
  // that was later approved by hand) are left alone -- they are not what
  // the auto-file added.
  const { data: approvedRows } = await supabase
    .from("inbox_parsed_items")
    .select("id, approved_item_id")
    .eq("message_id", id)
    .eq("status", "approved")
    .not("approved_item_id", "is", null);

  const itineraryIds = (approvedRows || [])
    .map((r) => r.approved_item_id)
    .filter(Boolean);
  const parsedIds = (approvedRows || []).map((r) => r.id);

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
      })
      .in("id", parsedIds);
  }

  const { data: reset } = await supabase
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
    .eq("auto_filed", true)
    .select("id")
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    unfiled: Boolean(reset),
    itinerary_removed: itineraryIds.length,
    parsed_reset: parsedIds.length,
  });
}
