// The family's calendar subscription URL: reading it, and starting one over.
//
// The URL contains a long random token and nothing else, because the thing
// reading it is a calendar app rather than a person. Calendar apps do not sign
// in, cannot be asked to, and will happily re-read the same URL for years, which
// makes the token both the credential and the thing to be able to revoke.
//
// One per family. Rotating it makes every existing subscription go quiet, which
// is the point of rotating it.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/email/sendInvite";
import { randomBytes } from "crypto";

export const runtime = "nodejs";

const newToken = () => randomBytes(24).toString("base64url");

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

  const { data } = await supabase
    .from("calendar_feeds")
    .select("token, created_at, last_read_at")
    .eq("family_id", familyId)
    .maybeSingle();

  return NextResponse.json({
    url: data ? `${siteOrigin(request)}/api/calendar/${data.token}.ics` : null,
    createdAt: data?.created_at || null,
    lastReadAt: data?.last_read_at || null,
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

  const { data: existing } = await supabase
    .from("calendar_feeds")
    .select("token")
    .eq("family_id", familyId)
    .maybeSingle();

  // Asking twice gives back the same URL rather than quietly breaking whatever
  // is already subscribed to the old one. Breaking it takes saying so.
  if (existing && !body?.rotate) {
    return NextResponse.json({
      url: `${siteOrigin(request)}/api/calendar/${existing.token}.ics`,
      rotated: false,
    });
  }

  const token = newToken();
  if (existing) {
    await supabase
      .from("calendar_feeds")
      .update({
        token,
        created_by: user.id,
        created_at: new Date().toISOString(),
        last_read_at: null,
      })
      .eq("family_id", familyId);
  } else {
    const { error } = await supabase
      .from("calendar_feeds")
      .insert({ token, family_id: familyId, created_by: user.id });
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
  });
}
