import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { inboxAddressFor } from "@/lib/inbox/address";
import { loadSetupState } from "@/lib/setup/state";
import { todayISO } from "@/lib/reminders";
import NextStepsBody from "./NextStepsBody";

export const metadata = { title: "Four things worth doing next · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The last screen of the first-login walkthrough.
 *
 * Comes after the interview proof. Purely informational: four things worth
 * doing before or during a first trip -- the rest of the family's own words,
 * Wallet, forwarding, past trips -- with a compass mark orienting into place
 * for each row. Nothing here is required and nothing is written; the button
 * hands the family off to the trip builder, which is where the proof screen
 * used to go directly.
 *
 * It sat at the end of the invited-member walk until now, which was the wrong
 * end of the app. All four rows are the household owner's work, and the guard
 * below turned a secondary away from the screen regardless -- so the rows that
 * survived pointed an invited member at a Family tab they cannot open. On this
 * path the reader is the owner and every row is theirs to do.
 *
 * Deliberately does not check welcomed_at, so this page also serves as the
 * reference version reachable from the practice hub. A refresh from either
 * surface shows the same screen.
 */
export default async function WelcomeNextStepsPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/welcome/next-steps");
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId) redirect("/welcome");
  if (access?.can?.isSecondary) redirect("/trips");

  // The forwarding row shows the family's own address, so it has to be read
  // here. A family that predates the auto-generating trigger could have none,
  // which the checklist handles by falling back to the general sentence.
  const [{ data: household }, { count: trips }, setup] = await Promise.all([
    supabase
      .from("families")
      .select("inbox_local_part")
      .eq("id", access.familyId)
      .maybeSingle(),
    // Whether this household has any trip at all. It decides which screen the
    // button is an escape from: a family who has just finished the interview is
    // on their way to a first trip, and a family who came back here from the
    // menu six weeks later wants to be put back where they were.
    supabase.from("trips").select("id", { count: "exact", head: true }),
    // Which of the four are already behind them, so a revisit says where they
    // got to rather than asking for all four again. Null once the household has
    // finished or dismissed setting up, and the screen then reads as the
    // reference version it also serves as from the practice hub.
    loadSetupState(supabase, {
      familyId: access.familyId,
      travelerId: access.travelerId,
      today: todayISO(),
      secondary: false,
    }),
  ]);

  const returning = (trips || 0) > 0;

  return (
    <main className="screen px-5 pb-16 pt-7">
      <NextStepsBody
        /* First time through, the trip builder: this screen sits at the end of
           the walkthrough and the family has no trip yet. On a revisit from the
           menu it is the way back to the trips they came from -- "take me to the
           trip builder" is an odd thing to be offered six weeks in by somebody
           who only wanted to see what was left. */
        nextHref={returning ? "/trips" : "/trips/new"}
        continueLabel={returning ? "Back to my trips" : undefined}
        eyebrow={returning ? "Finishing setting up" : undefined}
        intro={
          returning
            ? "Anything still without a tick is worth doing when you have a minute. Each one makes my answers fit your family better."
            : undefined
        }
        done={setup?.done || []}
        inboxAddress={inboxAddressFor(household?.inbox_local_part)}
      />
    </main>
  );
}
