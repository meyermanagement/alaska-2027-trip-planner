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
 * Only primaries; a secondary who wanders here goes to Family. A family
 * with no trips at all still sees the ask-a-question moment.
 */
export default async function AfterInterviewPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/after-interview");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/family");

  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-7">
      <AfterInterviewClient />
    </main>
  );
}
