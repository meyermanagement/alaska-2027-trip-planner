import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isTesterAccount } from "@/lib/beta/tester";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_MAX_AGE,
  CONSENT_NOT_IN_BETA,
} from "@/lib/beta/consent";

/**
 * The way out of the gate for an account the beta agreement does not cover.
 *
 * A route rather than a redirect from the page, because a server component
 * cannot set a cookie -- and without the cookie the gate loops: middleware finds
 * no consent row and sends them to /welcome/beta, the page finds they are not a
 * tester and sends them to /trips, and middleware finds no consent row again.
 *
 * The check is done here and not trusted from anywhere: this is the one place in
 * the app that can write the cookie letting a request past the gate without a
 * consent row behind it, so it asks the question itself. A tester who reaches it
 * is sent back to the screens.
 */
export async function GET(request) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();
  const me = await whoIs(supabase);
  if (!me) return NextResponse.redirect(`${origin}/login`);

  const tester = await isTesterAccount(supabase, me);
  if (tester) return NextResponse.redirect(`${origin}/welcome/beta`);

  const response = NextResponse.redirect(`${origin}/trips`);
  response.cookies.set(CONSENT_COOKIE, CONSENT_NOT_IN_BETA, {
    maxAge: CONSENT_COOKIE_MAX_AGE,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
