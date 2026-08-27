import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendDueTodayReminders } from "@/lib/email/sendReminders";
import { siteOrigin } from "@/lib/email/sendInvite";

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
  });

  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 500 });
}

/**
 * "Send me mine now" — the same email, to yourself, from the People tab.
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
    .select("id, name, email")
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
