import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { kindsForCategory, rankPlaces } from "@/lib/places/intent";
import {
  destinationAnchors,
  destinationUrl,
  fetchJson,
  makeCache,
  pointFrom,
  searchUrl,
} from "@/lib/places/photon";

export const runtime = "nodejs";
export const maxDuration = 15;

// Held for the life of the serverless instance. Two people editing the same trip
// type the same place names, and one person types the same name repeatedly while
// making up their mind, so this is where most of the traffic goes to die.
const results = makeCache({ ttlMs: 10 * 60 * 1000, max: 300 });
// Destinations change about never, so their coordinates are worth keeping longer.
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

  // Lean the search towards where the trip is. A failure here is not a failure
  // of the search: an unbiased list is still a useful list.
  let point = null;
  if (near) {
    const pointKey = near.toLowerCase();
    const known = points.get(pointKey);
    if (known !== undefined) {
      point = known;
    } else {
      // "Willemstad, Curacao" resolves whole; "Vancouver, Inside Passage,
      // Denali, Anchorage & Girdwood" only resolves once it is cut down to its
      // first stop. Two requests at most, then held for half a day.
      for (const anchor of destinationAnchors(near)) {
        point = pointFrom(await fetchJson(destinationUrl(anchor)));
        if (point) break;
      }
      points.set(pointKey, point || null);
    }
  }

  const json = await fetchJson(
    searchUrl({ q, lat: point?.lat ?? null, lon: point?.lon ?? null }),
  );
  if (!json) {
    // The geocoder is down or slow. The box stays typeable, which is what it was
    // before this feature existed, so this is a quiet nothing rather than an error.
    return NextResponse.json({ places: [], unavailable: true });
  }

  const places = rankPlaces(json.features || [], kindsForCategory(category));
  results.set(key, places);
  return NextResponse.json({ places });
}
