import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { midOnboarding } from "@/lib/auth/landing";
import TopBar from "@/components/TopBar";
import { LegalHeader, LegalSections } from "@/components/LegalProse";
import { DATA_CATEGORIES, PRIVACY_VERSION } from "@/lib/beta/agreement";
import {
  AI_SECTION,
  ASSISTANTS_SECTION,
  CONTROLLER,
  NEVER,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  PROCESSORS,
} from "@/lib/privacy";

export const metadata = {
  title: "Privacy Policy · Alyeska",
  description:
    "What Alyeska collects, who else ever sees it, how long it is kept, and what you can make us do about it.",
};
export const dynamic = "force-dynamic";

/**
 * The privacy policy, on a URL that answers without a session.
 *
 * Both stores require the policy to be readable by a reviewer who has no account
 * and may be in another country, so unlike every other page in the app this one
 * does not redirect to /login and does not need a household to render. The
 * session is read for one reason only: to decide whether to draw the menu, so a
 * signed-in family arriving from Settings can get back out again, while a
 * reviewer arriving cold sees the document and nothing else.
 *
 * The words are in lib/privacy.js and the seven categories are the same array
 * the consent gate draws, imported rather than restated. A policy that disagrees
 * with the screen a tester agreed on is the one failure this page exists to
 * prevent, and the only way to guarantee it cannot happen is to have one copy.
 */
export default async function PrivacyPage() {
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
          label="How we handle your information"
          title="Privacy Policy"
          intro={PRIVACY_INTRO}
          facts={[
            { label: "Effective", value: PRIVACY_VERSION },
            { label: "From", value: CONTROLLER.name },
          ]}
        />

        <section className="mt-7">
          <h2 className="font-display text-lg font-semibold text-ink">
            What we never do
          </h2>
          <ul className="mt-2 space-y-2">
            {NEVER.map((line) => (
              <li
                key={line}
                className="border-l-2 border-[var(--color-teal)] pl-3 text-sm leading-relaxed text-ink-soft"
              >
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-lg font-semibold text-ink">
            What we collect and why
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Seven kinds of information. These are the same seven a beta tester
            reads before the app opens.
          </p>
          <div className="mt-4 space-y-3">
            {DATA_CATEGORIES.map((category) => (
              <div key={category.id} className="card rounded-2xl p-4">
                <h3 className="font-display text-base font-semibold text-ink">
                  {category.title}
                </h3>
                <dl className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">
                      What{" "}
                    </dt>
                    <dd className="inline">{category.what}</dd>
                  </div>
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">
                      Why{" "}
                    </dt>
                    <dd className="inline">{category.why}</dd>
                  </div>
                  <div>
                    <dt className="inline text-xs uppercase tracking-wide">
                      Kept{" "}
                    </dt>
                    <dd className="inline">{category.kept}</dd>
                  </div>
                </dl>
                {category.review ? (
                  <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                    Readable by us during the beta, to find what is broken.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-lg font-semibold text-ink">
            {AI_SECTION.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {AI_SECTION.body}
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            {AI_SECTION.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-lg font-semibold text-ink">
            {ASSISTANTS_SECTION.heading}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {ASSISTANTS_SECTION.body}
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            {ASSISTANTS_SECTION.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        <section className="mt-7">
          <h2 className="font-display text-lg font-semibold text-ink">
            Everyone else who touches it
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            The companies that run the parts of the app we do not run ourselves.
            None of them is allowed to use your information for anything except
            the job named beside them.
          </p>
          <div className="mt-4 space-y-3">
            {PROCESSORS.map((processor) => (
              <div key={processor.name} className="card rounded-2xl p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h3 className="font-display text-base font-semibold text-ink">
                    {processor.name}
                  </h3>
                  <p className="text-xs text-ink-soft">{processor.where}</p>
                </div>
                <p className="mt-1 text-xs uppercase tracking-wide text-ink-soft">
                  {processor.role}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {processor.sends}
                </p>
              </div>
            ))}
          </div>
        </section>

        <LegalSections sections={PRIVACY_SECTIONS} />

        <p className="mt-8 border-t border-line pt-6 text-sm text-ink-soft">
          <Link href="/beta-terms" className="underline">
            Beta terms
          </Link>{" "}
          carry the liability, feedback, and confidentiality sections.{" "}
          <Link href="/security" className="underline">
            Reporting a security problem
          </Link>{" "}
          is where to send a way past a permission, and what we do about it.
        </p>
      </main>
    </>
  );
}
