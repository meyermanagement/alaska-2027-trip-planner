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
 * RLS on the 'documents' bucket refuses to sign paths whose first folder is
 * not a family the caller belongs to. So this route does not have to
 * re-implement the family check -- it only refuses signed-out callers up front
 * and reports what storage said.
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
