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
 * Somebody invited into a family that already exists sees this screen too.
 * They are as new to the app as the person who created the household, so
 * they are introduced before being asked anything, and the button carries
 * them to their own file at /welcome/about-you rather than to the family
 * form they have no business filling in.
 *
 * Anybody who has already been welcomed is redirected onward -- this is a
 * first-run screen only, and arriving here later would put a "meet Aly"
 * moment on the far side of every trip they had already planned. The
 * practice hub can be used to revisit it from /interview-check/meet-aly.
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
  const [{ data: family }, { count: peopleCount }, { data: mySeat }] =
    await Promise.all([
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
      // The caller's own seat. An unstamped welcomed_at means this person has
      // never been walked through the app, whatever state the household is
      // in -- which is exactly the invited case, where the family is full of
      // people and trips already but none of it was set up by them.
      supabase
        .from("travelers")
        .select("id, welcomed_at")
        .eq("family_id", access.familyId)
        .eq("user_id", user.id)
        .eq("is_person", true)
        .maybeSingle(),
    ]);

  // Somebody joining an existing family carries on to their own file. There
  // is no family form for them to fill in, so sending them to /welcome would
  // ask them to re-describe a household somebody else already described.
  const invited = Boolean(mySeat?.id) && !mySeat.welcomed_at;

  const alreadyStarted =
    Boolean(family?.home_address) || (peopleCount || 0) > 0;
  if (alreadyStarted && !invited) redirect("/family");

  return (
    <main className="screen px-5 pb-16 pt-7">
      <MeetAlyClient next={invited ? "/welcome/about-you" : "/welcome"} />
    </main>
  );
}
