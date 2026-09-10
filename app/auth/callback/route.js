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

  // A brand-new account -- has a family, but nothing in it -- goes to the
  // welcome screen before the Trips page. Somebody who came in through an
  // invite already has a family with people in it, so this leaves them alone.
  // A secondary traveler never gets welcomed either: /welcome redirects them
  // straight back to /trips.
  const {
    data: { user: signedIn },
  } = await supabase.auth.getUser();
  if (signedIn && next === "/trips") {
    const { data: membership } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", signedIn.id)
      .maybeSingle();
    if (membership?.family_id) {
      const [{ data: fam }, { count: peopleCount }] = await Promise.all([
        supabase
          .from("families")
          .select("home_address")
          .eq("id", membership.family_id)
          .maybeSingle(),
        supabase
          .from("travelers")
          .select("id", { count: "exact", head: true })
          .eq("family_id", membership.family_id)
          .eq("is_person", true),
      ]);
      const empty = !fam?.home_address && (peopleCount || 0) === 0;
      if (empty) return NextResponse.redirect(`${origin}/welcome/meet-aly`);

      // A non-owner signing in for the first time meets Aly first, then is
      // walked through their own file: About me, then Favorite moments, then
      // Home. They are as new to the app as the person who created the
      // household -- the only thing they did not do is fill in the family
      // form -- so being handed straight to a form about themselves by a
      // product they have never been introduced to is the wrong opening.
      // Meet Aly sends them onward to About me rather than to the family
      // form, since their family already exists.
      //
      // The owner never comes through this door -- their traveler row is
      // stamped welcomed_at at household creation time (see the migration).
      // Everybody else gets the walkthrough once. Skipping stamps
      // welcomed_at anyway so this never runs again for that person.
      const { data: mySeat } = await supabase
        .from("travelers")
        .select("id, welcomed_at")
        .eq("family_id", membership.family_id)
        .eq("user_id", signedIn.id)
        .eq("is_person", true)
        .maybeSingle();
      if (mySeat?.id && !mySeat.welcomed_at) {
        return NextResponse.redirect(`${origin}/welcome/meet-aly`);
      }
    }
  }

  const safeNext = next.startsWith("/") ? next : "/trips";
  return NextResponse.redirect(`${origin}${safeNext}`);
}
