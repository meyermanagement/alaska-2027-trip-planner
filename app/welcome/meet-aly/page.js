import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import MeetAlyClient from "./MeetAlyClient";

export const metadata = { title: "Meet Aly \u00b7 Alyeska" };

/**
 * The first screen a brand-new primary sees, before the family form.
 *
 * Introduces Aly in her own voice, shows a live side-by-side demonstration
 * of the one thing she does that a search box cannot -- give different
 * answers to different families -- and offers a small "ask her something
 * else" box that runs the same demonstration on the primary's own
 * question, live, against two stand-in families.
 *
 * The auth callback routes an empty household here instead of straight to
 * /welcome; the button on this screen takes the primary onward to /welcome
 * to fill in the family form.
 *
 * Somebody who has already filled in the welcome form (they have travelers
 * or a home) is redirected onward -- this is a first-run screen only, and
 * arriving here later would put a "meet Aly" moment on the far side of
 * every trip they had already planned. The practice hub can be used to
 * revisit it from /interview-check/meet-aly.
 */
export default async function MeetAlyPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/meet-aly");
  const access = await resolveAccess(supabase, user);
  if (access?.can?.isSecondary) redirect("/trips");
  if (!access?.familyId) redirect("/welcome");

  // If they already filled the welcome form, this first-run intro screen
  // is no longer first-run. Send them onward using the same shape /welcome
  // uses to decide the same thing.
  const [{ data: family }, { count: peopleCount }] = await Promise.all([
    supabase
      .from("families")
      .select("home_address")
      .eq("id", access.familyId)
      .maybeSingle(),
    supabase
      .from("travelers")
      .select("id", { count: "exact", head: true })
      .eq("family_id", access.familyId)
      .eq("is_person", true),
  ]);
  const alreadyStarted = Boolean(family?.home_address) || (peopleCount || 0) > 0;
  if (alreadyStarted) redirect("/family");

  return (
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
      <MeetAlyClient />
    </main>
  );
}
