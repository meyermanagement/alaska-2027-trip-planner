import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { makeCache } from "@/lib/places/photon";
import { anchorPoint, locateItems } from "@/lib/day/locate";
import { fingerprint, isStale } from "@/lib/day/mark";
import { travelBetween } from "@/lib/travel/route";
import { dayOf, daySaid, fetchForecast, hourOf } from "@/lib/weather/forecast";
import { minutesOf } from "@/lib/day/phase";
import { normalizeHere } from "@/lib/places/here";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Everything about one day that is not already in the page.
 *
 * The fast half of the day view: coordinates, the forecast, the journey between
 * consecutive items, and whatever insights have already been researched. The
 * research itself is slow and lives in /api/day/brief, because a screen that waits
 * a minute before showing the weather is a worse screen than one that shows the
 * weather and fills in the advice.
 *
 * Every part is allowed to come back empty. Weather can be down, the Routes API
 * may not be switched on, the geocoder may not know a dock by name -- and a day
 * view with the items and no extras is still the day view. Nothing here throws
 * into the page.
 */

// Weather for a point, held for the life of the instance. Half an hour, because a
// forecast that changes every page load looks broken and the underlying data does
// not move faster than that.
const weather = makeCache({ ttlMs: 30 * 60 * 1000, max: 60 });

// Journeys, held briefly. Ten minutes is long enough that scrolling the day rail
// does not re-run every leg, and short enough that "in current traffic" is still
// roughly true when it says so.
const legs = makeCache({ ttlMs: 10 * 60 * 1000, max: 300 });

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const params = request.nextUrl.searchParams;
  const tripId = (params.get("trip") || "").trim();
  const date = (params.get("date") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(tripId) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return NextResponse.json({ error: "Bad request." }, { status: 400 });

  // Where the family says they are, if they have said. Only ever used to measure
  // the first journey of the day from, never stored.
  const here = normalizeHere({
    lat: params.get("lat"),
    lon: params.get("lon"),
    accuracy: params.get("acc"),
    source: params.get("src") || "manual",
  });

  // RLS decides whether this trip is theirs; a row coming back is the check.
  const { data: trip, error: tripError } = await supabase
    .from("trips")
    .select("id, family_id, name, destination, start_date, end_date")
    .eq("id", tripId)
    .maybeSingle();
  if (tripError || !trip)
    return NextResponse.json({ error: "Not found." }, { status: 404 });

  const { data: rows } = await supabase
    .from("itinerary_items")
    .select(
      "id, item_date, end_date, start_time, sort_order, title, category, location, status, notes, lat, lon, geo_query",
    )
    .eq("trip_id", tripId)
    .eq("item_date", date)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  const items = (rows || []).filter((i) => i.status !== "cancelled");
  if (items.length === 0)
    return NextResponse.json({
      date,
      weather: null,
      items: [],
      legs: [],
      pending: 0,
    });

  // --- where things are ----------------------------------------------------
  let points = new Map();
  try {
    points = await locateItems(supabase, items, {
      destination: trip.destination || "",
    });
  } catch {
    points = new Map();
  }

  // --- the sky -------------------------------------------------------------
  const anchor = anchorPoint(items, points);
  let forecast = null;
  if (anchor) {
    const key = `${anchor.lat.toFixed(2)},${anchor.lon.toFixed(2)}`;
    forecast = weather.get(key);
    if (forecast === undefined) {
      forecast = await fetchForecast(anchor.lat, anchor.lon, { days: 4 });
      weather.set(key, forecast);
    }
  }
  const dayWeather = dayOf(forecast, date);

  // --- what has already been researched -----------------------------------
  const { data: stored } = await supabase
    .from("item_insights")
    .select(
      "item_id, fingerprint, dress_code, arrive_minutes, arrive_why, heads_up, bring, sources, model, updated_at",
    )
    .eq("trip_id", tripId)
    .in(
      "item_id",
      items.map((i) => i.id),
    );

  const byItem = new Map((stored || []).map((r) => [r.item_id, r]));

  // --- the journeys --------------------------------------------------------
  //
  // Between consecutive items that both have a point. The first leg is measured
  // from wherever the family said they are, when they have said, because on the
  // morning of a day the useful question is how long it takes from here.
  const timed = items.filter((i) => minutesOf(i.start_time) !== null);
  const journeys = [];
  for (let n = 0; n < timed.length; n += 1) {
    const item = timed[n];
    const to = points.get(item.id);
    if (!to) continue;
    const previous = n === 0 ? null : timed[n - 1];
    const from = previous ? points.get(previous.id) : here;
    if (!from) continue;

    const departAt = departureFor(date, item.start_time, forecast?.timezone);
    const key = [
      from.lat.toFixed(4),
      from.lon.toFixed(4),
      to.lat.toFixed(4),
      to.lon.toFixed(4),
      // Only the hour, so the cache is not defeated by the clock ticking.
      String(item.start_time || "").slice(0, 2),
    ].join(":");

    let leg = legs.get(key);
    if (leg === undefined) {
      leg = await travelBetween(from, to, { departAt });
      legs.set(key, leg);
    }
    journeys.push({
      itemId: item.id,
      fromItemId: previous?.id ?? null,
      fromHere: !previous,
      ...leg,
    });
  }

  // --- put it together ----------------------------------------------------
  const out = items.map((item) => {
    const stale = isStale(byItem.get(item.id), item);
    const insight = stale ? null : byItem.get(item.id);
    return {
      id: item.id,
      hour: hourOf(forecast, date, item.start_time),
      located: points.has(item.id),
      insight: insight
        ? {
            dress_code: insight.dress_code,
            arrive_minutes: insight.arrive_minutes,
            arrive_why: insight.arrive_why,
            heads_up: insight.heads_up,
            bring: insight.bring,
            sources: Array.isArray(insight.sources) ? insight.sources : [],
          }
        : null,
      // True means nobody has looked yet, or the plan moved since they did. The
      // page uses this to decide whether to ask for a brief.
      needsBrief: stale,
      fingerprint: fingerprint(item),
    };
  });

  return NextResponse.json({
    date,
    timezone: forecast?.timezone || null,
    weather: dayWeather ? { ...dayWeather, said: daySaid(dayWeather) } : null,
    items: out,
    legs: journeys,
    pending: out.filter((i) => i.needsBrief).length,
  });
}

