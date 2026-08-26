import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  // A person whose email was added to the family's People list gets their seat
  // here, on the way in — no invite code to type. The function is a no-op for
  // anyone already linked, and returns null for an email nobody has listed.
  await supabase.rpc("claim_traveler_seat");

  const safeNext = next.startsWith("/") ? next : "/trips";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
