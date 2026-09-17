import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueTodayReminders } from "@/lib/email/sendReminders";
import { siteOrigin } from "@/lib/email/sendInvite";
import { runRecord, runRecordsFor } from "@/lib/tasks/runs";
import { runRetentionPurges } from "@/lib/retention/purge";
import { retryOpenDeletions } from "@/lib/account/retryDeletions";
import { homeToday } from "@/lib/format";

export const maxDuration = 60;

/**
 * The morning run, called by Vercel's scheduler and nobody else.
 *
 * It covers today and tomorrow: a booking window that opens first thing is one
 * you can already have missed by the time a 7am email about it arrives, so a
 * dated task is said the morning before as well as the morning of, on the phone
 * as well as in the inbox.
 *
 * Vercel attaches `Authorization: Bearer $CRON_SECRET` to a scheduled request
 * when that variable is set, and that is the only thing this trusts. Without the
 * secret configured the endpoint refuses to do anything at all, because an
 * unauthenticated URL that emails the whole family is not a thing to leave lying
 * around on the internet.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set on the server, so scheduled reminders are switched off.",
      },
      { status: 503 },
    );
  }
  // Both settings are checked before the caller is, so that opening this URL in a
  // browser is a straight answer about whether the morning run can work. All it
  // can ever say is that a variable is unset; the values stay on the server, and
  // a fully configured endpoint just says no.
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set on the server. The nightly run has nobody signed in, so it cannot read the checklists without it.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  const outcome = await sendDueTodayReminders({
    supabase,
    siteUrl: siteOrigin(request),
    today: homeToday(),
  });

  // Written whatever happened, including when the run failed outright. This row is
  // the only difference between "the email did not send" and "nobody knows
  // whether anything was even asked to send" -- the send ledger cannot serve,
  // because a failed send gives its rows back so tomorrow will retry.
  await recordRun({ supabase, outcome, source: "cron" });

  // The retention purges ride along with the morning run. The free hosting plan
  // allows two cron jobs and both are taken, so rather than a third schedule the
  // housekeeping happens on the back of one -- and it is this one rather than the
  // evening watch because this is the run the record proves is actually being
  // called. Once a night is the cadence a 30-day and a 90-day promise need.
  //
  // Deliberately after the email and deliberately unable to break it: a purge
  // that falls over is written to retention_runs and reported here, and the
  // household still gets its morning list.
  let retention = null;
  try {
    retention = await runRetentionPurges({ supabase, source: "cron" });
  } catch (e) {
    retention = { ok: false, error: String(e?.message || e), jobs: [] };
  }

  // And the deletions nobody finished. Same reasoning as the purges: this is the
  // run the record proves is called, and an unfinished deletion is the promise
  // with the shortest fuse on it -- 30 days, running from a receipt nobody reads.
  let deletions = null;
  try {
    deletions = await retryOpenDeletions({ supabase, source: "cron" });
  } catch (e) {
    deletions = { ok: false, error: String(e?.message || e), rows: [] };
  }

  return NextResponse.json(
    { ...outcome, retention, deletions },
    { status: outcome.ok ? 200 : 500 },
  );
}

/**
 * "Send me mine now" — the same email, to yourself, from the Family tab.
 *
 * Reads go through the visitor's own session, so this can only ever surface work
 * they were allowed to see anyway, and it only ever emails the address on their
 * own row. The ledger is left alone: a test copy must not be the reason the real
 * one does not arrive.
 */
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: me } = await supabase
    .from("travelers")
    .select("id, name, email, family_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!me) {
    return NextResponse.json(
      { error: "Your own row could not be found." },
      { status: 404 },
    );
  }

  const outcome = await sendDueTodayReminders({
    supabase,
    siteUrl: siteOrigin(request),
    onlyTravelerId: me.id,
    record: false,
    today: homeToday(),
  });

  // The test leaves a row too, marked as a test. Pressing this button is the
  // fastest proof that the mailer itself works, and that proof is worth keeping
  // where the app can show it rather than only in the moment the button was
  // pressed. Recorded with the service key rather than the visitor's session, so
  // a run cannot be forged into existence from a browser.
  await recordRun({
    supabase: createAdminClient(),
    outcome,
    source: "test",
    familyId: me.family_id || null,
  });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 500 });
  }
  if (!outcome.sent.length && !outcome.failed.length) {
    return NextResponse.json({
      ok: true,
      nothing: true,
      message: `Nothing of yours is due today or tomorrow, so there was nothing to send. Put a due date of today on a task and try again.`,
    });
  }
  if (outcome.failed.length) {
    return NextResponse.json(
      { error: outcome.failed[0].error },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    to: outcome.sent[0].to,
    count: outcome.sent[0].count,
  });
}

/**
 * Write the run down, and never let failing to write it break the run.
 *
 * A missing row is a gap in the record; an exception here would be a morning with
 * no email at all because the bookkeeping fell over, which is a strictly worse
 * trade. So this swallows its own errors on purpose.
 */
async function recordRun({ supabase, outcome, source, familyId = null }) {
  if (!supabase) return;
  try {
    // A run told which household it was for -- the test button, pressed by a
    // person -- is written as one row for that household. The cron was not told,
    // so it writes one row per household it actually looked at, taken from the
    // run itself.
    //
    // It used to guess instead, with the first row of the families table, and the
    // guess was fine until there were two households and then silently wrong. An
    // unfinished test account was enough: every scheduled run got filed under it,
    // the real household could no longer see its own mornings in a ledger it is
    // only allowed to read its own rows of, and the rescue that reads that ledger
    // lost its footing.
    const rows = familyId
      ? [runRecord({ outcome, familyId, source })]
      : runRecordsFor({ outcome, source });
    if (rows.length) await supabase.from("reminder_runs").insert(rows);
  } catch {
    // Deliberately silent. See above.
  }
}
