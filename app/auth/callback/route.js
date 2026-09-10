import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { landingPath } from "@/lib/auth/landing";

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/trips";
  const oauthError =
    searchParams.get("error_description") || searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(oauthError)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(
        "Sign-in link was missing its code. Please try again.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`,
    );
  }

  // A code carried through the OAuth round trip, spent here. The sign-up
  // trigger can only see a code that arrived as sign-up metadata, which is the
  // email-and-password path only, so somebody who tapped Continue with Google
  // used to arrive with an account and no family. The login screen puts their
  // code on the redirect and this spends it before anything else looks at
  // their membership. The function refuses anybody who already belongs to a
  // family, so a stale code in a bookmarked URL does nothing.
  const signupCode = searchParams.get("signup_code");
  if (signupCode) {
    const { data: outcome } = await supabase.rpc("redeem_signup_code", {
      p_code: signupCode,
    });
    // A code that turned out to be wrong is worth saying out loud rather than
    // dropping them on /join to guess at it. They are signed in either way, so
    // the message goes back to the login screen with their account made.
    if (outcome === "invalid") {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent(
          "That code was not recognized, or it has already been used. Your account is made, so ask for a fresh code and sign in again.",
        )}`,
      );
    }
  }

  // A person whose email was added to the family's People list gets their seat
  // here, on the way in — no invite code to type. The function is a no-op for
  // anyone already linked, and returns null for an email nobody has listed.
  await supabase.rpc("claim_traveler_seat");

  // Where they land, which is a question the password door has to ask too, so it
  // lives in lib/auth/landing rather than here. A brand-new account -- has a
  // family, but nothing in it -- goes to the welcome screen before the Trips
  // page, and so does anybody who has not been introduced to Aly yet.
  const {
    data: { user: signedIn },
  } = await supabase.auth.getUser();
  if (signedIn && next === "/trips") {
    const landing = await landingPath(supabase, signedIn.id);
    if (landing) return NextResponse.redirect(`${origin}${landing}`);
  }

  const safeNext = next.startsWith("/") ? next : "/trips";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
