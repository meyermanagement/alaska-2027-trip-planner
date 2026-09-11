import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import MeetAlyPracticeClient from "./MeetAlyPracticeClient";

export const metadata = { title: "Meet Aly \u00b7 Alyeska" };

/**
 * The Meet Aly intro, mounted for the practice hub.
 *
 * The Meet Aly component itself never reads the primary's file. It says what
 * Aly looks after, and the live answer behind each of those lines comes from a
 * demo endpoint working off a stand-in family. So nothing
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
    <main className="mx-auto max-w-3xl px-5 pb-16 pt-7">
      <MeetAlyPracticeClient />
    </main>
  );
}
