import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { midOnboarding } from "@/lib/auth/landing";
import TopBar from "@/components/TopBar";
import { LegalHeader, LegalSections } from "@/components/LegalProse";
import {
  AGREEMENT,
  AGREEMENT_VERSION,
  APP_BUILD,
  BETA_ENDS,
} from "@/lib/beta/agreement";
import { TERMS_AFTER, TERMS_BEFORE, TERMS_INTRO } from "@/lib/beta/terms";

export const metadata = {
  title: "Beta Terms · Alyeska",
  description:
    "The terms of taking part in the Alyeska beta: liability, feedback, confidentiality, and how to leave.",
};
export const dynamic = "force-dynamic";

/**
 * The beta agreement on a public URL, for the two people who need it there: a
 * store reviewer with no account, and a tester who has already accepted and
 * wants to reread what they accepted without walking back through a gate.
 *
 * The thirteen sections in the middle are the same array the gate scrolls, which
 * is the only thing about this page that matters. A public terms page written
 * separately from the one a tester agreed to is two agreements, and only one of
 * them is enforceable. So AGREEMENT is imported, the version is printed at the
 * top, and lib/beta/terms.js supplies only the framing around it.
 */
export default async function BetaTermsPage() {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  // Drawn for a signed-in person who has finished being walked in, and for
  // nobody else. A reviewer with no account sees the document alone, and so
  // does a tester who arrived here from the consent gate -- see midOnboarding.
  const chrome = me ? !(await midOnboarding(supabase, me.id)) : false;

  return (
    <>
      {chrome ? (
        <TopBar />
      ) : (
        /* Tells the two things the layout hangs over every screen -- the report
           flag, and the stylesheet rule that positions it -- to stay away. The
           layout cannot ask this question itself: it renders once for every page
           and reads nothing from the database on purpose. A marker in the
           document is how a page tells it, the same way the flag already finds
           the menu bar by looking for [data-navbar]. */
        <div data-quiet-chrome="1" hidden />
      )}
      {/* Its own width rather than the app's `screen`, and deliberately. `screen`
          is 60rem because it is sized for trip cards and lists; a paragraph set
          across the whole of it runs to about 150 characters, which is roughly
          twice what anybody reads comfortably. The width is inline rather than a
          class because the app shell carries `.app-shell > * { max-width: 100% }`
          late in the stylesheet, which beats any width utility on equal
          specificity. A document nobody finishes is a disclosure nobody made. */}
      <main
        className="mx-auto w-full px-5 pb-16 pt-7"
        style={{ maxWidth: "42rem" }}
      >
        <LegalHeader
          label="Taking part in the beta"
          title="Beta Terms"
          intro={TERMS_INTRO}
          facts={[
            { label: "Version", value: AGREEMENT_VERSION },
            { label: "Build", value: APP_BUILD },
            { label: "Ends", value: BETA_ENDS },
          ]}
        />

        <LegalSections sections={TERMS_BEFORE} />

        <div className="mt-8 border-t border-line pt-2">
          <p className="section-label mt-5">What you agree to</p>
          <LegalSections sections={AGREEMENT} />
        </div>

        <div className="mt-8 border-t border-line pt-2">
          <p className="section-label mt-5">The rest of it</p>
          <LegalSections sections={TERMS_AFTER} />
        </div>

        <p className="mt-8 border-t border-line pt-6 text-sm text-ink-soft">
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>{" "}
          says what is collected, who receives it, and how long it is kept.
        </p>
      </main>
    </>
  );
}
