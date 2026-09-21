// Agreeing to be interrupted, and changing your mind.
//
// A push subscription belongs to a browser, not to a person: the same person on a
// phone and a laptop is two rows, and turning notifications off in one must not
// silence the other. The endpoint the browser hands us is unique on its own, so a
// browser that re-subscribes on the same endpoint lands on the row it already had.
// A rotated endpoint is a new row, though, which is how one iPhone came to hold six
// of them -- so the browser also sends an identifier of its own, and rows it
// supersedes are retired here. See lib/push/devices.js for why the user agent is
// not enough to decide that.
//
// GET answers the one question the client cannot answer for itself: the server's
// public key, and whether push is configured at all. Keeping it behind a route
// rather than a build-time variable means the key can be set on a running
// deployment without a rebuild, and the screen can say plainly that it is missing.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured, pushProblem, pushPublicKey } from "@/lib/push/send";
import { optionalFeatureDecision } from "@/lib/beta/consent";
import { supersededSubscriptions } from "@/lib/push/devices";

export const runtime = "nodejs";

export async function GET() {
  const configured = pushConfigured();
  const body = {
    configured,
    key: pushPublicKey(),
    problem: pushProblem(),
    subscribed: false,
  };

  // Whether this person has a live row, not just a live browser. The screen used
  // to decide it was signed up by asking the browser alone, which is true right up
  // until the row is retired underneath it -- turning Reminders off does exactly
  // that. After which the phone still holds its subscription, the panel still says
  // on, and the sender cannot see the row. Saying what the server holds lets the
  // screen notice the disagreement and offer to fix it.
  if (configured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("enabled", true)
        .limit(1);
      body.subscribed = Boolean(data?.length);
    }
  }

  return NextResponse.json(body);
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json({ error: pushProblem() }, { status: 503 });
  }

  // The gate asked whether we may interrupt them and offered an honest answer for
  // no -- "check the Reminders screen yourself". Storing a subscription for a
  // browser whose owner declined would make that answer false, so the switch is
  // read here rather than trusted to the screen that offers the button.
  const decision = await optionalFeatureDecision(
    supabase,
    user.id,
    "notifications",
  );
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error:
          decision.reason === "no-consent"
            ? "Your beta agreement needs looking at again before notifications can be set up."
            : "Turn on Reminders before they matter in Settings, and this browser can be signed up for them.",
        reason: decision.reason,
      },
      { status: 403 },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const endpoint =
    typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body?.p256dh === "string" ? body.p256dh : "";
  const auth = typeof body?.auth === "string" ? body.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "That subscription is missing its endpoint or its keys." },
      { status: 400 },
    );
  }

  const { data: me } = await supabase
    .from("travelers")
    .select("id, family_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!me?.family_id) {
    return NextResponse.json(
      {
        error:
          "Your own row could not be found, so there is no household to attach this to.",
      },
      { status: 404 },
    );
  }

  const label =
    typeof body?.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, 120)
      : (request.headers.get("user-agent") || "").slice(0, 120) || null;

  const deviceId =
    typeof body?.device_id === "string" && body.device_id.trim()
      ? body.device_id.trim().slice(0, 64)
      : null;

  // Upsert on the endpoint. The keys can genuinely change under the same
  // endpoint, and a stale pair is a subscription that silently stops working, so
  // they are overwritten every time rather than left as first written.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      family_id: me.family_id,
      traveler_id: me.id,
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      label,
      device_id: deviceId,
      enabled: true,
      failures: 0,
      last_error: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Retiring what this subscription replaces. A failure here leaves a duplicate
  // row, which sends one extra notification -- not worth failing a subscription
  // the browser has already granted, so it is reported and swallowed.
  let retired = 0;
  if (deviceId) {
    const { data: mine } = await supabase
      .from("push_subscriptions")
      .select("id, user_id, endpoint, device_id, label")
      .eq("user_id", user.id);
    const stale = supersededSubscriptions(mine || [], {
      userId: user.id,
      endpoint,
      deviceId,
      label,
    });
    if (stale.length) {
      const { error: retireError } = await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", stale);
      if (retireError) console.error("push subscribe: stale rows kept", retireError.message);
      else retired = stale.length;
    }
  }

  return NextResponse.json({ ok: true, retired });
}

export async function DELETE(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const endpoint =
    typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  if (!endpoint) {
    return NextResponse.json(
      { error: "Which browser? The endpoint is missing." },
      { status: 400 },
    );
  }

  // Deleted rather than disabled. A browser whose permission has been withdrawn
  // is not a subscription we are holding back from using; it is one that no longer
  // exists, and keeping the row would only make the household look subscribed
  // when it is not.
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
