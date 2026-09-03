import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kindsForCategory, rankPlaces } from "@/lib/places/intent";
import {
  biasPoint,
  destinationStops,
  destinationUrl,
  fetchJson,
  makeCache,
  pointFrom,
  searchUrl,
  withoutOutliers,
} from "@/lib/places/photon";
import {
  asSuggestion,
  findAddress,
  looksLikeAddress,
} from "@/lib/places/street";

export const runtime = "nodejs";
export const maxDuration = 15;

// Held for the life of the serverless instance. Two people editing the same trip
// type the same place names, and one person types the same name repeatedly while
// making up their mind, so this is where most of the traffic goes to die.
const results = makeCache({ ttlMs: 10 * 60 * 1000, max: 300 });
// Destinations change about never, so the stops of a trip, once found, are worth
// keeping for the day. This is what keeps a five-stop trip to five lookups
// rather than five per search.
const points = makeCache({ ttlMs: 12 * 60 * 60 * 1000, max: 50 });

/**
 * Place suggestions for the location box.
 *
 * Signed in only. Not because the results are private — they are public map data
 * — but because an open proxy in front of somebody else's free geocoder is a
 * thing that gets the geocoder to block us.
 */
export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const q = (params.get("q") || "").trim().slice(0, 120);
  const near = (params.get("near") || "").trim().slice(0, 120);
  const category = (params.get("category") || "").trim().slice(0, 40);

  // Two characters is not a search, it is the beginning of one.
  if (q.length < 2) return NextResponse.json({ places: [] });

  const key = `${q.toLowerCase()}|${near.toLowerCase()}|${category}`;
  const cached = results.get(key);
  if (cached) return NextResponse.json({ places: cached, cached: true });

  // Every stop on the trip, not just the first one. The bias sent to Photon is
  // the middle stop, and the ranking afterwards measures against all of them, so
  // an Alaska trip that starts in Vancouver prefers Alaska without disowning the
  // day it sails.
  let stops = [];
  if (near) {
    const pointKey = near.toLowerCase();
    const known = points.get(pointKey);
    if (known !== undefined) {
      stops = known;
    } else {
      const found = [];
      const segments = destinationStops(near);
      if (segments.length > 1) {
        // "Willemstad, Curacao" and "Springfield, IL" are one place written in two
        // parts, and splitting them throws away the part that says which
        // Springfield. So the whole thing is asked first, and only a destination
        // that means nothing whole gets taken apart.
        const one = pointFrom(await fetchJson(destinationUrl(near)), near);
        if (one) found.push(one);
      }
      if (!found.length) {
        for (const stop of segments) {
          // A name check on each one: "Inside Passage" comes back as a place in
          // Brazil, and a stop in Brazil would poison every search on the trip.
          const point = pointFrom(await fetchJson(destinationUrl(stop)), stop);
          if (point) found.push(point);
        }
      }
      stops = withoutOutliers(found);
      points.set(pointKey, stops);
    }
  }
  const bias = biasPoint(stops);

  // A typed house number and the free geocoder, asked at the same time. Google
  // is only asked when the query opens with a number, because that is the only
  // shape of question OpenStreetMap is reliably missing the answer to, and it
  // is the one where the missing part is the whole point.
  const [json, exact] = await Promise.all([
    fetchJson(searchUrl({ q, lat: bias?.lat ?? null, lon: bias?.lon ?? null })),
    looksLikeAddress(q)
      ? findAddress(q, {
          bias: bias
            ? {
                circle: {
                  center: { latitude: bias.lat, longitude: bias.lon },
                  radius: 50000,
                },
              }
            : null,
        })
      : null,
  ]);
  if (!json && !exact) {
    // The geocoder is down or slow. The box stays typeable, which is what it was
    // before this feature existed, so this is a quiet nothing rather than an error.
    return NextResponse.json({ places: [], unavailable: true });
  }

  const ranked = rankPlaces(
    json?.features || [],
    kindsForCategory(category),
    stops,
  );
  // The addressed answer goes first and unranked. Somebody who typed a house
  // number wants that house, and the street it is on -- which Photon has just
  // returned and which is now a duplicate of it -- is what they were settling
  // for. The street stays in the list underneath, in case the number was wrong.
  const found = asSuggestion(exact);
  const places = (
    found ? [found, ...ranked.filter((p) => p.value !== found.value)] : ranked
  ).slice(0, 6);
  results.set(key, places);
  return NextResponse.json({ places });
}
