import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runRetentionPurges, JOBS } from "@/lib/retention/purge";
import { retryOpenDeletions } from "@/lib/account/retryDeletions";

export const maxDuration = 60;

const DELETIONS = "deletions";

/**
 * Housekeeping: the retention promises, performed on a schedule.
 *
 * Guarded exactly like the morning run and the deadline watch. Vercel attaches
 * `Authorization: Bearer $CRON_SECRET` to a scheduled request and that is the only
 * caller this trusts; without the secret configured it refuses outright, because a
 * URL that deletes rows is not a thing to leave open on the internet.
 *
 * Why this is not its own entry in vercel.json: the free hosting plan allows two
 * cron jobs and the app already has both, and a deployment carrying a third is
 * refused outright. So the nightly deadline watch calls this work directly and
 * this route exists for the run somebody does on purpose -- proving the purge
 * works, or catching up after a spell where the scheduler was not calling. Moving
 * it onto its own schedule later is one entry in vercel.json and no change here.
 *
 * It also runs the deletion retry: every deletion receipt still open an hour
 * after it was asked for is run again, and after three failures somebody is
 * emailed once. Housekeeping and unfinished deletions belong on the same pass
 * because they are the same promise -- that what we said would go, goes.
 *
 * `?job=` runs one of them alone, which is what an evidence run wants;
 * `?job=deletions` runs only the retry.
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not set on the server, so the retention purges are switched off.",
      },
      { status: 503 },
    );
  }
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set on the server. The purges have nobody signed in, so they cannot read past the household policies without it.",
      },
      { status: 503 },
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }

  const asked = new URL(request.url).searchParams.get("job");
  if (asked && asked !== DELETIONS && !JOBS.includes(asked)) {
    return NextResponse.json(
      { error: `No such job. Try one of: ${[...JOBS, DELETIONS].join(", ")}.` },
      { status: 400 },
    );
  }

  const purges =
    asked === DELETIONS
      ? null
      : await runRetentionPurges({
          supabase,
          source: "manual",
          jobs: asked ? [asked] : JOBS,
        });

  const deletions =
    asked && asked !== DELETIONS
      ? null
      : await retryOpenDeletions({ supabase, source: "manual" });

  const ok = (purges?.ok ?? true) && (deletions?.ok ?? true);
  return NextResponse.json(
    { ok, purges, deletions },
    { status: ok ? 200 : 500 },
  );
}
