// Asking when to go, for one bucket-list place.
//
// Reads only. Every other route that calls the model on this family's behalf
// either proposes a change for somebody to press or writes a figure into a blank
// box; this one hands back windows and stops. The months on a bucket-list row are
// what a fare gets judged against, so a machine widening them by a month on its
// own initiative would quietly change which fares reach the family, in a place
// nobody would think to look.
//
// It answers for a saved row and for a place still being typed into the form, and
// for the same reason: the moment somebody most needs this is the moment they are
// looking at twelve empty month boxes for a place they just named. So the body may
// carry a placeId or it may carry a place and a sentence, and the family record is
// read the same way either way.
//
// One grounded call. The season half of the answer cannot be had without searching,
// and grounded has a long tail, hence the budget below and the ninety seconds.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { todayISO } from "@/lib/reminders";
import { agesOn } from "@/lib/travelers/ages";
import { aboutLines } from "@/lib/travelers/profile";
import { reasonFor, seasonWindows } from "@/lib/someday/season";
import { parseMonths } from "@/lib/someday/months";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL_BUDGET_MS = 70000;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request) {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = String(body?.placeId || "").trim();
  const typedPlace = String(body?.place || "")
    .trim()
    .slice(0, 160);
  const typedWhy = String(body?.why || "")
    .trim()
    .slice(0, 400);
  const typedMonths = parseMonths(body?.months);

  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) return bad("Sign in first.", 401);

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships?.length) return bad("Join a household first.", 403);
  const familyId = memberships[0].family_id;

  // A secondary traveler cannot read the household's wish list under the
  // policies, so they cannot be on the screen that asks this.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary)
    return bad("Only a primary traveler can ask about the bucket list.", 403);

  // The row when there is one. Row-level security decides whether it exists for
  // this person, so a placeId belonging to another household reads as missing.
  let row = null;
  if (placeId) {
    const { data } = await supabase
      .from("someday_places")
      .select("id, place, region, why, months, traveler_ids")
      .eq("id", placeId)
      .maybeSingle();
    if (!data) return bad("That place is not on the list.", 404);
    row = data;
  }

  const place = row?.place || typedPlace;
  if (!place) return bad("Say where first.");

  const today = todayISO();

  // The trips they already have are deliberately not read. A window here is a
  // month or two wide against a place with no dates, so anything could be made to
  // collide with something, and the collision is only real once the trip has
  // dates of its own.
  const [{ data: travelers }, { data: preferences }, { data: facts }] =
    await Promise.all([
      supabase
        .from("travelers")
        .select(
          "id, name, date_of_birth, about_me, mobility_aids, accessibility_notes",
        )
        .eq("is_person", true)
        .order("sort_order", { ascending: true }),
      supabase
        .from("travel_preferences")
        .select("topic, topics, body")
        .order("created_at", { ascending: true }),
      supabase.from("household_facts").select("body, kind"),
    ]);

  const people = travelers || [];
  const forWhom = row?.traveler_ids?.length ? row.traveler_ids : [];
  const going = forWhom.length
    ? people.filter((person) => forWhom.includes(person.id))
    : people;

  const elapsed = Date.now() - startedAt;
  const answer = await seasonWindows({
    place,
    region: row?.region || "",
    why: row?.why || typedWhy,
    months: row ? parseMonths(row.months) : typedMonths,
    travelerNames: going.map((person) => person.name).filter(Boolean),
    ages: agesOn(going, today),
    about: aboutLines(going),
    preferences: preferences || [],
    facts: facts || [],
    today,
    deadline: Date.now() + Math.max(20000, MODEL_BUDGET_MS - elapsed),
  });

  // The sentence that would be stored is built here rather than on the screen,
  // so the words the family read in the card are character for character the
  // words that end up on the row.
  return NextResponse.json({
    windows: answer.windows.map((window) => ({
      ...window,
      reason: reasonFor(window),
    })),
    note: answer.note,
    sources: answer.sources,
    searched: answer.searched,
  });
}
