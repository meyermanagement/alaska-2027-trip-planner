import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { midOnboarding } from "@/lib/auth/landing";
import PledgeBody from "@/components/PledgeBody";
import TopBar from "@/components/TopBar";

export const metadata = { title: "Our Pledge · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * Our Pledge.
 *
 * Three promises, each in the app's own voice and each the reason the app is
 * built the way it is. No bias in the recommendations, no selling anybody's
 * information, and no paid slots dressed up as suggestions. Under them, past a
 * rule, the two commitments the company makes about itself: how Aly is allowed to
 * use AI, and the share of revenue that goes to conservation.
 *
 * Deliberately a plain content page: no forms, no toggles, nothing to press.
 * The point is that a family can look at what they're getting from the app
 * and know why it feels different from a travel site.
 *
 * The words themselves live in lib/pledge.js and are drawn by PledgeBody,
 * because Meet Aly opens the same three promises in a panel before a family has
 * agreed to anything, and a promise that reads two ways is not one.
 *
 * Public, for the same reason the policy and the terms are. This page was behind
 * the login until September 16, 2026, which meant the promises the app is built
 * around could only be read by somebody who had already agreed to everything --
 * and could not be read at all by a tester who declined. The menu is drawn only
 * for a signed-in household, so a stranger reading this gets the page and none
 * of the app's chrome.
 */
export default async function PledgePage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  const chrome = user ? !(await midOnboarding(supabase, user.id)) : false;

  return (
    <>
      {chrome ? (
        <TopBar />
      ) : (
        /* The same marker the policy sets: keep the report flag and its
           positioning rule off a page a stranger may be reading with no
           account. */
        <div data-quiet-chrome="1" hidden />
      )}
      <main className="screen px-5 pb-16 pt-7">
        <p className="section-label">What we promise</p>
        <h1 className="mt-1 mb-3 font-display text-3xl font-semibold">
          Our Pledge
        </h1>
        <PledgeBody />
      </main>
    </>
  );
}
