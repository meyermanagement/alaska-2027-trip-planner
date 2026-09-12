import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { funnel, perPerson, questionDwell } from "@/lib/usage/metrics";
import { stepLabel } from "@/lib/usage/steps";
import TopBar from "@/components/TopBar";
import AdminBody from "./AdminBody";
import { FAULT_KIND } from "@/lib/feedback/shared";
import { answeredCount, medianDollars } from "@/lib/beta/survey";

export const metadata = { title: "Beta desk · Alyeska" };
export const dynamic = "force-dynamic";

/**
 * The beta desk: one screen for handing out the way in and watching what happens
 * next.
 *
 * Not linked from the menu and not discoverable. Anybody who is not on the
 * allowlist gets the same not-found page they would get for a misspelt URL,
 * because a 403 tells a stranger that there is something here worth coming back
 * for. The routes behind it check for themselves as well; this gate hides the
 * screen, it does not protect the data.
 *
 * Everything is read with the service-role key. That is unusual in this app and
 * deliberate here: the codes table has no policy that lets one signed-in person
 * see another's code, and usage_events has no read policy at all. Nobody can
 * pull either through the ordinary client, which is the point.
 */

// A month. Long enough to see a beta's shape, short enough that the page stays
// one query rather than a paginated report.
const WINDOW_DAYS = 30;
const EVENT_CEILING = 6000;
// The desk counts the reports and links to them; the reading happens on the
// issue log, which is its own page because it is the one part of this screen
// that grows without limit.
const REPORT_CEILING = 500;

export default async function AdminPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  // Both refusals are the same refusal on purpose. A redirect to sign in would
  // tell a stranger that this path exists and is worth coming back to with a
  // session; a plain not found says only what every unrouted path says. The
  // owner reaches it by signing into the app first, the way they already are.
  if (!isAdminUser(user)) notFound();

  const admin = createAdminClient();
  if (!admin) {
    return (
      <>
        <TopBar />
        <AdminBody
          keyMissing
          codes={[]}
          steps={[]}
          questions={[]}
          testers={[]}
          issues={null}
          survey={null}
          windowDays={WINDOW_DAYS}
        />
      </>
    );
  }

  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: codeRows },
    { data: eventRows },
    { data: accounts },
    { data: reportRows },
    { data: surveyRows },
  ] = await Promise.all([
    admin
      .from("signup_codes")
      .select(
        "code, family_name, note, created_at, expires_at, used_by, used_at, used_family_id, assigned_email, assigned_name, assigned_at, sent_at, send_count",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("usage_events")
      .select("user_id, family_id, kind, step, path, ms, at, meta")
      .gte("at", since)
      .order("at", { ascending: false })
      .limit(EVENT_CEILING),
    // One page of accounts is plenty for a beta and saves a lookup per row.
    admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    admin
      .from("feedback")
      .select("kind, status, seen_count, maybe_fixed, route")
      .order("created_at", { ascending: false })
      .limit(REPORT_CEILING),
    // Read with the service key for the same reason as everything else here:
    // a survey sheet is readable by the person who wrote it and by nobody
    // else, which is what makes it worth writing honestly.
    admin
      .from("beta_survey_responses")
      .select("answers, submitted_at, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  const events = eventRows || [];
  const people = new Map(
    (accounts?.users || []).map((one) => [
      one.id,
      {
        email: one.email || null,
        lastSignInAt: one.last_sign_in_at || null,
        createdAt: one.created_at || null,
      },
    ]),
  );

  const trails = new Map(perPerson(events).map((one) => [one.userId, one]));

  // What the desk shows per code: who it went to, whether they spent it, and if
  // they did, whether they have actually been in the app since.
  const codes = (codeRows || []).map((row) => {
    const account = row.used_by ? people.get(row.used_by) : null;
    const trail = row.used_by ? trails.get(row.used_by) : null;
    return {
      code: row.code,
      note: row.note,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      assignedEmail: row.assigned_email,
      assignedName: row.assigned_name,
      assignedAt: row.assigned_at,
      sentAt: row.sent_at,
      sendCount: row.send_count || 0,
      usedAt: row.used_at,
      accountEmail: account?.email || null,
      lastSignInAt: account?.lastSignInAt || null,
      furthest: trail?.furthest ? stepLabel(trail.furthest) : null,
      lastPath: trail?.lastPath || null,
      lastSeenAt: trail?.lastAt || null,
      views: trail?.views || 0,
    };
  });

  // Everybody with an account, whether or not their code is still on file --
  // including the accounts that predate the desk.
  const testers = [...people.entries()]
    .map(([id, account]) => {
      const trail = trails.get(id);
      return {
        email: account.email,
        createdAt: account.createdAt,
        lastSignInAt: account.lastSignInAt,
        furthest: trail?.furthest ? stepLabel(trail.furthest) : null,
        lastPath: trail?.lastPath || null,
        lastSeenAt: trail?.lastAt || null,
        views: trail?.views || 0,
      };
    })
    .sort((a, b) =>
      String(b.lastSignInAt || "").localeCompare(String(a.lastSignInAt || "")),
    );

  const issues = countIssues(reportRows || []);
  const survey = countSurvey(surveyRows || []);

  return (
    <>
      <TopBar />
      <AdminBody
        codes={codes}
        issues={issues}
        survey={survey}
        steps={funnel(events)}
        questions={questionDwell(events)}
        testers={testers}
        windowDays={WINDOW_DAYS}
      />
    </>
  );
}

/**
 * What the desk says about the survey without drawing it.
 *
 * The price is the number worth carrying up to the desk, because it is the one
 * answer that decides something outside the app. Kept as a median rather than a
 * mean on purpose: a beta is small enough that one person answering "$300"
 * because they read the question as a year would move an average by more than
 * everybody else's honest answers put together.
 *
 * Sent and still being written are counted apart, and both are shown. A sheet
 * somebody is halfway through is not half a data point -- the price question is
 * near the end, so the sheets in progress are exactly the ones whose numbers are
 * missing, and knowing how many there are is how you tell a quiet beta from an
 * unfinished one.
 */
function countSurvey(rows) {
  const sent = rows.filter((one) => one.submitted_at);
  const answers = rows.map((one) => one.answers || {});
  return {
    total: rows.length,
    sent: sent.length,
    writing: rows.length - sent.length,
    // Only sheets with something in them, so an account that opened the page
    // once and left does not read as an opinion.
    started: answers.filter((one) => answeredCount(one) > 0).length,
    fair: medianDollars(answers.map((one) => one.price_fair)),
    tooMuch: medianDollars(answers.map((one) => one.price_too_much)),
    lastAt: rows[0]?.updated_at || null,
  };
}

/**
 * What the desk says about the log without drawing it: how much is in there,
 * how much has not been looked at, and how much of it the app reported on
 * itself. Everything else about a report is on the log's own page.
 */
function countIssues(rows) {
  const written = rows.filter((one) => one.kind !== FAULT_KIND);
  const faults = rows.filter((one) => one.kind === FAULT_KIND);
  return {
    total: rows.length,
    waiting: rows.filter((one) => (one.status || "new") === "new").length,
    written: written.length,
    faults: faults.length,
    times: faults.reduce((sum, one) => sum + (one.seen_count || 1), 0),
    talk: rows.filter(
      (one) => one.route === "talk" && (one.status || "new") !== "fixed",
    ).length,
    maybeFixed: rows.filter((one) => one.maybe_fixed).length,
  };
}
