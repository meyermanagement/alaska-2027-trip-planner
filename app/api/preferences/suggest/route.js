// Asking Aly what is missing from "how we like to travel".
//
// Reads a great deal and writes nothing, which is the whole design. Every other
// place Aly proposes something, the proposal is a card the family presses to
// apply; here the proposal is a sentence in their own voice, and putting words in
// somebody's mouth is worse than putting a booking on their calendar — a wrong
// booking is visible, a wrong preference quietly bends every plan made after it.
// So this route hands back drafts and the browser saves them one at a time,
// through the same insert the Add a preference form has always used.
//
// One model call, ungrounded. Everything the answer rests on is already in the
// record, so there is nothing to look up and no reason to make them wait for a
// search.

import { NextResponse } from "next/server";
import { topicsInUse } from "@/lib/preferences/topics";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import { resolveAccess } from "@/lib/travelers/access";
import { isDraftTrip, isPastTrip } from "@/lib/format";
import { MODES, suggestedPreferences } from "@/lib/preferences/suggest";

export const runtime = "nodejs";
export const maxDuration = 60;

// What the model may have of the request. The rest pays for the reads before it
// and for answering in words rather than being cut off by the platform, which the
// browser can only report as a failed load.
const MODEL_BUDGET_MS = 40000;

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
  // The screen's own filters, so the answer is about what the person is looking
  // at rather than about the family in general.
  const whose = String(body?.whose || "").trim();
  const tripId = String(body?.tripId || "").trim();
  // Which question was asked: what is missing from their own record, or the
  // ordinary decisions any trip needs. An unrecognized value asks the sharper
  // question, which is the one that can answer "nothing to add".
  const mode = MODES.includes(String(body?.mode))
    ? String(body.mode)
    : "missing";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) return bad("Join a family first.", 403);

  // A secondary traveler cannot open the preferences screen and cannot read most
  // of what the brief is made of, so the answer would come out of an empty record.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary)
    return bad("Only a primary traveler can ask for preference ideas.", 403);

  const today = todayISO();

  const [
    { data: travelers },
    { data: preferences },
    { data: allTrips },
    { data: pets },
  ] = await Promise.all([
    supabase
      .from("travelers")
      .select("id, name, is_person, date_of_birth, about_me, sort_order")
      .eq("family_id", familyId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("travel_preferences")
      .select("id, topic, topics, body, traveler_id, traveler_ids")
      .eq("family_id", familyId),
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("family_id", familyId),
    supabase
      .from("pets")
      .select("name, species, breed")
      .eq("family_id", familyId),
  ]);

  const trips = (allTrips || []).filter(
    (t) => !isPastTrip(t) && !isDraftTrip(t),
  );
  trips.sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const past = (allTrips || [])
    .filter((t) => isPastTrip(t))
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  // Their own verdicts on places they have been. The single most useful thing in
  // the brief, and the reason this feature lives on the same screen as the
  // reviews rather than in the chat panel.
  const { data: places } = past.length
    ? await supabase
        .from("itinerary_items")
        .select("title, category, rating, review")
        .in(
          "trip_id",
          past.map((t) => t.id),
        )
        .in("category", ["lodging", "excursion", "activity", "dining"])
        .or("rating.not.is.null,review.not.is.null")
    : { data: [] };

  // Their own topics, most-used first, with the counts — a topic carrying five
  // preferences is a stronger suggestion than one carrying a single stray, and
  // alphabetical order threw that away.
  const topics = topicsInUse(preferences || []).map(
    (row) => `${row.label} (${row.count})`,
  );

  let result;
  try {
    result = await suggestedPreferences({
      mode,
      travelers: travelers || [],
      preferences: preferences || [],
      trips,
      past,
      places: places || [],
      pets: pets || [],
      topics,
      whose,
      tripName: tripId
        ? (allTrips || []).find((t) => t.id === tripId)?.name || ""
        : "",
      today,
      deadline: startedAt + MODEL_BUDGET_MS,
    });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return bad(
      error?.message || "Aly could not come up with anything just now.",
      status >= 400 && status < 600 ? status : 502,
    );
  }

  console.log(
    `[preferences/suggest] saved=${(preferences || []).length} places=${
      (places || []).length
    } mode=${result.mode} starter=${result.starter} model=${result.model || "none"} kept=${result.suggestions.length} dropped=${
      result.dropped.length
    } ms=${Date.now() - startedAt}`,
  );

  return NextResponse.json({
    suggestions: result.suggestions,
    // Whether these came out of their record or are the ordinary decisions every
    // trip needs. The screen says which, because a suggestion presented as
    // something Aly noticed when she noticed nothing is a small lie that costs
    // trust the first time somebody spots it.
    starter: result.starter,
    mode: result.mode,
    considered: result.suggestions.length + result.dropped.length,
    dropped: result.dropped.length,
    model: result.model,
  });
}
