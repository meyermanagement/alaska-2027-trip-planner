import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  TEXT_COOKIE,
  TEXT_COOKIE_MAX_AGE,
  textSizeOr,
} from "@/lib/textsize";

/**
 * Remember how big a person wants the words.
 *
 * The same two writes the skin route makes, for the same two reasons: the
 * profile row is what carries the choice to their phone, and the cookie is what
 * the script in the document head reads before the first paint. Writing only the
 * row would mean the next load arriving in the old size; writing only the cookie
 * would mean the choice lasting as long as this browser.
 *
 * The row is written through the caller's own session, so the database's own
 * policy decides whose profile this is.
 */
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // textSizeOr refuses anything the stylesheet has no block for, so a mistyped
  // value saves as the default rather than being written and then rejected by
  // the column's own check -- which would have been a 500 for a typo.
  const size = textSizeOr(body?.size);

  const { error } = await supabase
    .from("profiles")
    .update({ text_size: size })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = NextResponse.json({ size });
  response.cookies.set(TEXT_COOKIE, size, {
    maxAge: TEXT_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
