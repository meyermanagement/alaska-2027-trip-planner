// Looking at a trip again because the family changed.
//
// One request, one model call, and one stamp. The button that calls this is on
// the trip, next to the look, and it asks a narrower question than the look
// does: not "is there anything worth telling them about Ketchikan" but "Veda is
// in a wheelchair until December and the dog is coming — what does that do to
// this?".
//
// The stamp at the end is the part that makes the band on the trip screen honest.
// The band is drawn by comparing the household as it is now against the
// fingerprint on the trip, so writing today's fingerprint here is what makes the
// band go away: it has been looked at, under these circumstances, and the answers
// are on the Tips tab. Written whether or not the pass found anything, because
// "we asked and the answer was no" is exactly as settled as "we asked and moved
// two bookings".
//
// The contradictions are not asked about and not written. They are arithmetic
// done live on every draw — see lib/trips/contradictions.js — so they cannot be
// answered away by a model, and they are handed to the brief only so it does not
// spend one of its three slots repeating a red band the reader is already looking
// at.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import {
  circumstanceSnapshot,
  changesBetween,
} from "@/lib/trips/circumstances";
import { tripContradictions } from "@/lib/trips/contradictions";
import { reviewTrip, nothingFound } from "@/lib/trips/review";

export const runtime = "nodejs";
// The same ceiling the tips look runs under, for the same reason: a grounded
// answer has a very long tail and the browser stops waiting somewhere around 110
// seconds. See app/api/tips/refresh/route.js.
export const maxDuration = 120;

