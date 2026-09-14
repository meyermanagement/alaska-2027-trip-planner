import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import BetaConsentFlow from "../../welcome/beta/BetaConsentFlow";

export const metadata = { title: "Beta consent \u00b7 Alyeska" };

/**
 * The six consent screens, rehearsed, writing nothing.
 *
 * The real /welcome/beta cannot be revisited. It reads the consent row, and
 * anybody whose consent is current -- which is everybody already testing,
 * including whoever is reading this -- is sent straight back out through
 * /auth/land. That is correct for the real gate and it left the first screens a
 * tester ever sees as the only ones nobody could look at twice, short of bumping
 * AGREEMENT_VERSION in production and reopening the gate for every tester at
 * once to check a comma.
 *
 * So this mounts the same component with practice=true. Every screen, every
 * checkbox, the scroll gate on the agreement, the AI question with no default:
 * all of it is the real thing, because the point of rehearsing paperwork is to
 * read it at the size and in the order a tester reads it. Only the write at the
 * end is gone, replaced by the row it would have written.
 *
 * Nothing is passed for `gap` or `existing`, on purpose. A rehearsal should
 * start where a brand-new tester starts -- nothing pre-agreed, nothing
 * pre-ticked, no note about a version having moved -- rather than where this
 * particular primary happens to stand.
 *
 * Primary only, like the rest of the hub, and for the same reason: the real
 * version of this screen is walked by whoever holds the account.
 */
export default async function InterviewCheckBetaPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/beta");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <main className="screen px-5 pb-16 pt-7">
      <BetaConsentFlow
        gap={null}
        email={user.email || ""}
        existing={null}
        practice
      />
    </main>
  );
}
