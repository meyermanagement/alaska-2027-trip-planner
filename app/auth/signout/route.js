import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { SKIN_COOKIE } from "@/lib/skins";

export async function POST(request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const response = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  // The skin cache outlives the session by a year, and this browser may be a
  // shared one. Leaving it would show the next person to sign in whatever the
  // last person chose, until middleware next found it missing -- which it would
  // not, because it is there. Cleared here, so the login page is the app's own
  // colors and the next person's own skin arrives with their first page.
  response.cookies.set(SKIN_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}
