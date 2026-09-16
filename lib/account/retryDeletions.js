// Finishing a deletion that stopped halfway, without the person who asked for it.
//
// The deletion route does the work while the tester is on the screen, and if a
// step fails it writes why into the receipt and says so. That was the whole of it
// until now, which meant a deletion could fail and then simply sit there: the
// receipt had a null completed_at, nothing ever read the row again, and the only
// person who knew was the one who had already closed the tab. This stopped being
// hypothetical on September 15, when the first real attempt failed exactly that
// way.
//
// So this is the second half of the promise. Once a night, every open receipt
// older than an hour is run again from the ledger row alone -- no session, no
// browser, nothing but user_id, family_id and scope. After three attempts
// somebody is emailed, once, because a row that has failed three times is not
// going to fix itself on the fourth.
//
// Every step is written to survive having already happened. A retry is by
// definition running against a job that got part of the way, so "the household is
// already gone" and "the auth user is already gone" are successes here, not
// errors. That is what makes it safe to run every night against the same row.

import { sweepFolder, removeAll } from "@/lib/account/storage";
import { anonymizeReports } from "@/lib/account/reports";
import { sendEmail } from "@/lib/email/send";

// How long an open receipt is left alone before it is treated as stuck. Long
// enough that a deletion still in flight is never fought over, short enough that
// a failure is picked up on the next nightly pass rather than the one after.
export const STALL_HOURS = 1;

// Attempts before somebody is told. The first is the route's own run, so this is
// the original failure plus two retries.
export const ALERT_AFTER = 3;

// A pass takes at most this many rows. A backlog is a bigger problem than a slow
// queue, and a nightly job that tries two hundred deletions in one request is one
// that gets killed halfway through the hundredth.
export const BATCH = 25;

export const ALERT_TO = process.env.SUPPORT_EMAIL || "admin@alyeska.app";

/**
 * Run one open receipt to completion, from the ledger row alone.
 *
 * @param {object} input
 * @param {object} input.admin    service-role client
 * @param {object} input.request  a deletion_requests row
 * @returns {Promise<{ok: boolean, objectsRemoved: number, storageErrors: Array, note: string|null}>}
 */
export async function finishDeletion({ admin, request }) {
  const userId = request.user_id;
  const familyId = request.family_id || null;
  const household = request.scope === "household" && familyId;
  const storageErrors = [];
  const notes = [];

  // Paths first, while there is still anything to read them from. On a retry the
  // rows may already be gone, in which case this returns nothing and the folder
  // sweep below is the only source -- which is exactly the case this has to
  // handle, because the files are what a half-finished deletion leaves behind.
  const byBucket = { documents: [], "feedback-shots": [], "trip-covers": [] };
  const { data: paths, error: pathError } = await admin.rpc(
    "account_deletion_paths",
    { p_family: household ? familyId : null, p_user: userId },
  );
  if (pathError) {
    notes.push(`paths: ${pathError.message}`);
  }
  for (const row of paths || []) {
    if (byBucket[row.bucket]) byBucket[row.bucket].push(row.path);
  }

  if (household) {
    byBucket.documents.push(
      ...(await sweepFolder(admin, "documents", familyId)),
    );
    byBucket["trip-covers"].push(
      ...(await sweepFolder(admin, "trip-covers", familyId)),
    );
  }

  // The reports outlive the account, with the person taken out of them. Before
  // the login goes, same as the route, and for the same reason: once user_id is
  // set to null there is no owner left to find these rows by. On a retry whose
  // first run already deleted the login, the address on this receipt is the only
  // handle left, which is why it is passed.
  const scrub = await anonymizeReports({
    admin,
    userId,
    email: request.user_email || "",
  });
  if (!scrub.ok) {
    notes.push(`feedback: ${scrub.message}`);
    return {
      ok: false,
      objectsRemoved: 0,
      storageErrors,
      note: notes.join("; "),
    };
  }

  // Live access before stored data, same order as the route: a calendar feed
  // token is a URL somebody's calendar app polls and it answers without a
  // session, so it must stop working before anything else is touched.
  if (household) {
    await admin.from("calendar_feeds").delete().eq("family_id", familyId);
    await admin.from("push_subscriptions").delete().eq("family_id", familyId);
  }

  try {
    await admin.auth.admin.signOut(userId, "global");
  } catch {
    // The user row is about to go, which invalidates every token anyway. On a
    // retry the user may not exist at all, and that is a success here.
  }

  if (household) {
    const { error } = await admin.from("families").delete().eq("id", familyId);
    // A household that is already gone is the outcome this wants. Only a real
    // failure to delete one that is still there is worth reporting.
    if (error) {
      notes.push(`families: ${error.message}`);
      return {
        ok: false,
        objectsRemoved: 0,
        storageErrors,
        note: notes.join("; "),
      };
    }
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  // "User not found" is what a retry sees when the first run got this far, and it
  // is a success. Anything else is not.
  if (authError && !isMissingUser(authError)) {
    notes.push(`auth: ${authError.message}`);
    return {
      ok: false,
      objectsRemoved: 0,
      storageErrors,
      note: notes.join("; "),
    };
  }

  // Files last, because a failure here must not leave the data behind. An
  // orphaned object in a private bucket with no row naming it is a smaller
  // problem than a household that thinks it is deleted and is not.
  let removed = 0;
  for (const [bucket, list] of Object.entries(byBucket)) {
    if (!list.length) continue;
    const result = await removeAll(admin, bucket, list);
    removed += result.removed;
    storageErrors.push(...result.errors);
  }

  return {
    ok: true,
    objectsRemoved: removed,
    storageErrors,
    note: notes.length ? notes.join("; ") : null,
  };
}

function isMissingUser(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.status === 404 ||
    message.includes("user not found") ||
    message.includes("not found")
  );
}

