// The messages that have left the inbox, kept where they can be found again.
//
// Its own route rather than part of the Inbox page load, because the drawer that
// reads it is shut by default and most visits never open it. Making every trip to
// /inbox pay for a query nobody reads would be the wrong trade -- the same reason
// the put-away tips have a route of their own.
//
// Two quite different things end up in this list. A message thrown out is a
// judgement that it was junk, and the attachment bytes were destroyed on the way
// out, so reopening one gets the email back and not the boarding pass. A message
// filed onto a trip is the opposite: it worked, and the reason to come looking is
// usually "which trip did that hotel confirmation land on". The list says which of
// the two happened to each row rather than flattening them into "gone".

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

export async function GET() {
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
    return NextResponse.json({ messages: [] });
  }

  // Ordered by when the message arrived rather than when it left, because
  // 'deleted' keeps no timestamp of its own and a list half-sorted on one clock
  // and half on another reads as broken. Arrival order is also the order the
  // family saw them in, which is how somebody looking for a particular
  // confirmation remembers it.
  const { data: rows, error } = await supabase
    .from("inbox_messages")
    .select(
      "id, subject, from_email, from_name, received_at, status, filed_at, auto_filed, classification, trips!inbox_messages_filed_trip_id_fkey (id, name, slug, public_id)",
    )
    .eq("family_id", familyId)
    .in("status", ["filed", "deleted"])
    .order("received_at", { ascending: false })
    .limit(60);

  if (error) {
    return NextResponse.json(
      { error: "Could not fetch those." },
      { status: 500 },
    );
  }

  // How many itinerary rows reopening each message would take off its trip, so
  // the confirmation can say the number out loud instead of asking the family to
  // agree to an unknown. Counted the same way the reopen itself counts: rows this
  // message inserted, not rows it merged into, which were on the trip first and
  // are left alone.
  const ids = (rows || []).map((row) => row.id);
  const removable = new Map();
  if (ids.length) {
    const { data: parsed } = await supabase
      .from("inbox_parsed_items")
      .select("message_id, approved_item_id, merged_into_existing")
      .in("message_id", ids)
      .eq("status", "approved")
      .not("approved_item_id", "is", null);
    for (const row of parsed || []) {
      if (row.merged_into_existing) continue;
      removable.set(row.message_id, (removable.get(row.message_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    messages: (rows || []).map((row) => ({
      ...row,
      itinerary_rows: removable.get(row.id) || 0,
    })),
  });
}
