// The family's calendar subscription URL: reading it, and starting one over.
//
// The URL contains a long random token and nothing else, because the thing
// reading it is a calendar app rather than a person. Calendar apps do not sign
// in, cannot be asked to, and will happily re-read the same URL for years, which
// makes the token both the credential and the thing to be able to revoke.
//
// One per family. Rotating it makes every existing subscription go quiet, which
// is the point of rotating it.
//
// It also ends. Six months from the day it was made, renewable in one press, and
// the feed route stops answering after that. Rotating is the deliberate off
// switch; the end date is the one that fires for an address somebody pasted into
// a laptop they no longer own and then forgot about.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/email/sendInvite";
import { randomBytes } from "crypto";
import { optionalFeatureDecision } from "@/lib/beta/consent";

export const runtime = "nodejs";

const newToken = () => randomBytes(24).toString("base64url");

// Long enough to cover a trip planned a season ahead, short enough that a
// forgotten address does not outlive the household's interest in it.
export const FEED_DAYS = 180;
const feedExpiry = () =>
  new Date(Date.now() + FEED_DAYS * 86400000).toISOString();

async function familyOf(supabase, userId) {
  const { data } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId)
    .limit(1);
  return data?.[0]?.family_id || null;
}

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const familyId = await familyOf(supabase, user.id);
  if (!familyId)
    return NextResponse.json({ error: "No family yet." }, { status: 404 });

  // With the switch off the URL is not handed out, even though the row may still
  // exist from before -- a link that keeps working after somebody said no is the
  // whole problem with a URL that never expires.
  const decision = await optionalFeatureDecision(supabase, user.id, "calendar");
  if (!decision.allowed) {
    return NextResponse.json({
      url: null,
      createdAt: null,
      lastReadAt: null,
      reason: decision.reason,
      note:
        decision.reason === "no-consent"
          ? "Your beta agreement needs looking at again before the calendar link can be used."
          : "Turn on Add trips to your calendar in Settings to get a subscription link.",
    });
  }

  const { data } = await supabase
    .from("calendar_feeds")
    .select("token, created_at, last_read_at, expires_at")
    .eq("family_id", familyId)
    .maybeSingle();

  const expired = data?.expires_at
    ? Date.parse(data.expires_at) <= Date.now()
    : false;

  return NextResponse.json({
    url: data ? `${siteOrigin(request)}/api/calendar/${data.token}.ics` : null,
    createdAt: data?.created_at || null,
    lastReadAt: data?.last_read_at || null,
    expiresAt: data?.expires_at || null,
    // Said rather than left to the screen to work out from a date, so the copy a
    // family reads and the rule the feed route enforces come from one place.
    expired,
  });
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const familyId = await familyOf(supabase, user.id);
  if (!familyId)
    return NextResponse.json({ error: "No family yet." }, { status: 404 });

  const decision = await optionalFeatureDecision(supabase, user.id, "calendar");
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error:
          decision.reason === "no-consent"
            ? "Your beta agreement needs looking at again before the calendar link can be used."
            : "Turn on Add trips to your calendar in Settings, and a link can be made.",
        reason: decision.reason,
      },
      { status: 403 },
    );
  }

  const { data: existing } = await supabase
    .from("calendar_feeds")
    .select("token, expires_at")
    .eq("family_id", familyId)
    .maybeSingle();

  // Keep the same address working for another six months. The subscriptions
  // already added to three phones stay as they are, which is the whole point of
  // renewing rather than rotating.
  if (existing && body?.renew && !body?.rotate) {
    const expiresAt = feedExpiry();
    await supabase
      .from("calendar_feeds")
      .update({ expires_at: expiresAt })
      .eq("family_id", familyId);
    return NextResponse.json({
      url: `${siteOrigin(request)}/api/calendar/${existing.token}.ics`,
      rotated: false,
      renewed: true,
      expiresAt,
    });
  }

  // Asking twice gives back the same URL rather than quietly breaking whatever
  // is already subscribed to the old one. Breaking it takes saying so.
  if (existing && !body?.rotate) {
    return NextResponse.json({
      url: `${siteOrigin(request)}/api/calendar/${existing.token}.ics`,
      rotated: false,
      expiresAt: existing.expires_at || null,
    });
  }

  const token = newToken();
  const expiresAt = feedExpiry();
  if (existing) {
    await supabase
      .from("calendar_feeds")
      .update({
        token,
        created_by: user.id,
        created_at: new Date().toISOString(),
        last_read_at: null,
        expires_at: expiresAt,
      })
      .eq("family_id", familyId);
  } else {
    const { error } = await supabase.from("calendar_feeds").insert({
      token,
      family_id: familyId,
      created_by: user.id,
      expires_at: expiresAt,
    });
    if (error) {
      return NextResponse.json(
        { error: "Could not make a calendar link." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    url: `${siteOrigin(request)}/api/calendar/${token}.ics`,
    rotated: Boolean(existing),
    expiresAt,
  });
}
