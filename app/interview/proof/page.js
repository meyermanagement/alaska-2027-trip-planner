import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import ProofClient from "./ProofClient";

export const metadata = { title: "See what changed \u00b7 Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The interview-proof screen. Landed on directly after the interview
 * finishes. Aly answers one real question about the family's next
 * upcoming trip twice: once with the family's interview answers folded
 * in, and once as if she knew nothing. Both are shown side by side.
 *
 * The point is that the interview earns itself on the primary's own
 * trip, right after they answered it, so "your preferences have been
 * saved" is proven by the recommendation changing in front of them
 * rather than trusted from a toast.
 *
 * Only primaries reach this route -- a secondary who arrives here is
 * sent to Family, matching the interview screen's own gate.
 */
export default async function ProofPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview/proof");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/family");

  // The proof step is only useful when there is a real trip to anchor on
  // AND the primary has actually finished the interview (otherwise Aly's
  // "with preferences" answer would be identical to the "without" one).
  // The client handles the "no trip yet" case by naming "your next trip"
  // and showing a friendlier caveat, but a family with zero interview
  // answers is sent onward to next-steps instead of into a blank demo.
  const { count: prefCount } = await supabase
    .from("travel_preferences")
    .select("id", { count: "exact", head: true })
    .eq("family_id", access.familyId)
    .in("source", ["interview", "interview_extract", "interview_promoted"]);
  if ((prefCount || 0) === 0) redirect("/welcome/after-interview");

  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-7">
      <ProofClient />
    </main>
  );
}
