import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sortItinerary } from "@/lib/day/order";
import { makeCache } from "@/lib/places/photon";
import { locateItems, anchorPoint, houseOf } from "@/lib/day/locate";
import { dayOf, daySaid, fetchForecasts } from "@/lib/weather/forecast";

export const runtime = "nodejs";
export const maxDuration = 20;

/**
 * The shape of one day further out than the day view reaches.
 *
 * /api/day answers for today and tomorrow, and it does a lot of work to do it:
 * coordinates for every item, a journey between each pair, whatever has been
 * researched. None of that is worth spending on a day six days away, and the
 * hour-by-hour forecast is not worth reading that far out either -- past about
 * two days an hourly series describes a mood rather than a morning.
 *
 * A day's high, low and one sentence does hold up across the week, though. So
 * this is the cheap half of the day service: locate the day's items, ask about
 * the sky at the place they are, and answer with one day's summary. No journeys,
 * no research, no money spent on a model.
 *
 * Answers `weather: null` rather than an error whenever the forecast does not
 * reach that far, which is the normal case for most of a trip planned a year
 * out. The screen says nothing at all in that case, which is the honest thing to
 * say about the weather in Alaska next August.
 */

// The same half hour as the day service, for the same reason: a forecast that
// changes on every page load looks broken, and the data does not move that fast.
const weather = makeCache({ ttlMs: 30 * 60 * 1000, max: 60 });

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const url = new URL(request.url);
  const tripId = url.searchParams.get("trip");
  const date = url.searchParams.get("date");
  if (!tripId || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")))
    return NextResponse.json(
      { error: "A trip and a date are needed." },
      { status: 400 },
    );

  // RLS decides whether this family may see this trip; a miss is a 404 rather
  // than an empty forecast, so a wrong id does not read as fine weather.
  const { data: trip } = await supabase
    .from("trips")
    .select("id, destination, families (home_address, home_lat, home_lon)")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip)
    return NextResponse.json({ error: "No such trip." }, { status: 404 });

  const { data: rows } = await supabase
    .from("itinerary_items")
    .select(
      "id, item_date, start_time, title, category, location, status, lat, lon",
    )
    .eq("trip_id", tripId)
    .eq("item_date", date)
    .order("start_time", { ascending: true, nullsFirst: false });

  const items = sortItinerary(
    (rows || []).filter((i) => i.status !== "cancelled"),
  );

  let points = new Map();
  try {
    points = await locateItems(supabase, items, {
      destination: trip.destination || "",
      home: houseOf(trip),
    });
  } catch {
    points = new Map();
  }

  // One place: the first item of the day that has coordinates. A day line is a
  // day line, and splitting it by place would be pretending to a precision the
  // forecast does not have this far out.
  const anchor = anchorPoint(items, points);
  if (!anchor)
    return NextResponse.json({ date, weather: null, timezone: null });

  const key = `${anchor.lat.toFixed(2)},${anchor.lon.toFixed(2)}`;
  let forecast = weather.get(key);
  if (forecast === undefined) {
    // Seven days is the service's useful range. Asking for more would answer
    // with something, and that something would be climate rather than weather.
    [forecast] = await fetchForecasts([anchor], { days: 7 });
    // Successes only. A cached failure is a day that keeps insisting it has no
    // weather for the next half hour, long after the service has recovered.
    if (forecast) weather.set(key, forecast);
  }

  const day = dayOf(forecast, date);
  return NextResponse.json({
    date,
    timezone: forecast?.timezone || null,
    weather: day ? { ...day, line: daySaid(day) } : null,
  });
}
