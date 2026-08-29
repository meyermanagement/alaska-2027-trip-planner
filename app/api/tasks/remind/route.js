import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueTodayReminders } from "@/lib/email/sendReminders";
import { siteOrigin } from "@/lib/email/sendInvite";
import { runRecord } from "@/lib/tasks/runs";
import { homeToday } from "@/lib/format";

export const maxDuration = 60;

/**
 * The morning run, called by Vercel's scheduler and nobody else.
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

  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 500 });
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
      message: `Nothing of yours is due today, so there was nothing to send. Put a due date of today on a task and try again.`,
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
    let family = familyId;
    if (!family) {
      // The cron has no visitor to ask, so it takes the household from the work
      // it just considered. One family today; the column is nullable so a run
      // that found nothing at all is still recorded.
      const { data } = await supabase.from("families").select("id").limit(1);
      family = data?.[0]?.id || null;
    }
    await supabase
      .from("reminder_runs")
      .insert(runRecord({ outcome, familyId: family, source }));
  } catch {
    // Deliberately silent. See above.
  }
}
