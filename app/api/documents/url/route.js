import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";

/**
 * A short-lived link to open one document.
 *
 * The link is a bearer token in a query string, so short-lived is the point.
 * Sixty seconds is enough for a click-to-view and not enough for a link pasted
 * into somebody else's chat to still be useful an hour later. If a family
 * member closes the file and comes back, the page asks for a fresh URL rather
 * than reusing the old one.
 *
 * The check that says who can open what happens on the storage layer's own
 * side. `createSignedUrl` runs through the caller's session, and the storage
 * RLS on the 'documents' bucket decides. So this route does not re-implement
 * the household check -- it refuses signed-out callers up front and reports
 * what storage said.
 *
 * It does re-check one thing, and the September 16 isolation pass is why. The
 * bucket rule used to be "are you in this household" while the rows describing
 * these files are narrower than that, so a path could be signed for somebody
 * who could not read the row it belongs to. The storage policies were narrowed
 * to match (20260927_member_removal_and_document_scope.sql), and this route now
 * also insists that a personal document's own row is visible to the caller
 * before it signs anything. Two layers saying the same thing is deliberate: the
 * bucket rule is keyed on a path convention, and a path convention is a
 * promise the code makes to itself.
 */
export async function POST(request) {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const path = typeof body?.path === "string" ? body.path : "";
  const download = body?.download === true;
  const filename =
    typeof body?.filename === "string" ? body.filename : undefined;

  if (!path) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }

  // A personal document belongs to one traveler and is described by a
  // traveler_documents row. If the caller cannot see that row, they have no
  // business holding a link to the file, whatever the folder says.
  if (path.split("/")[1] === "personal") {
    const { data: row } = await supabase
      .from("traveler_documents")
      .select("id")
      .eq("storage_path", path)
      .maybeSingle();
    if (!row) {
      return NextResponse.json(
        { error: "That document could not be opened." },
        { status: 404 },
      );
    }
  }

  const options = download ? { download: filename || true } : undefined;

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(path, 60, options);

  if (error || !data?.signedUrl) {
    // 404 hides whether the file exists but is inaccessible, matching how
    // Storage refuses paths that the caller cannot see -- the message is worth
    // saying so the UI can decide between "gone" and "not yours".
    return NextResponse.json(
      { error: error?.message || "That document could not be opened." },
      { status: 404 },
    );
  }

  return NextResponse.json({ url: data.signedUrl });
}
