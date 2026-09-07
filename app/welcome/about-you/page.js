import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import AboutYouForm from "./AboutYouForm";

export const metadata = { title: "About you · Alyeska" };
export const dynamic = "force-dynamic";

// The first step of the first-login walkthrough on a non-owner's own file.
//
// Somebody signing in for the first time -- Steph, Veda, a friend added by an
// invite -- lands here after the auth callback checks their traveler row and
// sees welcomed_at is null. The owner (the earliest family_members row in a
// household) had welcomed_at stamped at the migration, so they never come
// through this door.
//
// The point is not to redo the owner's work. The owner already wrote About me
// for everybody they added -- that is what About me on the People form is for.
// This page shows what the owner wrote back to the person it was written
// about, and lets them keep it, add to it, or replace it in their own words.
// Nothing is wiped. Skip is legitimate: on skip, the walkthrough moves on and
// the About me stays whatever it was.
//
// After this step comes /welcome/moments. Both together stamp welcomed_at so
// the flow never runs again for this person.

export default async function WelcomeAboutYouPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/about-you");

  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");

  // The traveler row for the caller. If they have no seat -- e.g. an unlinked
  // family member -- the walkthrough does not apply. Send them home.
  const { data: me } = await supabase
    .from("travelers")
    .select("id, name, about_me, welcomed_at")
    .eq("family_id", access.familyId)
    .eq("user_id", user.id)
    .eq("is_person", true)
    .maybeSingle();
  if (!me?.id) redirect("/trips");

  // Somebody already walked through gets sent past both steps rather than
  // reopening the form. A person who came here on purpose from a link would
  // land on their own file on the People screen for the same edit, so no
  // affordance is lost.
  if (me.welcomed_at) redirect("/trips");

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
      <p className="section-label">Welcome to Alyeska</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">
        About you, {me.name}
      </h1>
      <p className="mt-3 text-sm text-ink-soft">
        Before Aly starts answering, take a minute on your own file. This is
        what the person who set up the family wrote about you. Keep it, add to
        it, or say it in your own words -- whichever reads most like you.
      </p>
      <div className="mt-6">
        <AboutYouForm
          initialAbout={me.about_me || ""}
          travelerName={me.name || "you"}
        />
      </div>
    </main>
  );
}
