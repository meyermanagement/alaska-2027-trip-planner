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
import {
  addressAt,
  addressTrouble,
  looksLikeAddress,
  lookUpAddress,
} from "@/lib/places/street";

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

  // A phone that already knows where it is, asking what that place is called.
  // The reverse of the rest of this route, and it belongs here because the answer
  // is the same shape: a point, a label, and how sure we are of it.
  const at = (request.nextUrl.searchParams.get("at") || "").trim();
  if (at) {
    const [lat, lon] = at.split(",").map((n) => Number(n));
    const { hit, why, detail } = await addressAt(lat, lon);
    if (!hit) {
      const said = addressTrouble(why === "none" ? "nowhere" : why, detail);
      if (why && why !== "none")
        console.warn("reverse lookup", { why, detail });
      return NextResponse.json(
        { error: said || "No address was found at that position." },
        { status: why === "denied" || why === "off" ? 503 : 404 },
      );
    }
    const here = normalizeHere({
      lat: hit.lat,
      lon: hit.lon,
      label: hit.address,
      source: "device",
    });
    if (!here) {
      return NextResponse.json(
        { error: "That came back without a usable position." },
        { status: 502 },
      );
    }
    return NextResponse.json({ here, exact: hit.exact });
  }

  const q = (request.nextUrl.searchParams.get("q") || "").trim().slice(0, 120);
  if (q.length < 2) {
    return NextResponse.json({ error: "Type where you are." }, { status: 400 });
  }

  const key = q.toLowerCase();
  const cached = points.get(key);
  if (cached)
    return NextResponse.json({
      here: cached.here,
      exact: cached.exact,
      cached: true,
    });

  // A house number is asked of Google first, because OpenStreetMap mostly does
  // not have doors and this endpoint now answers "where does the household live"
  // as well as "where are we standing". Everything else keeps the old order.
  let found = null;
  let exact = false;
  // Why the number could not be placed, when one was typed. Carried back so the
  // screen can say "the key is not set up" instead of the family concluding they
  // typed their own address wrong.
  let trouble = "";
  if (looksLikeAddress(q)) {
    const { hit, why, detail, second } = await lookUpAddress(q);
    if (hit) {
      found = { lat: hit.lat, lon: hit.lon, name: hit.address };
      exact = hit.exact;
    } else {
      trouble = addressTrouble(why, detail, second);
      if (why && why !== "none") {
        console.warn("address lookup", { why, detail, second });
      }
    }
  }
  try {
    if (!found) found = pointFrom(await fetchJson(destinationUrl(q)));
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

  // A refusal is not worth remembering for half a day.
  if (!trouble || exact) points.set(key, { here, exact });
  // Whether the point is a door or the middle of the road it is on. The caller
  // decides what to do with that; the difference is a couple of hundred feet,
  // which does not matter for "we are in Skagway" and does for a driveway.
  return NextResponse.json({ here, exact, ...(trouble ? { trouble } : {}) });
}
