import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

/**
 * Dismiss an auto-filed message from the inbox banner.
 *
 * The Just-filed-by-Aly banner is a one-day review affordance: the family
 * sees what was auto-filed, and if it looks wrong, one tap of Undo puts
 * it back. Most of the time the auto-file is right, and once the family
 * has glanced at the row they no longer need it hanging around. This
 * route is the "yes, I saw that, please stop showing it" affordance.
 *
 * It only clears the display flag -- the message stays filed to the trip
 * it was filed to, the itinerary_items rows it created stay on the trip,
 * and the Undo window on THIS row closes because Undo requires
 * auto_filed=true. Dismissing is a soft acknowledgement, not an
 * irreversible action, so filed_by is set to the caller for auditing.
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
    .select("id, status, auto_filed")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (message.status !== "filed") {
    return NextResponse.json(
      { error: "Only a filed message can be cleared." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("inbox_messages")
    .update({
      auto_filed: false,
      filed_by: user.id,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
