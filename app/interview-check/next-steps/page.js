import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import NextStepsChecklist from "@/components/NextStepsChecklist";

export const metadata = { title: "Practice: next steps · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The after-welcome next-steps screen, rehearsed. The real version is
 * `/welcome/next-steps`; this is the same component with a different
 * continue label and destination, so the primary can look at what a
 * new family sees without leaving the practice hub.
 */
export default async function InterviewCheckNextStepsPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/next-steps");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  // No TopBar here on purpose. The real /welcome/next-steps is a walkthrough
  // step with no menu and no Ask Aly button; the practice copy has to feel
  // like the same screen, so the NavTabs disc and the Ask Aly button stay
  // off. The "Back to practice" link at the bottom is the way out.
  return (
    <>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
        <h1 className="font-display text-3xl font-semibold">
          Practice: three things worth doing next
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          A new family sees this screen once, right after Favorite moments.
          Nothing on it is actionable -- it is telling them what is worth doing
          before their first trip. This is that same screen; the button just
          drops you back into practice.
        </p>

        <div className="mt-6">
          <NextStepsChecklist
            continueLabel="Back to practice"
            onContinue={null}
            eyebrow=""
          />
          <div className="mt-6">
            <Link href="/interview-check" className="btn btn-ghost">
              Back to practice
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
