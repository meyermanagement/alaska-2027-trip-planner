import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import WelcomeMomentsForm from "./WelcomeMomentsForm";

export const metadata = { title: "Favorite moments · Alyeska" };
export const dynamic = "force-dynamic";

// The second and final step of the first-login walkthrough.
//
// After About me, the person sees any favorite moments the owner already
// wrote about them. They can add their own, edit the wording of the owner's,
// or remove any that no longer belong there. Same editor used on the Family
// screen, on purpose -- the two places should feel like the same feature.
//
// Finishing (or skipping) stamps welcomed_at on the caller's traveler row so
// the auth callback stops routing them into /welcome/about-you. Anybody who
// makes it here has already been past About me; there is no reason to keep
// the walkthrough alive after this step.

export default async function WelcomeMomentsPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/moments");

  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");

  const { data: me } = await supabase
    .from("travelers")
    .select("id, name, welcomed_at")
    .eq("family_id", access.familyId)
    .eq("user_id", user.id)
    .eq("is_person", true)
    .maybeSingle();
  if (!me?.id) redirect("/trips");
  if (me.welcomed_at) redirect("/trips");

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
      <p className="section-label">Welcome to Alyeska</p>
      <h1 className="mt-1 font-display text-3xl font-semibold">
        Your favorite moments
      </h1>
      <p className="mt-3 text-sm text-ink-soft">
        Small, real memories from your life. Aly reads these before every answer
        she writes -- the more they sound like you, the better the advice fits.
        Anything the family owner wrote about you is here to edit, keep, or
        remove.
      </p>
      <div className="mt-6">
        <WelcomeMomentsForm travelerId={me.id} travelerName={me.name} />
      </div>
    </main>
  );
}
