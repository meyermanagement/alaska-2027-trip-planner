import { FAULT_KIND, SHOT_BUCKET, guessRoute } from "@/lib/feedback/shared";

/**
 * Turning stored rows into an issue somebody can read.
 *
 * Shared by the beta desk and the issue log rather than written twice: the log
 * is the long version of the same rows, and the two drifting apart is how a
 * screenshot link ends up expiring on one page and not the other.
 *
 * Everything here assumes a service-role client. The feedback table has no read
 * policy for one person to see another's report, which is the point of it.
 */

/**
 * How long a picture's link is good for. Long enough to read the log, short
 * enough that a copied address is useless by the time it is pasted anywhere --
 * a screenshot of a bug is quite often also a screenshot of a passport number.
 */
export const SHOT_LINK_SECONDS = 60 * 60;

/** The columns the log needs. Kept in one place so the two pages agree. */
export const ISSUE_COLUMNS =
  "id, ref, created_at, email, kind, body, path, trip_id, skin, viewport, user_agent, build, trail, shots, status, route, maybe_fixed, seen_count, last_at, detail";

/**
 * Which build is running right now, so a report filed against an older one can
 * say so. This is the same stamp the report itself was written with, which is
 * what makes the comparison mean anything.
 */
export function currentBuild() {
  return (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    ""
  ).slice(0, 12);
}

/**
 * Every kind of report, ready to read: the trip named rather than numbered, the
 * browser shortened to the part that matters, every picture turned into a link
 * that expires within the hour, and a suggested way to fix it for the rows
 * nobody has judged.
 */
export async function readIssues(admin, rows, { build = "" } = {}) {
  if (!rows?.length) return [];

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
    ref: one.ref || null,
    at: whenPlainly(one.created_at),
    lastAt: one.last_at ? whenPlainly(one.last_at) : null,
    email: one.email,
    kind: one.kind,
    body: one.body,
    path: one.path,
    tripName: one.trip_id ? tripNames.get(one.trip_id) || null : null,
    skin: one.skin,
    viewport: one.viewport,
    build: one.build || null,
    // A report filed on a build that is no longer the one running may already
    // have been fixed by whatever shipped in between. It is a hint, not an
    // answer, and it is only worth saying when both stamps exist.
    oldBuild: Boolean(build && one.build && one.build !== build),
    browser: shortBrowser(one.user_agent),
    trail: Array.isArray(one.trail)
      ? one.trail
          .map((step) => step?.what)
          .filter(Boolean)
          .slice(0, 6)
      : [],
    shots: (one.shots || []).map((key) => links.get(key)).filter(Boolean),
    status: one.status || "new",
    route: one.route || null,
    guess: guessRoute(one),
    maybeFixed: Boolean(one.maybe_fixed),
    seenCount: one.seen_count || 1,
    source: one.kind === FAULT_KIND ? one.detail?.source || "script" : null,
    stack: one.detail?.stack || null,
    thrownAt: one.detail?.at || null,
  }));
}

export function whenPlainly(value) {
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
export function shortBrowser(raw) {
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