/**
 * When the family would set off for something, as an absolute moment.
 *
 * The Routes API wants a real instant to ask about traffic at, and the itinerary
 * only holds a local wall-clock time. The trip's own timezone, which the forecast
 * service resolves from the coordinates, is what turns one into the other -- the
 * app otherwise knows only home's zone and the device's, and neither is right for
 * a dinner in Sitka.
 *
 * Returns null rather than guessing when the zone is unknown, which makes the
 * journey lookup fall back to a typical time instead of pinning live traffic to
 * the wrong hour.
 */
export function departureFor(date, startTime, timezone) {
  const t = String(startTime || "").slice(0, 5);
  if (!timezone || !/^\d{2}:\d{2}$/.test(t)) return undefined;
  try {
    // Build the instant by measuring the zone's offset at that date, rather than
    // trusting a string with no zone in it.
    const naive = new Date(`${date}T${t}:00Z`);
    const label = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "longOffset",
    })
      .formatToParts(naive)
      .find((p) => p.type === "timeZoneName")?.value;
    const match = /GMT([+-])(\d{2}):(\d{2})/.exec(label || "");
    if (!match) return undefined;
    const sign = match[1] === "-" ? -1 : 1;
    const offsetMin = sign * (Number(match[2]) * 60 + Number(match[3]));
    return new Date(naive.getTime() - offsetMin * 60000);
  } catch {
    return undefined;
  }
}
