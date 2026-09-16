import { cookies } from "next/headers";
import { AGREEMENT_VERSION } from "@/lib/beta/agreement";
import { CONSENT_COOKIE, consentCookieSatisfies } from "@/lib/beta/consent";
import PageSkeleton, {
  Bar,
  CardBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

// Pledge is a plain content page: a section label, a title, an intro
// paragraph, then three promise cards on the same rounded card the real page
// uses. Three cards, not four -- No bias, No selling your information, No ads.
export default async function LoadingPledge() {
  // Draw the menu only if it will still be there when the page arrives. This
  // page went public on September 16, 2026, and the skeleton did not notice: a
  // stranger reading our promises got a full app menu for one frame and then
  // watched it disappear. Same guess the privacy policy makes, and same reason
  // it is a cookie rather than a query -- this frame is meant to cost no
  // database reads. The page itself decides for real.
  const jar = await cookies();
  const consented = consentCookieSatisfies(
    jar.get(CONSENT_COOKIE)?.value,
    AGREEMENT_VERSION,
  );

  return (
    <PageSkeleton chrome={consented} label="Loading our pledge">
      <TitleBlock />
      <div className="mt-6 space-y-4" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <CardBlock key={i} lines={3} />
        ))}
      </div>
      <div className="mt-8 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-3/4 max-w-sm" />
      </div>
    </PageSkeleton>
  );
}
