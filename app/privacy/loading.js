import { cookies } from "next/headers";
import { AGREEMENT_VERSION } from "@/lib/beta/agreement";
import { CONSENT_COOKIE, consentCookieSatisfies } from "@/lib/beta/consent";
import PageSkeleton, {
  Bar,
  CardBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

// A long document: title, a run of prose, then the cards that carry the seven
// data categories. Three cards rather than seven, because the skeleton is a
// promise that something is coming, not a count of it.
export default async function LoadingPrivacy() {
  // Draw the bar only if it will still be there once the page arrives, so it
  // does not appear for a moment and then get taken away. The page decides for
  // real -- see midOnboarding in lib/auth/landing.js -- but that answer costs
  // database reads and this frame is meant to cost none, so the guess is the
  // cookie middleware already left behind. It is the one that matters: a tester
  // who has not cleared the consent gate is a tester reading this document from
  // inside it, and the gate is the only place in the walkthrough that links
  // here. Somebody between the gate and the end of the introduction would still
  // see the bar flicker, if they found a way to this page at all.
  const jar = await cookies();
  const consented = consentCookieSatisfies(
    jar.get(CONSENT_COOKIE)?.value,
    AGREEMENT_VERSION,
  );

  return (
    <PageSkeleton chrome={consented} label="Loading the privacy policy">
      <TitleBlock />
      <div className="mt-6 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-2/3 max-w-sm" />
      </div>
      <div className="mt-8 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <CardBlock key={i} lines={3} />
        ))}
      </div>
    </PageSkeleton>
  );
}
