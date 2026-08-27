// Looking for pro tips, one model call at a time.
//
// A refresh is genuinely several questions: what are the facts about this place,
// is there anything to say about the trip, about what they are taking, about this
// particular booking. Asking all of them in one request would be the obvious
// design and it cannot work: this route is killed at sixty seconds and a single
// grounded answer is allowed forty-six of them.
//
// So the route does exactly one piece of work per call and says what the next
// piece would be. The screen that asked keeps calling until there is no next, and
// shows what has arrived so far in between. It also means a refresh that dies
// halfway leaves real tips behind rather than nothing.
//
// The app's own rules — lib/tips/rules.js — run on every call regardless, because
// they cost nothing and involve no model.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import {
  FACTS_STALE_DAYS,
  researchFacts,
  tipsForPlace,
  rulesTips,
} from "@/lib/tips/generate";
import { SCOPES } from "@/lib/tips/tip";

export const runtime = "nodejs";
export const maxDuration = 60;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

/** Whether a fact sheet is old enough to be worth re-checking. */
export function factsAreStale(facts, now = Date.now()) {
  if (!facts?.checked_at) return true;
  const at = Date.parse(facts.checked_at);
  if (Number.isNaN(at)) return true;
  return now - at > FACTS_STALE_DAYS * 86400000;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Send a trip.");
  }
  const tripId = String(body?.tripId || "");
  const scope = SCOPES.includes(String(body?.scope))
    ? String(body.scope)
    : "trip";
  const itemId = body?.itemId ? String(body.itemId) : null;
  if (!tripId) return bad("Send a trip.");
  if (scope === "item" && !itemId) return bad("Send the itinerary item.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  // Row-level security does the permission work: a trip the visitor cannot reach
  // simply is not there.
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return bad("That trip is not there.", 404);

  const today = todayISO();

  const [
    { data: itinerary },
    { data: tasks },
    { data: packing },
    { data: going },
    { data: preferences },
    { data: existing },
    { data: facts },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("item_date", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("title, assignee, due_date, timing, is_done")
      .eq("trip_id", tripId)
      .eq("is_done", false),
    supabase.from("packing_items").select("*").eq("trip_id", tripId),
    supabase
      .from("trip_travelers")
      .select("travelers (id, name, is_person)")
      .eq("trip_id", tripId),
    supabase
      .from("travel_preferences")
      .select("*")
      .eq("family_id", trip.family_id),
    supabase
      .from("pro_tips")
      .select("fingerprint, title, scope, itinerary_item_id, status")
      .eq("family_id", trip.family_id),
    supabase.from("trip_facts").select("*").eq("trip_id", tripId).maybeSingle(),
    // Loyalty standings, because a level changes when things can be booked. A
    // Castaway Club level opens shore excursions in an earlier wave than the
    // public one, and a window researched without it is not vague — it is late.
    supabase
      .from("rewards_programs")
      .select(
        "brand, program_name, kind, status_tier, perks, traveler_id, is_active",
      )
      .eq("family_id", trip.family_id),
  ]);

  const travelers = (going || []).map((row) => row.travelers).filter(Boolean);

  // Step one, and only when the fact sheet is missing or a week old. Everything
  // the app works out for itself sits on top of these answers — the passport
  // arithmetic, the voltage tip, and every booking window with a date on it — so
  // there is no point running the rules before they exist.
  if (factsAreStale(facts)) {
    let researched;
    try {
      researched = await researchFacts({
        trip,
        itinerary: itinerary || [],
        memberships: memberships || [],
        travelers,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error?.message || "Could not look that up.", step: "facts" },
        { status: error?.status || 502 },
      );
    }
    if (researched.facts) {
      await supabase.from("trip_facts").upsert(
        {
          trip_id: tripId,
          family_id: trip.family_id,
          ...researched.facts,
          sources: researched.sources,
          model: researched.model,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "trip_id" },
      );
    }
    return NextResponse.json({
      step: "facts",
      facts: researched.facts,
      next: { scope, itemId },
      done: false,
    });
  }

  // The app's own tips. Cheap, certain, and written before the model is asked
  // anything, so its own suggestions can be checked against them.
  const house = rulesTips({
    trip,
    facts,
    packing: packing || [],
    itinerary: itinerary || [],
    today,
  }).filter((tip) => tip.scope === scope);
  let housed = 0;
  if (house.length) {
    const fresh = house.filter(
      (tip) =>
        !(existing || []).some((row) => row.fingerprint === tip.fingerprint),
    );
    if (fresh.length) {
      const { data: inserted } = await supabase
        .from("pro_tips")
        .insert(fresh)
        .select("id");
      housed = (inserted || []).length;
    }
  }

  // Reviews are read across every trip, not just this one, because what they
  // thought of a lodge in 2019 is the best evidence there is about 2027.
  const { data: reviews } = await supabase
    .from("itinerary_items")
    .select("title, location, category, rating, review, trips (name)")
    .not("rating", "is", null)
    .limit(60);

  const item =
    scope === "item"
      ? (itinerary || []).find((row) => row.id === itemId) || null
      : null;
  if (scope === "item" && !item)
    return bad("That itinerary item is not there.", 404);

  // What the model must not tell them: anything already written down, and any tip
  // already offered here — including the ones they have cleared, which is
  // what stops a waved-off tip coming back next week.
  const placeKey = (row) =>
    row.scope === scope &&
    (scope !== "item" || row.itinerary_item_id === itemId);
  const already = (existing || []).filter(placeKey).map((row) => row.title);
  const avoid = [
    ...(tasks || []).map((t) => t.title),
    ...(scope === "packing" ? (packing || []).map((p) => p.item) : []),
    ...already,
  ].filter(Boolean);

  let produced;
  try {
    produced = await tipsForPlace({
      place: {
        family_id: trip.family_id,
        trip_id: tripId,
        itinerary_item_id: scope === "item" ? itemId : null,
        scope,
      },
      avoid,
      known: [
        ...(existing || []).map((row) => row.fingerprint),
        ...house.map((tip) => tip.fingerprint),
      ],
      scope,
      today,
      trip,
      item,
      itinerary: itinerary || [],
      tasks: tasks || [],
      packing: packing || [],
      travelers,
      preferences: preferences || [],
      memberships: memberships || [],
      reviews: (reviews || []).map((row) => ({
        ...row,
        tripName: row.trips?.name || null,
      })),
      already,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.message || "The assistant could not be reached.",
        step: scope,
        housed,
      },
      { status: error?.status || 502 },
    );
  }

  let added = 0;
  if (produced.tips.length) {
    const { data: inserted, error } = await supabase
      .from("pro_tips")
      .insert(produced.tips)
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: "Found tips but could not save them.", step: scope },
        { status: 500 },
      );
    }
    added = (inserted || []).length;
  }

  return NextResponse.json({
    step: scope,
    done: true,
    added: added + housed,
    fromRules: housed,
    // Why nothing came back, when nothing came back. "Looked and found nothing"
    // and "found four and threw them all out" deserve different words on screen.
    considered: produced.tips.length + produced.dropped.length,
    dropped: produced.dropped,
    searched: produced.searched,
    model: produced.model,
  });
}
