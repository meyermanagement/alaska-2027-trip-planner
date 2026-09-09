import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import AfterInterviewClient from "./AfterInterviewClient";

export const metadata = { title: "What Aly did with all this \u00b7 Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The final onboarding screen for a primary.
 *
 * Runs after the interview proof and shows two things: what Aly already
 * put on the family's real upcoming trips, and one open-ended prompt so
 * the primary can ask Aly a real question and see a grounded answer on
 * their own family before they land in the app proper. Continue lands
 * them at the trip index.
 *
 * Only primaries; a secondary who wanders here goes to Family.
 *
 * Whether there are any trips is settled here rather than in the client,
 * because it decides the headline. Onboarding never creates a trip -- the
 * welcome chain collects the family and then runs the interview -- so a
 * family that signed up today arrives with an empty calendar, and a screen
 * that opens with "here's what Aly already put on your trips" and corrects
 * itself a second later is worse than one that was right to begin with.
 */
export default async function AfterInterviewPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/after-interview");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/family");

  // Any trip at all, not just an upcoming one: a family whose only trip has
  // already happened has still used the app, and telling them there is nothing
  // on the calendar would be wrong.
  const { count } = await supabase
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("family_id", access.familyId);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-7">
      <AfterInterviewClient hasTrips={(count || 0) > 0} />
    </main>
  );
}
