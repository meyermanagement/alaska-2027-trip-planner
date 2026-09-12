import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isTesterAccount } from "@/lib/beta/tester";
import TopBar from "@/components/TopBar";
import Survey from "./Survey";

export const metadata = { title: "Beta survey · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The beta survey.
 *
 * Not a form that gets filled in once and sent. It is a sheet that belongs to
 * the tester for the length of the beta: they answer what they have an opinion
 * about the week they start, and come back after their first real trip to change
 * the price they named and rate the parts they had not opened yet. So every
 * field saves itself, the answers are read back into the page every visit, and
 * the button at the bottom only marks it as worth another read.
 *
 * Only for people in the beta, and gated here as well as in the menu -- a row
 * that is hidden is not a door that is locked, and this address is guessable.
 *
 * The first read happens here rather than in the browser, so the page arrives
 * with the answers already in it. Opening a survey you spent an hour on and
 * seeing every box empty for half a second is the moment you stop believing it
 * saved anything.
 */
export default async function SurveyPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/survey");

  const tester = await isTesterAccount(supabase, user);
  if (!tester) redirect("/trips");

  const { data } = await supabase
    .from("beta_survey_responses")
    .select("answers, submitted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <p className="section-label">While we are still building it</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">
          Beta survey
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          Answer what you have an opinion about and leave the rest. Every box
          saves itself, so you can close this and come back after your next trip
          and change your mind about any of it — including the price.
        </p>

        <div className="mt-7">
          <Survey
            initialAnswers={data?.answers || {}}
            initialSubmittedAt={data?.submitted_at || null}
          />
        </div>

        <p className="mt-8 text-xs leading-relaxed text-ink-soft">
          Only we read these answers. Nobody else in your household can see your
          sheet, and nothing you write here shows up anywhere in the app.
        </p>
      </main>
    </>
  );
}