// What the model may have of it. The rest pays for the reads above, the writes
// below, and the cold start.
const MODEL_BUDGET_MS = 95000;

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request, { params }) {
  const startedAt = Date.now();
  const { id } = await params;
  const tripId = String(id || "");
  if (!tripId) return bad("Send a trip.");

  // Two answers to the same band. "review" asks the model what the changes do to
  // the trip; "settle" is the reader saying they already know, and records
  // today's circumstances as the ones this trip is planned against. The second
  // costs nothing and is not a dismissal: it updates the assumption, which is why
  // the band does not come back for the same change.
  let action = "review";
  try {
    const body = await request.json();
    if (String(body?.action || "") === "settle") action = "settle";
  } catch {
    action = "review";
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  // Row-level security answers the permission question: a trip this person
  // cannot reach simply is not there.
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
    { data: people },
    { data: preferences },
    { data: existing },
    { data: memberships },
    { data: costs },
    { data: pets },
    { data: petLinks },
    { data: facts },
    { data: household },
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
    supabase
      .from("packing_items")
      .select("*")
      .eq("trip_id", tripId)
      .is("stashed_at", null),
    supabase.from("trip_travelers").select("traveler_id").eq("trip_id", tripId),
    // The whole family, not only the roster: the fingerprint is taken from these
    // rows and the brief needs the same people the tips look describes.
    supabase
      .from("travelers")
      .select(
        "id, name, is_person, date_of_birth, gender, phone_carrier, phone_device, mobility_aids, accessibility_notes, languages, about_me",
      )
      .eq("family_id", trip.family_id),
    supabase
      .from("travel_preferences")
      .select("*")
      .eq("family_id", trip.family_id),
    supabase
      .from("pro_tips")
      .select("fingerprint, title, scope, trip_id, itinerary_item_id, status")
      .eq("family_id", trip.family_id),
    supabase
      .from("rewards_programs")
      .select(
        "brand, program_name, kind, status_tier, perks, traveler_id, is_active",
      )
      .eq("family_id", trip.family_id),
    supabase
      .from("trip_costs")
      .select("id, label, category, cost_estimate, cost_actual, cost_note")
      .eq("trip_id", tripId),
    // Everything about an animal that could argue with a booking: what it is,
    // what it weighs, whether it works, and when its papers run out.
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, weight_lb, travel_style, carrier_size, is_service_animal, rabies_expiration, health_certificate_expiration, medications, dietary_notes, temperament_notes",
      )
      .eq("family_id", trip.family_id),
    supabase
      .from("trip_pets")
      .select("pet_id, arrangement, arrangement_notes")
      .eq("trip_id", tripId),
    // The limits layer: an allergy, a knee, a fear of heights, each filed against
    // one person or against the household.
    supabase
      .from("household_facts")
      .select("id, traveler_id, slot, body")
      .eq("family_id", trip.family_id)
      .eq("slot", "limits"),
    supabase
      .from("families")
      .select("home_address")
      .eq("id", trip.family_id)
      .maybeSingle(),
  ]);

  const rosterIds = (going || []).map((row) => row.traveler_id);
  const travelers = (people || []).filter((person) =>
    rosterIds.includes(person.id),
  );

  const now = circumstanceSnapshot({
    people: people || [],
    going: rosterIds,
    pets: pets || [],
    petLinks: petLinks || [],
    facts: facts || [],
    home: household?.home_address || null,
  });
  const changes = changesBetween(trip.circumstances, now);
  const contradictions = tripContradictions({
    trip,
    itinerary: itinerary || [],
    pets: pets || [],
    petLinks: petLinks || [],
    today,
  });

  // What the model must not tell them: anything already written down, and any
  // advice already offered on this trip — including what they put away, which is
  // what stops a waved-off answer coming back the next time something changes.
  const already = (existing || [])
    .filter((row) => row.trip_id === tripId && row.scope === "trip")
    .map((row) => row.title);
  const putAway = (existing || [])
    .filter((row) => row.trip_id === tripId && row.status !== "active")
    .map((row) => row.title);

  if (action === "settle") {
    const { error } = await supabase
      .from("trips")
      .update({
        circumstances: now,
        circumstances_at: new Date().toISOString(),
      })
      .eq("id", tripId);
    if (error) return bad("That could not be saved.", 500);
    return NextResponse.json({ settled: true, changes: changes.length });
  }

  let produced;
  try {
    produced = await reviewTrip({
      deadline: startedAt + MODEL_BUDGET_MS,
      place: {
        family_id: trip.family_id,
        trip_id: tripId,
        itinerary_item_id: null,
        scope: "trip",
        trip_days: Array.from(
          new Set(
            (itinerary || []).map((row) => row.item_date).filter(Boolean),
          ),
        ),
      },
      avoid: [...(tasks || []).map((t) => t.title), ...already].filter(Boolean),
      known: (existing || []).map((row) => row.fingerprint),
      subjects: [...already, ...putAway],
      changes,
      contradictions,
      today,
      trip,
      itinerary: itinerary || [],
      tasks: tasks || [],
      packing: packing || [],
      travelers,
      preferences: preferences || [],
      memberships: memberships || [],
      costs: costs || [],
      already,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error?.timedOut
          ? `${error.message} This pass reads the whole trip and then goes and checks what it finds. Press Look again — nothing was saved, so nothing was lost.`
          : error?.message || "The assistant could not be reached.",
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
        { error: "Found answers but could not save them." },
        { status: 500 },
      );
    }
    added = (inserted || []).length;
  }

  // The stamp. Only after a pass that actually completed: a trip whose review
  // died in the model call has not been looked at, and the band should still say
  // so. A failed write is not worth an error — the answers are saved and the band
  // asking again tomorrow is a smaller fault than losing them.
  const { error: stamped } = await supabase
    .from("trips")
    .update({
      circumstances: now,
      circumstances_at: new Date().toISOString(),
    })
    .eq("id", tripId);
  if (stamped)
    console.log(
      `[trips/review] stamp NOT saved trip=${tripId}: ${stamped.message}`,
    );

  console.log(
    `[trips/review] trip=${tripId} changes=${changes.length} added=${added} considered=${produced.tips.length + produced.dropped.length} searched=${produced.searched} ms=${Date.now() - startedAt}`,
  );

  return NextResponse.json({
    added,
    changes: changes.length,
    considered: produced.tips.length + produced.dropped.length,
    dropped: produced.dropped,
    searched: produced.searched,
    model: produced.model,
    nothing: added === 0 ? nothingFound(changes) : null,
  });
}
