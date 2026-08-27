// Turns "Skagway" into a point, so someone can say where they are without the
// phone being involved at all.
//
// This is the override, and on this family's trips it is likely to be the one
// that gets used: a cruise ship at sea, a port with no signal, or a phone that
// simply refuses. It goes through the same free geocoder as the location box on
// itinerary items, and it is signed-in only for the same reason - an open proxy
// in front of somebody else's geocoder is how you get blocked.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  destinationUrl,
  fetchJson,
  makeCache,
  pointFrom,
  searchUrl,
} from "@/lib/places/photon";
import { normalizeHere } from "@/lib/places/here";

export const runtime = "nodejs";
export const maxDuration = 15;

// Place names change about never, and a family in one port asks about that port
// repeatedly, so a day is a fair life for an answer.
const points = makeCache({ ttlMs: 12 * 60 * 60 * 1000, max: 100 });

export async function GET(request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) {
    return NextResponse.json({ error: "Type where you are." }, { status: 400 });
  }

  const key = q.toLowerCase();
  const cached = points.get(key);
  if (cached) return NextResponse.json({ here: cached, cached: true });

  // Towns and districts first, because someone typing where they are means a
  // place rather than a building. A hotel name falls through to the wider search.
  let found = null;
  try {
    found = pointFrom(await fetchJson(destinationUrl(q)));
    if (!found) {
      found = pointFrom(await fetchJson(searchUrl({ q, limit: 1 })));
    }
  } catch {
    return NextResponse.json(
      { error: "The place lookup did not answer. Try again in a moment." },
      { status: 503 },
    );
  }

  if (!found) {
    return NextResponse.json(
      {
        error: `I could not find "${q}" on the map. Try the town or the island.`,
      },
      { status: 404 },
    );
  }

  const here = normalizeHere({
    lat: found.lat,
    lon: found.lon,
    label: found.name || q,
    source: "manual",
  });
  if (!here) {
    return NextResponse.json(
      { error: "That came back without a usable position." },
      { status: 502 },
    );
  }

  points.set(key, here);
  return NextResponse.json({ here });
}
