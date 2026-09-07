import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";

export const runtime = "nodejs";
export const maxDuration = 30;

// The first-login walkthrough on a person's own file.
//
// Two verbs, both against the caller's own traveler row:
//
//   PATCH  updates about_me. Called from /welcome/about-you, and also useful
//          as a plain save on the same screen when somebody returns to it
//          later. The walkthrough itself is not marked complete here --
//          moving on from About me only advances the flow, not the stamp.
//
//   POST   marks the walkthrough complete: welcomed_at set to now. Called
//          from /welcome/moments when the person finishes or skips. Once set,
//          the auth callback stops routing them into /welcome/about-you.
//
// Neither verb ever writes to somebody else's traveler row: both scope to
// user_id = auth.uid. That is what makes this the walkthrough endpoint and
// not the person editor -- editing other people's files is what the People
// screen does, through /api/moments and the /api/family routes.

export async function PATCH(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const access = await resolveAccess(supabase, user);
  const familyId = access?.familyId;
  if (!familyId) {
    return NextResponse.json(
      { error: "No family group found." },
      { status: 403 },
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "That request could not be read." },
      { status: 400 },
    );
  }

  const raw = typeof payload?.about_me === "string" ? payload.about_me : "";
  // A cleared About me is stored as null, matching how the People form saves
  // it. Trim only the ends -- the paragraph itself keeps its line breaks so
  // it reads back the way it was typed.
  const nextValue = raw.trim() ? raw : null;

  const { data, error } = await supabase
    .from("travelers")
    .update({ about_me: nextValue })
    .eq("family_id", familyId)
    .eq("user_id", user.id)
    .eq("is_person", true)
    .select("id, about_me")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "That could not be saved. Try again." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "No traveler row for this account." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, about_me: data.about_me });
}

export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const access = await resolveAccess(supabase, user);
  const familyId = access?.familyId;
  if (!familyId) {
    return NextResponse.json(
      { error: "No family group found." },
      { status: 403 },
    );
  }

  // A completion is idempotent -- calling twice just re-stamps the same
  // row -- but the body is read so a future extension can carry a "skipped"
  // flag without a schema change.
  try {
    await request.json();
  } catch {
    // No body is fine.
  }

  const { data, error } = await supabase
    .from("travelers")
    .update({ welcomed_at: new Date().toISOString() })
    .eq("family_id", familyId)
    .eq("user_id", user.id)
    .eq("is_person", true)
    .select("id, welcomed_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "That could not be saved. Try again." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "No traveler row for this account." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, welcomed_at: data.welcomed_at });
}