/**
 * The nightly pass: every open receipt older than an hour, run again.
 *
 * @param {object} input
 * @param {object} input.supabase  service-role client
 * @param {Date} [input.now]
 * @param {string} [input.source]
 * @returns {Promise<{ok: boolean, considered: number, finished: number, stillOpen: number, alerted: number, rows: Array}>}
 */
export async function retryOpenDeletions({
  supabase,
  now = new Date(),
  source = "cron",
} = {}) {
  const stalled = new Date(
    now.getTime() - STALL_HOURS * 60 * 60 * 1000,
  ).toISOString();

  const { data: open, error } = await supabase
    .from("deletion_requests")
    .select(
      "id, user_id, user_email, family_id, scope, requested_at, attempts, last_attempt_at, alerted_at, note",
    )
    .is("completed_at", null)
    .lt("requested_at", stalled)
    .order("requested_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    return {
      ok: false,
      considered: 0,
      finished: 0,
      stillOpen: 0,
      alerted: 0,
      error: error.message,
      rows: [],
    };
  }

  const rows = [];
  let finished = 0;
  let alerted = 0;

  for (const request of open || []) {
    // A row tried within the last hour is left alone even if it was requested
    // days ago: two passes fighting over the same deletion is worse than waiting.
    if (
      request.last_attempt_at &&
      new Date(request.last_attempt_at).getTime() > new Date(stalled).getTime()
    ) {
      rows.push({ id: request.id, skipped: "tried recently" });
      continue;
    }

    const attempts = Number(request.attempts || 0) + 1;
    let outcome;
    try {
      outcome = await finishDeletion({ admin: supabase, request });
    } catch (e) {
      outcome = {
        ok: false,
        objectsRemoved: 0,
        storageErrors: [],
        note: String(e?.message || e),
      };
    }

    const patch = {
      attempts,
      last_attempt_at: new Date().toISOString(),
      note: outcome.note || null,
    };
    if (outcome.ok) {
      patch.completed_at = new Date().toISOString();
      patch.objects_removed = outcome.objectsRemoved;
      patch.storage_errors = outcome.storageErrors.length
        ? outcome.storageErrors
        : null;
      finished += 1;
    }

    await supabase.from("deletion_requests").update(patch).eq("id", request.id);

    // Told once, not every night. A stuck row that emails somebody daily is a row
    // whose emails stop being read.
    if (!outcome.ok && attempts >= ALERT_AFTER && !request.alerted_at) {
      const sent = await alert({ request, attempts, note: outcome.note });
      if (sent) {
        await supabase
          .from("deletion_requests")
          .update({ alerted_at: new Date().toISOString() })
          .eq("id", request.id);
        alerted += 1;
      }
    }

    rows.push({
      id: request.id,
      attempts,
      ok: outcome.ok,
      note: outcome.note || null,
      objectsRemoved: outcome.objectsRemoved,
    });
  }

  const stillOpen = rows.filter((r) => r.ok === false).length;
  return {
    ok: true,
    considered: (open || []).length,
    finished,
    stillOpen,
    alerted,
    source,
    rows,
  };
}

/**
 * The email somebody gets when a deletion will not finish.
 *
 * Deliberately thin on detail: it names the request and the household by id, not
 * by the person's trips or documents, because an alert about failing to delete
 * somebody's data should not be a copy of that data sitting in an inbox.
 */
async function alert({ request, attempts, note }) {
  const subject = `Deletion request ${request.id} has failed ${attempts} times`;
  const lines = [
    `A deletion has not completed after ${attempts} attempts.`,
    ``,
    `Request: ${request.id}`,
    `Requested: ${request.requested_at}`,
    `Scope: ${request.scope}`,
    `Household: ${request.family_id || "none"}`,
    `Account: ${request.user_id}`,
    `Last error: ${note || "not recorded"}`,
    ``,
    `The 30-day promise in the privacy policy is running against this row. It needs finishing by hand.`,
  ];
  try {
    const result = await sendEmail({
      to: ALERT_TO,
      subject,
      text: lines.join("\n"),
    });
    return Boolean(result?.ok);
  } catch {
    return false;
  }
}
