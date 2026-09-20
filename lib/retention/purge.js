// The promises about how long things last, performed.
//
// Three lines in the privacy policy said data goes away on a schedule, and until
// now nothing on the server did anything about them. These are those lines, each
// one job, each one writing down what it did:
//
//   * Forwarded originals   30 days  -- the stored mail is discarded
//   * Conversations with Aly 90 days -- the messages are deleted
//   * Diagnostics            90 days -- the usage events are deleted
//   * Code attempts          30 days -- the ledger of invite-code tries is deleted
//
// Two rules run through all three. First, a pass always writes a row, even when
// it deleted nothing: "there was nothing old enough" and "the job never ran" are
// the same silence otherwise, and only one of them is fine. Second, one job
// failing must not stop the others -- a broken conversation purge is not a reason
// for diagnostics to be kept forever -- so each is caught on its own and the pass
// reports every outcome.
//
// The cutoffs live here as named constants rather than inline numbers because the
// policy text and the code have to be able to be read against each other.

import { purgeCompletedHistory } from "./history.js";

export const INBOX_ORIGINAL_DAYS = 30;
export const CONVERSATION_DAYS = 90;
export const DIAGNOSTICS_DAYS = 90;
export const COMPLETED_HISTORY_DAYS = 90;
// The throttle only ever looks back a day. Everything older is kept for a month
// so a burst can be investigated after the weekend, and no longer: a record of
// who typed which wrong code is not worth holding once it can no longer answer a
// question.
export const CODE_ATTEMPT_DAYS = 30;

// A pass deletes at most this many rows per job. A first run against a database
// that has been collecting for a year should not be one enormous statement that
// times out halfway and leaves nobody able to say what happened; it should be a
// bite, recorded, with the rest taken tomorrow. The ledger shows when a job is
// hitting the ceiling, which is the signal to run it more often.
export const BATCH = 2000;

export const INBOX_ORIGINALS = "inbox-originals";
export const CONVERSATIONS = "aly-conversations";
export const DIAGNOSTICS = "diagnostics";
export const CODE_ATTEMPTS = "code-attempts";
export const PARENT_VIEW_SECURITY = "parent-view-security";
export const COMPLETED_HISTORY = "completed-history";

export const JOBS = [
  INBOX_ORIGINALS,
  CONVERSATIONS,
  DIAGNOSTICS,
  CODE_ATTEMPTS,
  PARENT_VIEW_SECURITY,
  COMPLETED_HISTORY,
];

/**
 * The cutoff for a job: the moment before which everything is in scope.
 *
 * @param {string} job
 * @param {Date} [now]
 * @returns {Date}
 */
