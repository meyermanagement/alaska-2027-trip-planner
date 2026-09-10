import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { inboxAddressFor } from "@/lib/inbox/address";
import NextStepsBody from "./NextStepsBody";

export const metadata = { title: "Four things worth doing next · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The last screen of the first-login walkthrough.
 *
 * Comes after Favorite moments. Purely informational: four things worth doing
 * before or during a first trip -- the rest of the family's own words, Wallet,
 * forwarding, past trips -- with a
 * compass mark orienting into place for each row. Nothing here is required
 * and nothing is written; the button hands the family off to the trip builder,
 * which is where the old flow went straight from moments.
 *
 * Deliberately does not check welcomed_at, so this page also serves as the
 * reference version reachable from the practice hub. A refresh from either
 * surface shows the same screen.
 */
export default async function WelcomeNextStepsPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/next-steps");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access?.can?.isSecondary) redirect("/trips");

  // The forwarding row shows the family's own address, so it has to be read
  // here. A family that predates the auto-generating trigger could have none,
  // which the checklist handles by falling back to the general sentence.
  const { data: household } = await supabase
    .from("families")
    .select("inbox_local_part")
    .eq("id", access.familyId)
    .maybeSingle();

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
      <NextStepsBody
        nextHref="/trips"
        inboxAddress={inboxAddressFor(household?.inbox_local_part)}
      />
    </main>
  );
}
