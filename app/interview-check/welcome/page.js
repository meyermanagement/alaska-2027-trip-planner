import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import AlyIntro from "@/components/AlyIntro";
import WelcomeForm from "../../welcome/WelcomeForm";

export const metadata = { title: "Welcome · Alyeska" };

/**
 * The welcome form, rehearsed by the primary, saving nothing.
 *
 * The real /welcome sends anybody who has already filled it in to /family --
 * which is right for the real screen and wrong for practice, because it
 * means somebody with a family already set up can never look at the form
 * again. Here we mount the same component with practice=true: every field
 * is present, the button says "Show what would save", and pressing it
 * produces a plain recap of the home, people and animals it would have
 * written. Nothing reaches the database and the family screen is not touched.
 */
export default async function InterviewCheckWelcomePage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/interview-check/welcome");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access.level !== PRIMARY) redirect("/trips");

  return (
    <main className="screen px-5 pb-16 pt-7">
      <AlyIntro />
      <WelcomeForm
        familyId={access.familyId}
        myName={access.travelerName || ""}
        myUserId={user.id}
        myEmail={user.email || ""}
        practice
      />
    </main>
  );
}
