import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { haversineKm, makeCache } from "@/lib/places/photon";
import { locateItems } from "@/lib/day/locate";
import { dayEnds } from "@/lib/day/ends";
import { sortItinerary } from "@/lib/day/order";
import { fingerprint, isStale } from "@/lib/day/mark";
import { travelBetween, ROAD_FACTOR } from "@/lib/travel/route";
import { readLean } from "@/lib/travel/lean";
import {
  placeWords,
  transitAt,
  transitWorthOffering,
} from "@/lib/travel/transit";
import {
  travelOptions,
  WALK_LIMIT_KM,
  directionsUrl,
} from "@/lib/travel/modes";
import { topicFamily } from "@/lib/preferences/topics";
import {
  dayOf,
  daySaid,
  fetchForecasts,
  hourOf,
  weatherPoints,
} from "@/lib/weather/forecast";
import { minutesOf } from "@/lib/day/phase";
import { normalizeHere } from "@/lib/places/here";
import { homeToday } from "@/lib/format";

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

// How far from the house the first thing of a day can be before "leave from
// home" stops being a sensible reading of it. Roughly an hour's drive: far
// enough to cover an airport, a port and a weekend two counties over, close
// enough that Anchorage never qualifies.
const HOME_REACH_KM = 90;

/** Whether the first item of a day is close enough to have been left for. */
function nearHome(home, to) {
  if (!home || !to) return false;
  const km = haversineKm(home, to);
  return Number.isFinite(km) && km <= HOME_REACH_KM;
}

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
  // Which item the page believes is next. Only the page knows -- it depends on the
  // clock on the device. The journey to that one item is worth spending several
  // routing calls on; the rest of the day is not.
  const nextId = (params.get("next") || "").trim();
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

  // Where the household leaves from. Only read when nobody has said where they
  // are, because a saved address is a fact about the family and a shared position
  // is a fact about this minute, and the minute wins.
  let home = null;
  if (!here) {
    const { data: household } = await supabase
      .from("families")
      .select("home_address, home_lat, home_lon")
      .eq("id", trip.family_id)
      .maybeSingle();
    home = normalizeHere({
      lat: household?.home_lat,
      lon: household?.home_lon,
      label: household?.home_address,
      source: "manual",
    });
  }

  const { data: rows } = await supabase
    .from("itinerary_items")
    .select(
      "id, item_date, end_date, start_time, sort_order, title, category, location, status, notes, lat, lon, geo_query",
    )
    .eq("trip_id", tripId)
    .eq("item_date", date)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });

  // --- how this family gets around -----------------------------------------
  //
  // Free text, written by them, under whatever heading they chose. Only the
  // getting-around ones are read: a preference about hotel ratings has no opinion
  // about a tram, and feeding it to the reader is how a sentence about parking
  // becomes a claim about walking.
  const { data: prefRows } = await supabase
    .from("travel_preferences")
    .select("topic, topics, body")
    .eq("family_id", trip.family_id);
  const aroundBodies = (prefRows || [])
    .filter((p) =>
      [p.topic, ...(Array.isArray(p.topics) ? p.topics : [])]
        .filter(Boolean)
        .some((t) => topicFamily(t)?.key === "around"),
    )
    .map((p) => p.body)
    .filter(Boolean);
  const lean = readLean(aroundBodies);

  const transit = transitAt(trip.destination || "");
  const place = placeWords(trip.destination || "", transit);

  const items = sortItinerary(
    (rows || []).filter((i) => i.status !== "cancelled"),
  );
  if (items.length === 0)
    return NextResponse.json({
      date,
      weather: null,
      items: [],
      legs: [],
      pending: 0,
      transit: { quality: transit.quality, said: transit.said },
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
  //
  // One forecast per place the day actually visits, not one for the day. A day
  // that starts in Denali and ends in Anchorage is 240 miles and two different
  // afternoons, and every item within a dozen kilometres of a point already asked
  // about shares that answer, so a town full of reservations is still one lookup.
  // The first point is the day's anchor, which keeps the band at the top of the
  // day reading exactly as it did.
  const sky = weatherPoints(items, points);
  const forecasts = new Array(sky.points.length).fill(null);
  const missing = [];
  sky.points.forEach((p, i) => {
    const hit = weather.get(`${p.lat.toFixed(2)},${p.lon.toFixed(2)}`);
    if (hit === undefined) missing.push({ i, p });
    else forecasts[i] = hit;
  });
  if (missing.length > 0) {
    // One request for all of them. Open-Meteo takes several coordinates at once,
    // which is what makes per-item weather affordable enough to be per-item.
    const got = await fetchForecasts(
      missing.map((m) => m.p),
      { days: 4 },
    );
    missing.forEach((m, n) => {
      forecasts[m.i] = got[n] ?? null;
      // Only a forecast is remembered. A failure used to be cached under the same
      // half-hour rule as a success, so one bad second upstream took the weather
      // off the day for thirty minutes and every reload agreed with itself --
      // which reads as the feature being gone rather than the service being busy.
      // Not caching the miss costs a repeat request on a genuinely down service
      // and buys the next page load a chance of an answer.
      if (got[n])
        weather.set(`${m.p.lat.toFixed(2)},${m.p.lon.toFixed(2)}`, got[n]);
    });
  }
  // The anchor's forecast still speaks for the day: the band above the items, the
  // timezone every wall-clock time in this response is resolved in, and whether
  // the day being asked about is today where the family is standing.
  const forecast = forecasts[0] || null;
  const dayWeather = dayOf(forecast, date);

  // A day that ends sixty kilometres or more from where it started is two
  // afternoons, and the band used to print only the first one -- the weather they
  // are leaving, unlabelled, on the day they most need the other. Both ends are
  // reported when they differ, each named in the family's own words.
  const ends = dayEnds(items, sky);
  const endWeather = ends
    ? dayOf(forecasts[ends.endIndex] || null, date)
    : null;

  /** The forecast for the place one item happens, or null when we do not know. */
  const forecastFor = (id) => {
    const at = sky.byItem.get(id);
    return at === undefined ? null : forecasts[at] || null;
  };

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
  // Whether the day being asked about is the day it currently is where the family
  // is standing. The trip's own zone, not the one back home: on the Alaska sailing
  // those are three hours apart, and an Anchorage morning is still yesterday in
  // Missouri for part of it.
  const isToday = date === dayWhere(forecast?.timezone);

  const journeys = [];
  for (let n = 0; n < timed.length; n += 1) {
    const item = timed[n];
    const to = points.get(item.id);
    if (!to) continue;
    const previous = n === 0 ? null : timed[n - 1];
    // The first thing of the day is measured from wherever the family said they
    // are, and failing that from the house -- but only when the house is a
    // plausible answer. Home is the right origin for the morning the trip starts
    // and nonsense for day four in Denali, and the app cannot ask which one this
    // is. So it lets the distance decide: within an hour or so of the driveway,
    // leaving from home is the likeliest reading of the day; past that the
    // family is already away and the honest answer is no departure time at all.
    const from = previous
      ? points.get(previous.id)
      : here || (nearHome(home, to) ? home : null);
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

    // The routed times we have for this leg, by mode. Driving is the one every leg
    // gets. The others are only worth their call on the journey the family is
    // about to make.
    const routed = { drive: leg.minutes };
    if (item.id === nextId) {
      const road = Number.isFinite(leg.straightKm)
        ? leg.straightKm * ROAD_FACTOR
        : null;
      const alsoAsk = [];
      if (road !== null && road <= WALK_LIMIT_KM)
        alsoAsk.push(["walk", "WALK"]);
      if (transitWorthOffering(transit.quality) && transit.quality !== "resort")
        alsoAsk.push(["transit", "TRANSIT"]);
      for (const [name, mode] of alsoAsk) {
        // Transit is the one mode that will not answer without a departure time,
        // and departureFor returns nothing for an item with no time set -- which
        // is most of them. So the leg you are standing at the start of, on the day
        // you are on, was told "times vary" while the service would happily have
        // said 28 minutes for leaving now. Leaving now is the truth in that case,
        // so it is what we ask. Every other leg keeps its silence: a transit time
        // for a journey with no hour is the length of a trip nobody is taking.
        const at =
          mode === "TRANSIT" && !departAt && isToday && !previous
            ? new Date()
            : departAt;
        const modeKey = `${key}:${mode}${at && !departAt ? ":now" : ""}`;
        let hop = legs.get(modeKey);
        if (hop === undefined) {
          hop = await travelBetween(from, to, { departAt: at, mode });
          legs.set(modeKey, hop);
        }
        routed[name] = hop.minutes;
      }
    }

    journeys.push({
      itemId: item.id,
      fromItemId: previous?.id ?? null,
      fromHere: !previous,
      ...leg,
      // Each way of getting there carries its own directions link, so the chip
      // that says "12 min drive" opens a driving route and the one that says
      // "18 min walk" opens a walking one. Never with an origin: the route starts
      // wherever the phone is, not at the item the day thinks they left.
      options: travelOptions({
        straightKm: leg.straightKm,
        transit,
        lean,
        place,
        routed,
      }).map((option) => ({
        ...option,
        link: directionsUrl({ to, mode: option.mode }),
      })),
    });
  }

  // --- put it together ----------------------------------------------------
  const out = items.map((item) => {
    const stale = isStale(byItem.get(item.id), item);
    const insight = stale ? null : byItem.get(item.id);
    return {
      id: item.id,
      // The hour this item happens, where this item happens -- not the day's
      // average and not the anchor's weather wearing this item's time.
      hour: hourOf(forecastFor(item.id), date, item.start_time),
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
    weather: dayWeather
      ? {
          ...dayWeather,
          line: daySaid(dayWeather),
          // Named only when there is a second one to tell it apart from. A label
          // on a single forecast would imply the rest of the day is elsewhere.
          label: endWeather ? ends.startLabel : null,
        }
      : null,
    // The place the day ends, when that is somewhere else. Null on an ordinary
    // day, which is most of them.
    weatherEnd:
      dayWeather && endWeather
        ? {
            ...endWeather,
            line: daySaid(endWeather),
            label: ends.endLabel,
          }
        : null,
    items: out,
    legs: journeys,
    pending: out.filter((i) => i.needsBrief).length,
    // So the page can say why it is or is not offering a train, rather than just
    // being quiet about it.
    transit: { quality: transit.quality, said: transit.said },
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
/** Today as YYYY-MM-DD in a given zone, falling back to the family's own. */
export function dayWhere(timezone, now = new Date()) {
  if (!timezone) return homeToday(now);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    return homeToday(now);
  }
}

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
