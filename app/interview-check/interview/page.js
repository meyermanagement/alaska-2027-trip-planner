import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import { INTERVIEW_QUESTIONS } from "@/lib/travelers/interview";
import InterviewBody from "../../interview/InterviewBody";

export const metadata = { title: "Practice interview · Alyeska" };

/**
 * The nine-question interview, answered by the primary, saving nothing.
 *
 * Same screen as /interview -- one question at a time, the Compass loader
 * between them, the primary picking one of two options or typing their own --
 * but the answers accumulate in local state and the recap at the end says
 * what WOULD have been saved. Reached from the practice hub at
 * /interview-check.
 */
export default async function InterviewCheckInterviewPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/interview");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <>
      <TopBar />
      <InterviewBody
        mode="practice"
        startSlot={INTERVIEW_QUESTIONS[0].slot}
        startIndex={0}
        total={INTERVIEW_QUESTIONS.length}
      />
    </>
  );
}
