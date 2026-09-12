import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import TopBar from "@/components/TopBar";
import SurveySheets from "./SurveySheets";

export const metadata = { title: "Beta survey · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * Every survey sheet, on a page of its own.
 *
 * Split off the beta desk for the same reason the issue log was: the desk keeps
 * the count and the way in, and the answers themselves are twenty-six questions
 * a tester long, which is more than a summary line can hold and more than the
 * desk should have to scroll past.
 *
 * Gated the same way as the desk. Anybody not on the allowlist gets the
 * not-found page a misspelt URL would give them, because a 403 tells a stranger
 * there is something here worth coming back for.
 *
 * The answers arrive without a name on them: the survey table stores a user id,
 * because it is a foreign key to the account and nothing else. So the sheets are
 * matched to email addresses here, from the auth directory, and a row whose
 * account has since been deleted still shows -- as an unnamed sheet rather than
 * disappearing, because a deleted tester's opinion is still an opinion.
 */

// Room for a beta several times over. Ordered by the last touch, so the ceiling
// cuts the sheets nobody has come back to rather than whichever the database
// happened to hand back first.
const CEILING = 400;

// One page of the auth directory. A beta is tens of accounts, not thousands, and
// paging through the whole directory to name a dozen sheets would be four round
// trips to save one.
const DIRECTORY_PAGE = 200;

export default async function SurveyPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <>
        <TopBar />
        <SurveySheets sheets={[]} keyMissing />
      </>
    );
  }

  const [{ data: rows }, directory] = await Promise.all([
    admin
      .from("beta_survey_responses")
      .select("user_id, answers, submitted_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(CEILING),
    admin.auth.admin.listUsers({ page: 1, perPage: DIRECTORY_PAGE }),
  ]);

  const emails = new Map(
    (directory?.data?.users || []).map((one) => [one.id, one.email]),
  );

  const sheets = (rows || []).map((row) => ({
    email: emails.get(row.user_id) || "an account since deleted",
    answers: row.answers || {},
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
  }));

  return (
    <>
      <TopBar />
      <SurveySheets sheets={sheets} />
    </>
  );
}
