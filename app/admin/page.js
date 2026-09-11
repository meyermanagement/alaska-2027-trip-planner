import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { funnel, perPerson, questionDwell } from "@/lib/usage/metrics";
import { stepLabel } from "@/lib/usage/steps";
import TopBar from "@/components/TopBar";
import AdminBody from "./AdminBody";
import { FAULT_KIND, SHOT_BUCKET } from "@/lib/feedback/shared";

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
// A beta's worth of reports. Newest first, so the ceiling cuts off the oldest.
const REPORT_CEILING = 60;
// How long a picture's link is good for. Long enough to read the desk, short
// enough that a copied address is useless by the time it is pasted anywhere.
const SHOT_LINK_SECONDS = 60 * 60;

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
          reports={[]}
          faults={[]}
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
      .select(
        "id, created_at, email, kind, body, path, trip_id, skin, viewport, user_agent, build, trail, shots, status, seen_count, last_at, detail",
      )
      .order("created_at", { ascending: false })
      .limit(REPORT_CEILING),
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

  const written = await readReports(
    admin,
    (reportRows || []).filter((one) => one.kind !== FAULT_KIND),
  );
  const faults = readFaults(
    (reportRows || []).filter((one) => one.kind === FAULT_KIND),
  );

  return (
    <>
      <TopBar />
      <AdminBody
        codes={codes}
        reports={written}
        faults={faults}
        steps={funnel(events)}
        questions={questionDwell(events)}
        testers={testers}
        windowDays={WINDOW_DAYS}
      />
    </>
  );
}

/**
 * The reports, ready to read: the trip named rather than numbered, the browser
 * shortened to the part that matters, and every picture turned into a link that
 * expires within the hour.
 */
async function readReports(admin, rows) {
  if (!rows.length) return [];

  const tripIds = [...new Set(rows.map((one) => one.trip_id).filter(Boolean))];
  const tripNames = new Map();
  if (tripIds.length) {
    const { data: trips } = await admin
      .from("trips")
      .select("id, name")
      .in("id", tripIds);
    for (const trip of trips || []) tripNames.set(trip.id, trip.name);
  }

  const keys = rows.flatMap((one) => one.shots || []);
  const links = new Map();
  if (keys.length) {
    const { data: signed } = await admin.storage
      .from(SHOT_BUCKET)
      .createSignedUrls(keys, SHOT_LINK_SECONDS);
    for (const one of signed || []) {
      if (one?.path && one?.signedUrl) links.set(one.path, one.signedUrl);
    }
  }

  return rows.map((one) => ({
    id: one.id,
    at: whenPlainly(one.created_at),
    email: one.email,
    kind: one.kind,
    body: one.body,
    path: one.path,
    tripName: one.trip_id ? tripNames.get(one.trip_id) || null : null,
    skin: one.skin,
    viewport: one.viewport,
    build: one.build,
    browser: shortBrowser(one.user_agent),
    trail: Array.isArray(one.trail)
      ? one.trail
          .map((step) => step?.what)
          .filter(Boolean)
          .slice(0, 6)
      : [],
    shots: (one.shots || []).map((key) => links.get(key)).filter(Boolean),
    status: one.status || "new",
  }));
}

/**
 * A fault, ready to recognize. No pictures and no trail on these -- what a
 * fault needs is what it said, how often, and where it was thrown from.
 */
function readFaults(rows) {
  return rows.map((one) => ({
    id: one.id,
    at: whenPlainly(one.created_at),
    lastAt: one.last_at ? whenPlainly(one.last_at) : null,
    seenCount: one.seen_count || 1,
    source: one.detail?.source || sourceFromBody(one),
    email: one.email,
    body: one.body,
    path: one.path,
    skin: one.skin,
    viewport: one.viewport,
    build: one.build,
    browser: shortBrowser(one.user_agent),
    stack: one.detail?.stack || null,
    thrownAt: one.detail?.at || null,
    status: one.status || "new",
  }));
}

// Faults written before the source was stored, and any row whose detail lost it,
// still read sensibly: an answer with a status code in it was a broken call.
function sourceFromBody(row) {
  const call = row.detail?.call || "";
  return call ? "call" : "script";
}

function whenPlainly(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A user-agent string is 150 characters of history nobody needs. What matters
 * for a bug report is which browser on which kind of device, so that is all
 * that is kept.
 */
function shortBrowser(raw) {
  const text = String(raw || "");
  if (!text) return null;
  const device = /iPhone/.test(text)
    ? "iPhone"
    : /iPad/.test(text)
      ? "iPad"
      : /Android/.test(text)
        ? "Android"
        : /Macintosh/.test(text)
          ? "Mac"
          : /Windows/.test(text)
            ? "Windows"
            : null;
  const browser = /Edg\//.test(text)
    ? "Edge"
    : /OPR\//.test(text)
      ? "Opera"
      : /Chrome\//.test(text)
        ? "Chrome"
        : /Firefox\//.test(text)
          ? "Firefox"
          : /Safari\//.test(text)
            ? "Safari"
            : null;
  return [browser, device].filter(Boolean).join(" on ") || null;
}
