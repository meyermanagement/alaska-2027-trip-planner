import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  runDeadlineWatch,
  runDeadlineWatchForAll,
  watchRecord,
} from "@/lib/watch/run";
import { siteOrigin } from "@/lib/email/sendInvite";
import { homeToday } from "@/lib/format";

export const maxDuration = 60;

/**
 * The deadline watch, called by the scheduler and nobody else.
 *
 * Built like the morning run and guarded the same way: Vercel attaches
 * `Authorization: Bearer $CRON_SECRET` to a scheduled request, and that is the only
 * caller this trusts. Without the secret configured it refuses outright, because an
 * open URL that notifies a whole household is not a thing to leave on the internet.
 *
 * Cadence is a deliberate compromise. This runs once a day, in the evening, which
 * is a second look at the calendar after the morning email rather than a live
 * watch. Sub-daily crons need a paid hosting plan and a deployment carrying one on
 * the free plan is refused outright, so the schedule that ships is the one that
 * ships everywhere; putting a two-hourly expression in vercel.json instead of the
 * daily one is the whole upgrade. The alert ledger means a faster cadence sends nothing extra --
 * each deadline is still warned about once per stage -- so the schedule can be
 * turned up without changing a line of this logic.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set on the server, so the deadline watch is switched off.",
      },
      { status: 503 },
    );
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set on the server. The watch has nobody signed in, so it cannot read the fares or the offers without it.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  // Every household, named one at a time. The pass used to be called without a
  // household at all, which left it watching whichever row `families` returned
  // first: one household's fares looked at every evening, everybody else's never,
  // and the run recorded under the household that happened to be first. One row
  // per household now, so a household with nothing due can still show that its
  // evening pass happened.
  const pass = await runDeadlineWatchForAll({
    supabase,
    siteUrl: siteOrigin(request),
    today: homeToday(),
  });

  for (const outcome of pass.households) {
    await record({ supabase, outcome, source: "cron" });
  }
  // A run that could not even list the households has no household to file under,
  // and that is worth a row of its own rather than silence.
  if (!pass.households.length) {
    await record({
      supabase,
      outcome: { ok: pass.ok, error: pass.error, familyId: null },
      source: "cron",
    });
  }

  return NextResponse.json(
    {
      ok: pass.ok,
      today: pass.today,
      households: pass.households.length,
      error: pass.error,
      considered: pass.households.reduce((n, h) => n + (h.considered || 0), 0),
      sent: pass.households.reduce((n, h) => n + (h.sent?.length || 0), 0),
      failed: pass.households.reduce((n, h) => n + (h.failed?.length || 0), 0),
      expired: pass.households.reduce((n, h) => n + (h.expired || 0), 0),
      runs: pass.households.map((h) => ({
        familyId: h.familyId,
        considered: h.considered,
        sent: h.sent?.length || 0,
        failed: h.failed?.length || 0,
        expired: h.expired,
        channel: h.channel,
        error: h.error || null,
      })),
    },
    { status: pass.ok ? 200 : 500 },
  );
}

/**
 * "Check now" — the same pass, run by somebody looking at the screen.
 *
 * Reads and writes go through the service key because the watch has to see the
 * whole household and write the alert ledger, but the household it is allowed to
 * look at comes from the caller's own row, so this cannot be pointed at anybody
 * else's fares. Sending is real, not a rehearsal: the point of the button is that
 * a warning nobody has had yet goes out now rather than at ten tonight.
 */
export async function POST(request) {
  const session = await createClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  const { data: me } = await session
    .from("travelers")
    .select("id, family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.family_id) {
    return NextResponse.json(
      { error: "Your own row could not be found." },
      { status: 404 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so the watch cannot write down what it warned about.",
      },
      { status: 503 },
    );
  }

  const outcome = await runDeadlineWatch({
    supabase: admin,
    siteUrl: siteOrigin(request),
    today: homeToday(),
    familyId: me.family_id,
  });

  await record({ supabase: admin, outcome, source: "manual" });

  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    considered: outcome.considered,
    sent: outcome.sent.length,
    failed: outcome.failed.length,
    expired: outcome.expired,
    channel: outcome.channel,
    // The most useful thing to say back to somebody who pressed the button and
    // saw nothing happen. Silence because everything close was already warned
    // about is a different fact from silence because nothing is close.
    nothing: outcome.considered === 0,
    already: outcome.skipped.length,
    error: outcome.failed[0]?.error || null,
  });
}

/**
 * Write the run down, and never let failing to write it break the run. A missing
 * row is a gap in the record; an exception here would be a household not warned
 * about a fare because the bookkeeping fell over.
 */
async function record({ supabase, outcome, source }) {
  if (!supabase) return;
  try {
    await supabase.from("watch_runs").insert(watchRecord({ outcome, source }));
  } catch {
    // Deliberately silent. See above.
  }
}
