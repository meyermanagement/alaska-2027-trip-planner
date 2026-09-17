// "Send one to this phone now."
//
// The equivalent of the morning email's test button, and it exists for the same
// reason: the gap between granting permission and receiving a real alert can be
// days, and a channel nobody has ever seen work is a channel nobody trusts. This
// proves the whole path -- key pair, subscription row, push service, service
// worker -- in one tap.
//
// It only ever sends to browsers in the caller's own household, and it writes
// nothing to the deadline ledger: a test must never be the reason a real warning
// does not arrive.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured, pushProblem, sendPush } from "@/lib/push/send";
import { optionalFeatureOn } from "@/lib/beta/consent";

export const runtime = "nodejs";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json({ error: pushProblem() }, { status: 503 });
  }

  if (!(await optionalFeatureOn(supabase, user.id, "notifications"))) {
    return NextResponse.json(
      {
        error:
          "Turn on Reminders before they matter in Settings first, then this will send one.",
        reason: "feature-off",
      },
      { status: 403 },
    );
  }

  const { data: me } = await supabase
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

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("family_id", me.family_id)
    .eq("user_id", user.id)
    .eq("enabled", true);

  if (!subs?.length) {
    return NextResponse.json(
      {
        error:
          "This browser has not agreed to notifications yet, so there is nowhere to send one.",
      },
      { status: 400 },
    );
  }

  let delivered = 0;
  let problem = null;
  for (const sub of subs) {
    const result = await sendPush({
      subscription: sub,
      payload: {
        title: "Alyeska can reach this phone",
        body: "This is the channel deadlines will arrive on: a fare on its last day, or an offer about to close.",
        url: "/now",
        tag: "alyeska-test",
      },
    });
    if (result.ok) delivered += 1;
    else {
      problem = result.error || "The push failed.";
      // A subscription the push service has given up on is deleted here too, so
      // a dead browser does not sit in the list looking subscribed.
      if (result.gone) {
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      }
    }
  }

  if (!delivered) {
    return NextResponse.json(
      { error: problem || "Nothing was delivered." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, delivered });
}
