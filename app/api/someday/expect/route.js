// What to expect of one bucket-list place, asked on demand and kept.
//
// Unlike the months question next to it, this one writes -- but only to columns
// nothing is judged against. The months, the airfare ceiling and the traveler
// list on a bucket-list row decide which fares reach the family, and those stay
// in human hands. What lands here is Aly's read on the place, in three columns
// that exist for it, so a family who asked in September is not made to wait
// through a grounded call again in October to see the same answer.
//
// Only for a saved row, and deliberately: an answer with nowhere to live would
// be a minute of waiting that vanishes on the next tap. The months route answers
// for a place still being typed because a person staring at twelve empty month
// boxes needs it before the row exists. Nobody needs a cost expectation before
// they have decided to write the place down.
//
// One grounded call. The cost range and the shape of the season are facts about
// the world, not about this family, so the search is the point of it -- hence the
// budget below and the ninety seconds.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { todayISO } from "@/lib/reminders";
import { agesOn } from "@/lib/travelers/ages";
import { aboutLines } from "@/lib/travelers/profile";
import { placeMatches } from "@/lib/deals/verdict";
import { placeExpectation } from "@/lib/someday/expect";
import { parseMonths } from "@/lib/someday/months";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL_BUDGET_MS = 70000;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

/**
 * The fares this household has actually been sent for this place.
 *
 * Matched on words rather than on the someday_id a fare may carry, because the
 * link is only set when somebody filed the fare against the wish, and the number
 * is just as true when nobody did. Dismissed and taken fares count: a fare they
 * passed on in March still says what the route costs.
 */
function faresFor(deals, place, region) {
  const named = `${place || ""} ${region || ""}`.trim();
  return (deals || [])
    .filter((deal) => {
      const dest = [deal?.destination, deal?.destination_code]
        .filter(Boolean)
        .join(" ");
      return dest ? placeMatches(dest, named) : false;
    })
    .slice(0, 4)
    .map((deal) => ({
      origin: deal.origin,
      destination: deal.destination,
      price: deal.price,
      award_pricing: deal.award_pricing,
      airline: deal.airline,
      source_name: deal.source_name,
      seen: String(deal.created_at || "").slice(0, 10),
    }));
}

export async function POST(request) {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const placeId = String(body?.placeId || "").trim();
  if (!placeId) return bad("Say which place.");

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

  // Row-level security decides whether the row exists for this person, so a
  // placeId belonging to another household reads as missing.
  const { data: row } = await supabase
    .from("someday_places")
    .select("id, place, region, why, months, traveler_ids")
    .eq("id", placeId)
    .maybeSingle();
  if (!row) return bad("That place is not on the list.", 404);

  const today = todayISO();

  const [
    { data: travelers },
    { data: preferences },
    { data: facts },
    { data: airports },
    { data: deals },
  ] = await Promise.all([
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
    supabase
      .from("home_airports")
      .select("code, name, city, drive_minutes, is_primary")
      .eq("family_id", familyId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("flight_deals")
      .select("origin, destination, destination_code, price, award_pricing, airline")
      .eq("family_id", familyId)
      .order("created_at", { ascending: false }),
  ]);

  const people = travelers || [];
  const forWhom = row.traveler_ids?.length ? row.traveler_ids : [];
  const going = forWhom.length
    ? people.filter((person) => forWhom.includes(person.id))
    : people;

  const elapsed = Date.now() - startedAt;
  const answer = await placeExpectation({
    place: row.place,
    region: row.region || "",
    why: row.why || "",
    months: parseMonths(row.months),
    travelerNames: going.map((person) => person.name).filter(Boolean),
    ages: agesOn(going, today),
    about: aboutLines(going),
    preferences: preferences || [],
    facts: facts || [],
    airports: airports || [],
    fares: faresFor(deals, row.place, row.region),
    today,
    deadline: Date.now() + Math.max(20000, MODEL_BUDGET_MS - elapsed),
  });

  if (!answer.tips.length && !answer.checks.length)
    return bad("That did not come back with anything useful.", 502);

  const saidAt = new Date().toISOString();
  const expect = {
    tips: answer.tips,
    checks: answer.checks,
    consider: answer.consider,
    searched: answer.searched,
  };

  // Stored under the asker's own session, so the policies decide whether this
  // person may write to the row, exactly as they do when the form saves it.
  const { error } = await supabase
    .from("someday_places")
    .update({
      expect,
      expect_sources: answer.sources,
      expect_said_at: saidAt,
      updated_at: saidAt,
      updated_by: user.id,
    })
    .eq("id", row.id);

  // A failed write is not a failed answer. The panel is handed back either way
  // and the screen shows it; the family loses only the keeping of it.
  return NextResponse.json({
    ...expect,
    sources: answer.sources,
    saidAt,
    kept: !error,
  });
}
