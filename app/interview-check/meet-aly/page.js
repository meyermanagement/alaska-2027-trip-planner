import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import MeetAlyPracticeClient from "./MeetAlyPracticeClient";

export const metadata = { title: "Meet Aly \u00b7 Alyeska" };

/**
 * The Meet Aly intro, mounted for the practice hub.
 *
 * The Meet Aly component itself has always run against a pair of stand-in
 * families rather than the primary's file -- the live side-by-side and
 * the ask-her-something-else box both hit a demo endpoint. So nothing
 * about this screen needs to be forked for practice; only the continue
 * button changes destination, so it takes the primary back to the
 * practice hub rather than onward to the family form.
 */
export default async function InterviewCheckMeetAlyPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/meet-aly");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
        <MeetAlyPracticeClient />
      </main>
    </>
  );
}
