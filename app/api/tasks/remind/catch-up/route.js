import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueTodayReminders } from "@/lib/email/sendReminders";
import { siteOrigin } from "@/lib/email/sendInvite";
import { runRecord, shouldCatchUp, CATCH_UP } from "@/lib/tasks/runs";
import { homeToday, homeHour } from "@/lib/format";

export const maxDuration = 60;

/**
 * The morning email, sent late, because nothing sent it on time.
 *
 * On 29 August a task was due, the mailer was proved working by hand, and the
 * scheduled job never called — so the household got nothing, and the app had no
 * way to make up for it. This is that way. When somebody opens the app after the
 * hour the email was due and the record shows no run, the app runs it then.
 *
 * Late is worse than on time and enormously better than never, which is what a
 * reminder about a passport is worth if it arrives after the trip.
 *
 * This is not a second scheduler and must not be mistaken for one. It only ever
 * fires because a person opened a page, so a household that does not open the app
 * still gets nothing — the fix for the scheduler is still the fix. What it buys is
 * that a broken clock stops meaning a silent app.
 *
 * Safe to call as often as a browser likes:
 *
 *   - it refuses before the hour plus the grace window, so it can never send the
 *     morning email early;
 *   - it refuses if any run is already recorded for today, so the hundredth page
 *     load of the morning does nothing;
 *   - and underneath both of those, every send is claimed in task_reminder_emails
 *     first, whose unique index over (task, person, date) means even two requests
 *     arriving in the same millisecond send one email between them.
 */
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Read as the visitor, so the household is the visitor's own and cannot be
  // asked for. Any member may trigger it, including a secondary: this sends
  // people the list they were already owed this morning, which is not a privilege.
  const { data: me } = await supabase
    .from("travelers")
    .select("id, family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  const familyId = me?.family_id || null;
  if (!familyId) {
    return NextResponse.json(
      { error: "Your own row could not be found." },
      { status: 404 },
    );
  }

  const today = homeToday();
  const { data: runs } = await supabase
    .from("reminder_runs")
    .select("ran_for, source")
    .eq("ran_for", today);

  if (!shouldCatchUp({ runs: runs || [], today, hour: homeHour(), familyId })) {
    // Not an error. The overwhelmingly common answer is "the scheduler already
    // did this", and a page load should not be told off for asking.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set on the server, so the email cannot be made up for.",
      },
      { status: 503 },
    );
  }

  const outcome = await sendDueTodayReminders({
    supabase: admin,
    siteUrl: siteOrigin(request),
    today,
    onlyFamilyId: familyId,
  });

  try {
    await admin
      .from("reminder_runs")
      .insert(runRecord({ outcome, familyId, source: CATCH_UP, today }));
  } catch {
    // The email mattered; the bookkeeping about it did not matter as much. A
    // failure to write the row must not turn a delivered email into a 500.
  }

  return NextResponse.json({
    ok: outcome.ok !== false,
    caughtUp: true,
    sent: outcome.sent?.length || 0,
    failed: outcome.failed?.length || 0,
    error: outcome.failed?.[0]?.error || outcome.error || null,
  });
}