export function cutoffFor(job, now = new Date()) {
  const days =
    job === INBOX_ORIGINALS
      ? INBOX_ORIGINAL_DAYS
      : job === CONVERSATIONS
        ? CONVERSATION_DAYS
        : job === COMPLETED_HISTORY
          ? COMPLETED_HISTORY_DAYS
        : job === CODE_ATTEMPTS || job === PARENT_VIEW_SECURITY
          ? CODE_ATTEMPT_DAYS
          : DIAGNOSTICS_DAYS;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * Forwarded originals, at 30 days.
 *
 * The row survives on purpose and the stored mail does not. A tester has to be
 * able to see that a confirmation arrived and where it went, and the booking read
 * out of it lives on the trip; what the policy promises to discard is the copy of
 * the mail itself. So this nulls the body, the HTML, and the parse error -- which
 * can quote the mail back in its text -- and stamps the row so the app can tell a
 * discarded original from a message that never had one.
 */
async function purgeInboxOriginals({ supabase, cutoff }) {
  const { data: due, error: readError } = await supabase
    .from("inbox_messages")
    .select("id")
    .lt("received_at", cutoff.toISOString())
    .is("original_purged_at", null)
    .limit(BATCH);
  if (readError) throw new Error(readError.message);

  const ids = (due || []).map((r) => r.id);
  if (!ids.length) return { scanned: 0, purged: 0 };

  const { error: writeError } = await supabase
    .from("inbox_messages")
    .update({
      text_body: null,
      html_body: null,
      parse_error: null,
      original_purged_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (writeError) throw new Error(writeError.message);

  return { scanned: ids.length, purged: ids.length };
}

/**
 * Conversations with Aly, at 90 days.
 *
 * Deleted outright, both sides of them: the question and the answer are the same
 * conversation and keeping half of it would be a strange thing to promise. Trips,
 * bookings, and anything Aly wrote onto the household's own records are untouched
 * -- those are the household's data, not the transcript.
 */
async function purgeConversations({ supabase, cutoff }) {
  const { data: due, error: readError } = await supabase
    .from("chat_messages")
    .select("id")
    .lt("created_at", cutoff.toISOString())
    .limit(BATCH);
  if (readError) throw new Error(readError.message);

  const ids = (due || []).map((r) => r.id);
  if (!ids.length) return { scanned: 0, purged: 0 };

  const { error: writeError } = await supabase
    .from("chat_messages")
    .delete()
    .in("id", ids);
  if (writeError) throw new Error(writeError.message);

  return { scanned: ids.length, purged: ids.length };
}

/**
 * Diagnostics, at 90 days.
 *
 * The usage ledger is how the beta answers "did the model actually get called",
 * which is worth having and is not worth having forever. The switch that stops it
 * being written is a separate matter; this is the promise that what was written
 * does not last.
 */
async function purgeDiagnostics({ supabase, cutoff }) {
  const { data: due, error: readError } = await supabase
    .from("usage_events")
    .select("id")
    .lt("at", cutoff.toISOString())
    .limit(BATCH);
  if (readError) throw new Error(readError.message);

  const ids = (due || []).map((r) => r.id);
  if (!ids.length) return { scanned: 0, purged: 0 };

  const { error: writeError } = await supabase
    .from("usage_events")
    .delete()
    .in("id", ids);
  if (writeError) throw new Error(writeError.message);

  return { scanned: ids.length, purged: ids.length };
}

/**
 * The ledger of invite-code attempts, at 30 days.
 *
 * The throttle reads the last fifteen minutes and the last day, so nothing older
 * than that is doing any work. It is kept for a month because a burst of wrong
 * codes is the sort of thing somebody wants to look at on Monday, and deleted
 * after because a list of who typed what is not a thing to hold indefinitely.
 */
async function purgeCodeAttempts({ supabase, cutoff }) {
  const { data: due, error: readError } = await supabase
    .from("code_attempts")
    .select("id")
    .lt("at", cutoff.toISOString())
    .limit(BATCH);
  if (readError) throw new Error(readError.message);

  const ids = (due || []).map((r) => r.id);
  if (!ids.length) return { scanned: 0, purged: 0 };

  const { error: writeError } = await supabase
    .from("code_attempts")
    .delete()
    .in("id", ids);
  if (writeError) throw new Error(writeError.message);

  return { scanned: ids.length, purged: ids.length };
}

const RUNNERS = {
  [COMPLETED_HISTORY]: purgeCompletedHistory,
  [INBOX_ORIGINALS]: purgeInboxOriginals,
  [CONVERSATIONS]: purgeConversations,
  [DIAGNOSTICS]: purgeDiagnostics,
  [CODE_ATTEMPTS]: purgeCodeAttempts,
  [PARENT_VIEW_SECURITY]: async ({ supabase }) => {
    const { data, error } = await supabase.rpc("purge_parent_view_security_records");
    if (error) throw new Error(error.message);
    const purged = Object.values(data || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    return { scanned: purged, purged };
  },
};

/**
 * What a finished job should be written down as. Pure, so the shape of the row is
 * decided in one place and can be asserted in a test rather than assembled inline.
 */
export function purgeRecord({ job, cutoff, result, error, source = "cron" }) {
  return {
    job,
    cutoff: cutoff.toISOString(),
    scanned: Number(result?.scanned || 0),
    purged: Number(result?.purged || 0),
    error: error ? String(error.message || error) : result?.error || null,
    source,
    detail: {
      // Said explicitly rather than inferred from the count, because "we deleted
      // exactly the ceiling" is the one outcome that means there is more waiting.
      capped: Number(result?.purged || 0) >= BATCH,
      batch: BATCH,
      ...result?.detail,
    },
  };
}

/**
 * Run every purge, record each, and never let one take the others down.
 *
 * @param {object} input
 * @param {object} input.supabase   service-role client; these tables have no policies
 * @param {Date} [input.now]
 * @param {string} [input.source]   'cron' or 'manual'
 * @param {string[]} [input.jobs]   subset, for running one on purpose
 * @returns {Promise<{ok: boolean, jobs: Array}>}
 */
export async function runRetentionPurges({
  supabase,
  now = new Date(),
  source = "cron",
  jobs = JOBS,
} = {}) {
  const outcomes = [];

  for (const job of jobs) {
    const cutoff = cutoffFor(job, now);
    let result = null;
    let failure = null;
    try {
      result = await RUNNERS[job]({ supabase, cutoff });
    } catch (e) {
      failure = e;
    }

    const row = purgeRecord({ job, cutoff, result, error: failure, source });
    let auditError = null;
    try {
      const receipt = await supabase.from("retention_runs").insert(row);
      if (!receipt || receipt.error) throw new Error("Audit insert failed");
    } catch {
      // Deletion cannot be undone here. Keep its real counts, but never report
      // success without a confirmed audit write. Do not retry the deletion.
      auditError = "The retention audit record could not be saved.";
      // A separate operational signal survives an unavailable audit table.
      // Log only job metadata, never raw database errors or deleted content.
      console.error("retention_audit_write_failed", {
        job, source, cutoff: row.cutoff, scanned: row.scanned, purged: row.purged,
      });
    }
    outcomes.push({
      ...row,
      auditRecorded: !auditError,
      auditError,
      error: [row.error, auditError].filter(Boolean).join(" ") || null,
    });
  }

  return { ok: outcomes.every((o) => !o.error), jobs: outcomes };
}
