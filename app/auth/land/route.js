import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { landingPath } from "@/lib/auth/landing";
import { markArrival } from "@/lib/auth/arrive";

/**
 * The first hop after signing in with an email and a password.
 *
 * The password form has a session in the browser and could push straight to the
 * page it was asked for, and that is exactly what it did wrong: the question of
 * whether this person has met Aly yet can only be answered on the server, so
 * that door skipped the introduction the Google door gives. It now sends the
 * browser here, this asks the same question the OAuth callback asks, and the
 * answer is a redirect either way.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const asked = searchParams.get("next") || "/trips";
  // Only ever inside this app, and never back to itself.
  const next =
    asked.startsWith("/") && !asked.startsWith("/auth/land") ? asked : "/trips";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(`${origin}/login`);

  // Somebody who asked for a particular page knows where they are going. They
  // have still just signed in, so the page they land on is an arrival either
  // way and gets the full opening.
  if (next !== "/trips")
    return markArrival(NextResponse.redirect(`${origin}${next}`));

  const landing = await landingPath(supabase, user.id);
  return markArrival(NextResponse.redirect(`${origin}${landing || "/trips?arrival=1"}`));
}
