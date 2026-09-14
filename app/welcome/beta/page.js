import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isTesterAccount } from "@/lib/beta/tester";
import { consentGap, readConsent } from "@/lib/beta/consent";
import BetaConsentFlow from "./BetaConsentFlow";

export const metadata = { title: "Before you start \u00b7 Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The gate every beta tester walks through once, between signing in and meeting
 * Aly.
 *
 * It sits ahead of the introduction rather than after it because of what the
 * introduction does: Meet Aly's demonstration is a live model call, and asking
 * permission to send text to a third-party model after having already sent some
 * is not asking. So the order is sign in, agree, then the walkthrough that was
 * always there -- Meet Aly, the family form, About you, the interview.
 *
 * Chromeless, like its four siblings in this folder. No menu, no Ask Aly, no tip
 * strip: there is exactly one thing to do on this screen and every other control
 * on it would be a way of not doing it.
 *
 * Two ways to arrive. A tester who has never agreed gets the full set of screens.
 * A tester whose agreement went out of date -- the version constants in
 * lib/beta/agreement.js moved -- gets told which part changed and walks the same
 * screens with their old answers already filled in, because making somebody
 * re-read eleven sections to accept a new retention period is how a consent
 * screen teaches people to press Continue without looking.
 *
 * Anybody whose consent is current is sent back through /auth/land, which asks
 * the landing question again and puts them wherever they should have been.
 */
export default async function BetaConsentPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect(`/login?next=/welcome/beta`);

  const existing = await readConsent(supabase, user.id);
  const gap = consentGap(existing);
  if (!gap) redirect("/auth/land");

  // Somebody who is not in the beta has no beta terms to accept, and putting a
  // liability waiver in front of a general-release account would be the wrong
  // screen rather than a strict one. The gate in middleware asks the same
  // question, so this is the belt to that pair of braces.
  // Out through the route rather than straight to /trips: a server component
  // cannot set a cookie, and without the cookie middleware sends them back here
  // on the next navigation forever. The route does the same check again before it
  // writes anything.
  const tester = await isTesterAccount(supabase, user);
  if (!tester) redirect("/api/beta/not-in-beta");

  return (
    <main className="screen px-5 pb-16 pt-7">
      <BetaConsentFlow
        gap={gap}
        email={user.email || ""}
        existing={
          existing
            ? {
                features: existing.features || {},
                aiProcessing: Boolean(existing.ai_processing),
                diagnostics: existing.diagnostics !== false,
                sharingAcknowledged: Boolean(existing.sharing_acknowledged),
                acceptedAt: existing.accepted_at || null,
              }
            : null
        }
      />
    </main>
  );
}
