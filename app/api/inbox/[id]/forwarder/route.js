import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

/**
 * Trust the sender of this message as a forwarder for one traveler.
 *
 * Writes a family_forwarders row so future messages from the same address
 * inherit the linked traveler's attribution at receive time. Also updates
 * this message's own attribution, so the primary does not have to file it
 * afterwards to see the person's name attached.
 *
 * Idempotent: adding the same sender again for a different traveler updates
 * the row rather than double-writing (matches the unique index on
 * (family_id, lower(email))).
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

  const travelerId = body?.traveler_id;
  if (!travelerId) {
    return NextResponse.json(
      { error: "Pick a person to link this sender to." },
      { status: 400 },
    );
  }

  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, family_id, from_email, classification")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: traveler } = await supabase
    .from("travelers")
    .select("id, family_id, is_person")
    .eq("id", travelerId)
    .maybeSingle();
  if (
    !traveler ||
    traveler.family_id !== message.family_id ||
    !traveler.is_person
  ) {
    return NextResponse.json(
      { error: "That person is not on this family." },
      { status: 400 },
    );
  }

  // Upsert on (family_id, lower(email)) -- Postgres does not fold case in a
  // unique index target automatically, so we insert lowercased and rely on
  // the ilike lookup at receive time to match either form.
  const email = String(message.from_email).toLowerCase();
  const { error: upsertError } = await supabase
    .from("family_forwarders")
    .upsert(
      {
        family_id: message.family_id,
        email,
        traveler_id: travelerId,
        added_by: user.id,
      },
      { onConflict: "family_id,email" },
    );
  if (upsertError) {
    return NextResponse.json(
      { error: upsertError.message },
      { status: 400 },
    );
  }

  // Reclassify the message itself. A message that arrived as "unknown"
  // becomes "forwarder", so the inbox stops flagging it as needing
  // attribution.
  await supabase
    .from("inbox_messages")
    .update({
      classification: "forwarder",
      attributed_traveler_id: travelerId,
    })
    .eq("id", id);

  // Also reclassify any other pending messages from the same sender on this
  // family -- so a primary who has been sitting on three quarantined
  // messages from the same address does not have to trust the same sender
  // three times.
  await supabase
    .from("inbox_messages")
    .update({
      classification: "forwarder",
      attributed_traveler_id: travelerId,
    })
    .eq("family_id", message.family_id)
    .eq("status", "pending")
    .eq("classification", "unknown")
    .ilike("from_email", email);

  return NextResponse.json({ ok: true });
}
