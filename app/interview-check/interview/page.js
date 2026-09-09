import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { INTERVIEW_QUESTIONS } from "@/lib/travelers/interview";
import { personalizationContext } from "@/lib/travelers/interviewPersonalize";
import {
  resolveStandIn,
  standInPetsRows,
  standInTravelers,
} from "@/lib/practice/standIn";
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

  // The reason chips name the family -- the children by name, the animals by
  // name, "you and Steph" when there are two adults -- and a rehearsal must not
  // name the real one. It used to read the travelers and pets tables here,
  // which meant somebody who had just invented a family on the practice
  // welcome screen walked into an interview talking about their actual
  // children, and the whole point of the rehearsal is to show what the
  // questions do with the family you typed.
  //
  // So this renders the built-in stand-in family, and the body swaps in
  // whatever the practice run holds once it is mounted and can reach
  // sessionStorage. Either way no real name reaches this screen.
  //
  // No writes happen here; the About-you priors banner is deliberately not
  // wired through the practice path because seeing "you mentioned this" on a
  // rehearsal that saves nothing would confuse more than help.
  const standIn = resolveStandIn(null);
  const context = personalizationContext({
    travelers: standInTravelers(standIn),
    pets: standInPetsRows(standIn),
  });

  return (
    <InterviewBody
        mode="practice"
        startSlot={INTERVIEW_QUESTIONS[0].slot}
        startIndex={0}
        total={INTERVIEW_QUESTIONS.length}
        context={context}
      aboutMePriors={{}}
    />
  );
}
