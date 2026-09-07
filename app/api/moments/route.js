import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";

export const runtime = "nodejs";
export const maxDuration = 30;

// Favorite moments editor, per-person.
//
// The interview writes moments once, from the primary, at the end of the
// nine-question ledger. This route is what the family reaches for after that:
// looking at what got saved, fixing a moment that came out wrong, adding one
// they forgot, taking one down that no longer belongs there.
//
// Two things separate it from /api/interview/moments:
//
//   1. Any household writer can post, not only the primary. A primary who set
//      up the household writes their own moments through the interview, and
//      any writer with editPeople permission can maintain moments on any
//      person's file thereafter. This matches the People screen's existing
//      contract -- notes, about_me, mobility, languages are all editable by
//      any writer -- and it's what lets a spouse fix a typo in the other
//      spouse's moment without a round trip through the interview.
//
//   2. It works row by row: GET a person's moments, POST to add one, PATCH
//      to edit one by id, DELETE to remove one by id. The interview writes a
//      whole list at once; this one edits pieces of a list already saved.
//
// Secondary travelers get 403 on writes -- they can see the itinerary and
// check off their own packing, but the person cards on Family are read-only
// for them and moments follow the same shape.

const MAX_MOMENT_LENGTH = 1200;

// A moment must belong to somebody in the same family the caller is in. Row
// level security enforces this at the database, but returning a friendly 404
// beats a silently empty response.
async function loadTraveler(supabase, familyId, travelerId) {
  const { data } = await supabase
    .from("travelers")
    .select("id, family_id")
    .eq("id", travelerId)
    .eq("family_id", familyId)
    .maybeSingle();
  return data || null;
}

export async function GET(request) {
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

  const url = new URL(request.url);
  const travelerId = String(url.searchParams.get("traveler_id") || "").trim();
  if (!travelerId) {
    return NextResponse.json(
      { error: "Which person? Include a traveler_id." },
      { status: 400 },
    );
  }

  const traveler = await loadTraveler(supabase, familyId, travelerId);
  if (!traveler) {
    return NextResponse.json(
      { error: "That person is not in this family." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("favorite_moments")
    .select("id, body, sort_order, created_at, updated_at")
    .eq("family_id", familyId)
    .eq("traveler_id", travelerId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Those moments could not be loaded. Reload and try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, moments: data || [] });
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
  if (!access.can.editPeople) {
    return NextResponse.json(
      { error: "Only the person who set up the family edits people's files." },
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

  const travelerId = String(payload?.traveler_id || "").trim();
  const body = String(payload?.body || "")
    .trim()
    .slice(0, MAX_MOMENT_LENGTH);
  if (!travelerId) {
    return NextResponse.json(
      { error: "Which person? Include a traveler_id." },
      { status: 400 },
    );
  }
  if (!body) {
    return NextResponse.json(
      { error: "A moment needs some words." },
      { status: 400 },
    );
  }

  const traveler = await loadTraveler(supabase, familyId, travelerId);
  if (!traveler) {
    return NextResponse.json(
      { error: "That person is not in this family." },
      { status: 404 },
    );
  }

  // Append to the end of the person's list. Sort_order picks up where the
  // person's existing rows left off so a new moment lands under the last one
  // rather than shuffling into the middle.
  const { data: lastRow } = await supabase
    .from("favorite_moments")
    .select("sort_order")
    .eq("family_id", familyId)
    .eq("traveler_id", travelerId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = Number.isFinite(lastRow?.sort_order)
    ? lastRow.sort_order + 1
    : 1;

  const { data, error } = await supabase
    .from("favorite_moments")
    .insert({
      family_id: familyId,
      traveler_id: travelerId,
      body,
      sort_order: nextSort,
      created_by: user.id,
    })
    .select("id, body, sort_order, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "That moment could not be saved. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, moment: data });
}

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
  if (!access.can.editPeople) {
    return NextResponse.json(
      { error: "Only the person who set up the family edits people's files." },
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

  const id = String(payload?.id || "").trim();
  const body = String(payload?.body || "")
    .trim()
    .slice(0, MAX_MOMENT_LENGTH);
  if (!id) {
    return NextResponse.json(
      { error: "Which moment? Include an id." },
      { status: 400 },
    );
  }
  if (!body) {
    return NextResponse.json(
      { error: "A moment needs some words." },
      { status: 400 },
    );
  }

  // Family scope enforced at the row level; the eq(family_id) is a belt-and-
  // -braces check that a stray id from another household could not overwrite
  // a moment here.
  const { data, error } = await supabase
    .from("favorite_moments")
    .update({ body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("family_id", familyId)
    .select("id, body, sort_order, created_at, updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "That moment could not be saved. Try again." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "That moment is no longer there." },
      { status: 404 },
    );
  }

  return NextResponse.json({ ok: true, moment: data });
}

export async function DELETE(request) {
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
  if (!access.can.editPeople) {
    return NextResponse.json(
      { error: "Only the person who set up the family edits people's files." },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) {
    return NextResponse.json(
      { error: "Which moment? Include an id." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("favorite_moments")
    .delete()
    .eq("id", id)
    .eq("family_id", familyId);

  if (error) {
    return NextResponse.json(
      { error: "That moment could not be removed. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
