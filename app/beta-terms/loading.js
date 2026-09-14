import { cookies } from "next/headers";
import { AGREEMENT_VERSION } from "@/lib/beta/agreement";
import { CONSENT_COOKIE, consentCookieSatisfies } from "@/lib/beta/consent";
import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// All prose, no cards: the terms are a run of headed paragraphs, so the skeleton
// is a title and four blocks of lines rather than anything framed.
export default async function LoadingBetaTerms() {
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
    <PageSkeleton chrome={consented} label="Loading the beta terms">
      <TitleBlock />
      <div className="mt-6 space-y-6" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <Bar className="h-4 w-40" />
            <Bar className="h-3 w-full max-w-md" />
            <Bar className="h-3 w-3/4 max-w-sm" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
