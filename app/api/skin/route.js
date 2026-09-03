import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SKIN_COOKIE, SKIN_COOKIE_MAX_AGE, skinOr } from "@/lib/skins";

/**
 * Remember which skin a person chose.
 *
 * Two writes, and both are needed. The profile row is the truth -- it is what
 * makes the choice follow somebody to their phone -- and the cookie is what the
 * script in the document head reads before the first paint. Writing only the row
 * would mean the next page load still arrived in the old colors; writing only the
 * cookie would mean the choice lasted as long as this browser.
 *
 * The row is written through the caller's own session, so the database's own
 * policy decides whose profile this is (id = auth.uid()), not this route.
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

  // skinOr refuses anything this build cannot paint, so an unknown name saves as
  // the default rather than being written and then rejected by the column's own
  // check constraint -- which would have been a 500 for a mistyped string.
  const skin = skinOr(body?.skin);

  const { error } = await supabase
    .from("profiles")
    .update({ skin })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const response = NextResponse.json({ skin });
  response.cookies.set(SKIN_COOKIE, skin, {
    maxAge: SKIN_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
