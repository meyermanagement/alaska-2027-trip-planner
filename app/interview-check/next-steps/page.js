import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { inboxAddressFor } from "@/lib/inbox/address";
import NextStepsChecklist from "@/components/NextStepsChecklist";

export const metadata = { title: "Next steps · Alyeska" };
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

  // The real address, on the practice copy too. Practice never writes, and
  // reading the family's own forwarding address writes nothing -- while a
  // stand-in address here would be the one thing on this screen somebody
  // might actually copy down, and it would not work.
  const { data: household } = await supabase
    .from("families")
    .select("inbox_local_part")
    .eq("id", access.familyId)
    .maybeSingle();

  // No TopBar here on purpose. The real /welcome/next-steps is a walkthrough
  // step with no menu and no Ask Aly button; the practice copy has to feel
  // like the same screen, so the NavTabs disc and the Ask Aly button stay
  // off. The "Back to practice" link at the bottom is the way out.
  return (
    <>
      <main className="mx-auto max-w-2xl px-5 pb-16 pt-7">
        <NextStepsChecklist
          continueLabel="Back to practice"
          onContinue={null}
          eyebrow=""
          inboxAddress={inboxAddressFor(household?.inbox_local_part)}
        />
        <div className="mt-6">
          <Link href="/interview-check" className="btn btn-ghost">
            Back to practice
          </Link>
        </div>
      </main>
    </>
  );
}
