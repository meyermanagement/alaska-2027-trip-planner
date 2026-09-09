import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import { INTERVIEW_QUESTIONS } from "@/lib/travelers/interview";
import { personalizationContext } from "@/lib/travelers/interviewPersonalize";
import InterviewBody from "../../interview/InterviewBody";

export const metadata = { title: "Interview · Alyeska" };

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

  // Practice mode reads the same names as real mode so the reason chips look
  // like the ones the primary will see when they take the real interview.
  // No writes happen here; the About-you priors banner is deliberately not
  // wired through the practice path because seeing "you mentioned this" on a
  // rehearsal that saves nothing would confuse more than help.
  const [{ data: travelers }, { data: pets }] = await Promise.all([
    supabase
      .from("travelers")
      .select("id, name, is_person, date_of_birth, access_level")
      .eq("family_id", access.familyId)
      .eq("is_person", true),
    supabase.from("pets").select("id, name, species").eq("family_id", access.familyId),
  ]);
  const context = personalizationContext({
    travelers: travelers || [],
    pets: pets || [],
  });

  return (
    <>
      <TopBar />
      <InterviewBody
        mode="practice"
        startSlot={INTERVIEW_QUESTIONS[0].slot}
        startIndex={0}
        total={INTERVIEW_QUESTIONS.length}
        context={context}
        aboutMePriors={{}}
      />
    </>
  );
}
