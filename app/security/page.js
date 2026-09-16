import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { midOnboarding } from "@/lib/auth/landing";
import TopBar from "@/components/TopBar";
import { LegalHeader, LegalSections } from "@/components/LegalProse";
import { CONTROLLER } from "@/lib/privacy";
import {
  SECURITY_EMAIL,
  SECURITY_INTRO,
  SECURITY_REVIEWED,
  SECURITY_SECTIONS,
} from "@/lib/security";

export const metadata = {
  title: "Reporting a security problem · Alyeska",
  description:
    "How to tell Alyeska about a security problem, what we do about it, and what we promise in return.",
};
export const dynamic = "force-dynamic";

/**
 * Where a security report goes.
 *
 * Public for the same reason the privacy policy is: the person most likely to
 * need it has no account with us, and a reporting address that can only be found
 * from inside the app is an address that does not exist. So this page renders
 * without a session, and the menu is drawn only for a signed-in household who
 * arrived here from Contact us.
 *
 * The words are in lib/security.js. This page is the frame around them, built
 * with the same two components the policy and the terms use, because a commitment
 * about our own conduct should look as serious as the documents beside it.
 */
export default async function SecurityPage() {
  const supabase = await createClient();
  const me = await whoIs(supabase);
  const chrome = me ? !(await midOnboarding(supabase, me.id)) : false;

  return (
    <>
      {chrome ? (
        <TopBar />
      ) : (
        /* Same marker the policy sets: keep the report flag and its positioning
           rule off a page a stranger may be reading with no account. */
        <div data-quiet-chrome="1" hidden />
      )}
      <main
        className="mx-auto w-full px-5 pb-16 pt-7"
        style={{ maxWidth: "42rem" }}
      >
        <LegalHeader
          label="Telling us something is wrong"
          title="Reporting a security problem"
          intro={SECURITY_INTRO}
          facts={[
            { label: "Reviewed", value: SECURITY_REVIEWED },
            { label: "From", value: CONTROLLER.name },
          ]}
        />

        <section className="mt-7">
          <h2 className="font-display text-lg font-semibold text-ink">
            The address
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            <a
              className="font-mono text-ink underline decoration-ink-faint underline-offset-2"
              href={`mailto:${SECURITY_EMAIL}?subject=Security%20report`}
            >
              {SECURITY_EMAIL}
            </a>
          </p>
        </section>

        <LegalSections sections={SECURITY_SECTIONS} />

        <section className="mt-9 border-t border-line pt-5">
          <p className="text-xs leading-relaxed text-ink-soft">
            What we hold and how long we hold it is in the{" "}
            <Link className="underline underline-offset-2" href="/privacy">
              privacy policy
            </Link>
            . Anything that is not a security problem — something broken, or
            something the app should do and does not — is better sent through{" "}
            <Link className="underline underline-offset-2" href="/contact">
              Contact us
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
