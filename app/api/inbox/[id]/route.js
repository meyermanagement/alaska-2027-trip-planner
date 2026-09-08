import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

export const runtime = "nodejs";

/**
 * Throw an inbox message out.
 *
 * The message row is set to 'deleted' rather than removed, so a mistaken
 * delete can still be seen by an operator asking why a confirmation went
 * missing. The storage bytes for the attachments are actually removed --
 * they are the expensive part and there is no reason to keep them around
 * once the primary has decided the message was junk.
 */
export async function DELETE(_request, { params }) {
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
    .select("id, family_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!message) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // Look up the attachments before the status change so the storage cleanup
  // can go through the same signed-in session that already has read on the
  // rows.
  const { data: attachments } = await supabase
    .from("inbox_attachments")
    .select("id, storage_path")
    .eq("message_id", id);

  const paths = (attachments || []).map((a) => a.storage_path).filter(Boolean);
  if (paths.length) {
    // Ignore the error path: the metadata row will still be removed below,
    // and a stray file in storage is easier to reap later than a metadata
    // row pointing at nothing.
    await supabase.storage.from("documents").remove(paths);
  }

  await supabase.from("inbox_attachments").delete().eq("message_id", id);

  const { error } = await supabase
    .from("inbox_messages")
    .update({ status: "deleted" })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
