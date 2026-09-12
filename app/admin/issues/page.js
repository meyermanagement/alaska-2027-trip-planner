import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import TopBar from "@/components/TopBar";
import { ISSUE_COLUMNS, currentBuild, readIssues } from "@/lib/feedback/desk";
import IssueLog from "./IssueLog";

export const metadata = { title: "Issue log · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * Every report, on a page of its own.
 *
 * Split off the beta desk because it is the one part that grows without limit:
 * codes and funnels stay about the same size all beta, and reports do not. The
 * desk keeps the count and the way in.
 *
 * Gated the same way as the desk, and for the same reason: anybody not on the
 * allowlist gets the not-found page a misspelt URL would give them, because a
 * 403 tells a stranger there is something here worth coming back for. The route
 * that writes to these rows checks for itself as well.
 */

// Well past a beta's worth. Newest first, so the ceiling cuts the oldest rather
// than whatever happens to be least interesting.
const CEILING = 500;

export default async function IssuesPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <>
        <TopBar />
        <IssueLog issues={[]} />
      </>
    );
  }

  const build = currentBuild();
  const { data: rows } = await admin
    .from("feedback")
    .select(ISSUE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(CEILING);

  const issues = await readIssues(admin, rows || [], { build });

  return (
    <>
      <TopBar />
      <IssueLog issues={issues} build={build} />
    </>
  );
}
