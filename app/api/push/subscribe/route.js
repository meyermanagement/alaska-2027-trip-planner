// Agreeing to be interrupted, and changing your mind.
//
// A push subscription belongs to a browser, not to a person: the same person on a
// phone and a laptop is two rows, and turning notifications off in one must not
// silence the other. The endpoint the browser hands us is unique on its own, so a
// browser that re-subscribes -- which happens whenever the push service rotates
// it -- lands on the row it already had instead of collecting duplicates that each
// deliver the same notification.
//
// GET answers the one question the client cannot answer for itself: the server's
// public key, and whether push is configured at all. Keeping it behind a route
// rather than a build-time variable means the key can be set on a running
// deployment without a rebuild, and the screen can say plainly that it is missing.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushConfigured, pushProblem, pushPublicKey } from "@/lib/push/send";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    configured: pushConfigured(),
    key: pushPublicKey(),
    problem: pushProblem(),
  });
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
      enabled: true,
      failures: 0,
      last_error: null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
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
