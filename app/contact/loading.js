import { cookies } from "next/headers";
import { AGREEMENT_VERSION } from "@/lib/beta/agreement";
import { CONSENT_COOKIE, consentCookieSatisfies } from "@/lib/beta/consent";
import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// Contact is a short form -- a subject line, a message area, an email that
// prefills from the sign-in address, a Send button. The skeleton stands in
// for exactly that shape so the frame does not blink out on the way from
// the menu.
//
// Signed out there is no form to stand in for: the page gives an address to
// write to, because the send route refuses without a session. So the skeleton
// promises a small card instead of a large one, and no menu. Both guesses come
// off the consent cookie the middleware already left, which costs no database
// reads -- see the same reasoning in app/privacy/loading.js.
export default async function LoadingContact() {
  const jar = await cookies();
  const consented = consentCookieSatisfies(
    jar.get(CONSENT_COOKIE)?.value,
    AGREEMENT_VERSION,
  );

  return (
    <PageSkeleton chrome={consented} label="Loading the contact form">
      <TitleBlock />
      <div className="mt-6 card space-y-4 p-5" aria-hidden="true">
        {consented ? (
          <>
            <div className="space-y-2">
              <Bar className="h-4 w-20" />
              <Bar className="h-10 w-full rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Bar className="h-4 w-24" />
              <Bar className="h-32 w-full rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Bar className="h-4 w-16" />
              <Bar className="h-10 w-full max-w-sm rounded-2xl" />
            </div>
            <Bar className="h-9 w-28" />
          </>
        ) : (
          <>
            <Bar className="h-4 w-40" />
            <Bar className="h-4 w-56" />
            <Bar className="h-3 w-full max-w-sm" />
          </>
        )}
      </div>
      <div className="mt-8 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-2/3 max-w-sm" />
      </div>
    </PageSkeleton>
  );
}
