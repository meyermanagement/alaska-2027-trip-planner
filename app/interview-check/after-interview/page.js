import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import AfterInterviewClient from "../../welcome/after-interview/AfterInterviewClient";

export const metadata = {
  title: "After the interview \u00b7 Alyeska",
};

/**
 * The final onboarding moment, mounted for the practice hub.
 *
 * The real /welcome/after-interview screen paints a per-trip note from
 * Aly and gives the primary one open-ended question box. In practice,
 * the same client is mounted with demo=true, so both endpoints (trip
 * notes and ask-once) answer against a stand-in family instead of the
 * primary's real preferences. Continue lands back at the practice hub.
 */
export default async function InterviewCheckAfterInterviewPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/after-interview");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <main className="mx-auto max-w-4xl px-5 pb-16 pt-7">
      <AfterInterviewClient demo backHref="/interview-check" />
    </main>
  );
}
