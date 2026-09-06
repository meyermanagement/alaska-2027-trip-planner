import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import { INTERVIEW_QUESTIONS } from "@/lib/travelers/interview";
import InterviewBody from "../interview/InterviewBody";

export const metadata = { title: "Practice interview · Alyeska" };

/**
 * The interview, answered by the primary, saving nothing.
 *
 * Same screen as /interview -- one question at a time, the Compass loader
 * between them, the primary picking one of two options or typing their own --
 * but the answers accumulate in local state and the recap at the end says what
 * WOULD have been saved. That way somebody rehearsing can judge the questions
 * and the writes side by side without spending their real file to find out
 * that the third one was wrong.
 *
 * Only the primary can rehearse: the real interview is theirs to run, so a
 * practice one for anybody else would be practicing something they will not
 * do. A secondary who reaches this URL is sent back to Trips with no note --
 * the URL is a rehearsal utility, not a public page.
 */
export default async function InterviewCheckPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check");
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
