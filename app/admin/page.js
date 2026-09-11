import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminEmail } from "@/lib/auth/admin";
import { funnel, perPerson, questionDwell } from "@/lib/usage/metrics";
import { stepLabel } from "@/lib/usage/steps";
import TopBar from "@/components/TopBar";
import AdminBody from "./AdminBody";

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

export default async function AdminPage() {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login?next=/admin");
  if (!isAdminEmail(user.email)) notFound();

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
          windowDays={WINDOW_DAYS}
        />
      </>
    );
  }

  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [{ data: codeRows }, { data: eventRows }, { data: accounts }] =
    await Promise.all([
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

  return (
    <>
      <TopBar />
      <AdminBody
        codes={codes}
        steps={funnel(events)}
        questions={questionDwell(events)}
        testers={testers}
        windowDays={WINDOW_DAYS}
      />
    </>
  );
}
