import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { readVerification } from "@/lib/inbox/verification";

export const runtime = "nodejs";

/**
 * Finish with a forwarding check.
 *
 * The inbox was built around mail that becomes something: a booking is filed
 * onto a trip, a sender is trusted, junk is thrown out. A forwarding
 * confirmation is none of those. It is read once, acted on outside this app,
 * and then it is simply over -- and until this route existed the only way off
 * the pending list was Throw out, which warns that attachments are destroyed
 * and records the message in the drawer as junk. Neither is true of a message
 * somebody used exactly as intended, so people left it sitting there.
 *
 * `noted` is the status the fare reader already uses for mail that was read but
 * is not a booking, and it is the right shelf for this too: off the list,
 * nothing destroyed, still findable.
 *
 * The check that this really is a verification message is repeated here rather
 * than trusted from the screen. Otherwise the route would be a quiet way to make
 * any message disappear without the warning Throw out gives, and the drawer
 * would describe a booking confirmation as a forwarding check. The recognizer is
 * the same literal one the card uses -- known sender, no model, no inference --
 * so a caller cannot talk it into agreeing.
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
    .select("id, status, from_email, text_body")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Already off the list. Somebody pressed it twice, or in another tab.
  if (message.status === "noted") {
    return NextResponse.json({ ok: true, changed: false });
  }
  if (message.status !== "pending") {
    return NextResponse.json(
      { error: "That message has already left the inbox." },
      { status: 400 },
    );
  }

  if (!readVerification(message)) {
    return NextResponse.json(
      {
        error:
          "That is not a forwarding check. File it onto a trip or throw it out.",
      },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("inbox_messages")
    .update({ status: "noted" })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, changed: true });
}
