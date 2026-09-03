import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sortItinerary } from "@/lib/day/order";
import { researchDay } from "@/lib/day/insight";
import { fingerprint, isStale } from "@/lib/day/mark";
import { daySaid, dayOf, fetchForecast } from "@/lib/weather/forecast";
import { anchorPoint, houseOf, locateItems } from "@/lib/day/locate";

export const runtime = "nodejs";
// Grounded research runs long. The tips refresh already sits at 120 for the same
// reason, and cutting this shorter turns a slow answer into no answer.
export const maxDuration = 120;

/**
 * Research one day's items, and remember the answers.
 *
 * Separate from /api/day because it is slow and because it costs money. The day
 * view shows itself immediately and asks for this in the background, so the
 * forecast and the timings are never waiting behind a grounded search.
 *
 * Only ever researches items whose fingerprint has moved or that have never been
 * looked at. Opening the same day twice does not spend anything the second time,
 * which is the whole reason the fingerprint exists.
 */
export async function POST(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const tripId = String(body?.trip || "").trim();
  const date = String(body?.date || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(tripId) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const { data: trip } = await supabase
    .from("trips")
    .select(
      "id, family_id, name, destination, start_date, end_date, families (home_address, home_lat, home_lon)",
    )
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // The day has to be part of the trip. Without this the endpoint researches any
  // date somebody posts, which is a way to spend the Gemini budget from outside.
  if (
    (trip.start_date && date < trip.start_date) ||
    (trip.end_date && date > trip.end_date)
  )
    return NextResponse.json(
      { error: "That day is not on this trip." },
      { status: 400 },
    );

  const { data: rows } = await supabase
    .from("itinerary_items")
    .select(
      "id, item_date, start_time, sort_order, title, category, location, status, notes, lat, lon, geo_query",
    )
    .eq("trip_id", tripId)
    .eq("item_date", date)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  const items = sortItinerary(
    (rows || []).filter((i) => i.status !== "cancelled"),
  );
  if (items.length === 0)
    return NextResponse.json({ researched: 0, items: [] });

  const { data: stored } = await supabase
    .from("item_insights")
    .select("item_id, fingerprint")
    .eq("trip_id", tripId)
    .in(
      "item_id",
      items.map((i) => i.id),
    );
  const byItem = new Map((stored || []).map((r) => [r.item_id, r]));

  const todo = items.filter((i) => isStale(byItem.get(i.id), i));
  if (todo.length === 0)
    return NextResponse.json({ researched: 0, items: [], upToDate: true });

  // The forecast goes into the brief so the model does not tell them to bring a
  // jacket on a warm day, and so it can say something useful about an outdoor
  // booking when the afternoon is wet.
  let said = null;
  try {
    const points = await locateItems(supabase, items, {
      destination: trip.destination || "",
      home: houseOf(trip),
      max: 4,
    });
    const anchor = anchorPoint(items, points);
    if (anchor) {
      const forecast = await fetchForecast(anchor.lat, anchor.lon, { days: 3 });
      said = daySaid(dayOf(forecast, date));
    }
  } catch {
    said = null;
  }

  let result;
  try {
    result = await researchDay({
      tripName: trip.name,
      destination: trip.destination,
      date,
      weatherSaid: said,
      items: todo,
      // Leave the platform a few seconds to answer with what we have rather than
      // being killed mid-write.
      deadline: Date.now() + 100000,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error?.timedOut === true
            ? "The search took too long. Try again in a moment."
            : "Aly could not look into today just now.",
      },
      { status: 502 },
    );
  }

  const byId = new Map(todo.map((i) => [i.id, i]));
  const sources = (result.sources || []).slice(0, 6);

  // Written for every item we asked about, including the ones nothing was found
  // for. Recording the blank is the point: without it, an item with no findings
  // is indistinguishable from an item nobody has looked at, and the page asks
  // again on every single load.
  const payload = todo.map((item) => {
    const found = result.insights.find((r) => r.item_id === item.id) || {};
    return {
      family_id: trip.family_id,
      trip_id: tripId,
      item_id: item.id,
      fingerprint: fingerprint(item),
      dress_code: found.dress_code ?? null,
      arrive_minutes: found.arrive_minutes ?? null,
      arrive_why: found.arrive_why ?? null,
      heads_up: found.heads_up ?? null,
      bring: found.bring ?? null,
      // Sources are the day's, not the item's -- the model searches once for the
      // whole day. Only attached where something was actually found, so a blank
      // insight does not look like a cited one.
      sources: hasFinding(found) ? sources : [],
      model: result.model,
    };
  });

  const { error: writeError } = await supabase
    .from("item_insights")
    .upsert(payload, { onConflict: "item_id" });

  if (writeError)
    return NextResponse.json({ error: writeError.message }, { status: 500 });

  return NextResponse.json({
    researched: payload.length,
    found: payload.filter((p) => hasFinding(p)).length,
    searched: result.searched,
    model: result.model,
    items: payload.map((p) => ({
      id: p.item_id,
      dress_code: p.dress_code,
      arrive_minutes: p.arrive_minutes,
      arrive_why: p.arrive_why,
      heads_up: p.heads_up,
      bring: p.bring,
      sources: p.sources,
    })),
    // Named so the page can be honest when the answer came from the model's
    // memory rather than a search.
    grounded: result.searched,
    titles: todo.map((i) => byId.get(i.id)?.title || null),
  });
}

function hasFinding(row) {
  return Boolean(
    row?.dress_code || row?.arrive_minutes || row?.heads_up || row?.bring,
  );
}
