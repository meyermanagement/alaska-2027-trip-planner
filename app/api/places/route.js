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
  addressTrouble,
  asSuggestion,
  looksLikeAddress,
  lookUpAddress,
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
// The household's own address, per signed-in person. Short-lived on purpose: it
// is editable on the Family page and a stale one would be offered as the place
// the family lives.
const homes = makeCache({ ttlMs: 5 * 60 * 1000, max: 50 });

/**
 * Where the family lives, as something the list can offer.
 *
 * Almost every trip begins and ends at the same address, and typing it out again
 * on the drive to the airport, the drive home, and the kennel drop-off is work
 * the app already knows the answer to. It is labeled "Home" rather than by its
 * street, because that is what it is to the person choosing it -- and it saves
 * the full address, because that is what a drive has to be measured from.
 */
async function homeSuggestion(supabase, userId) {
  const held = homes.get(userId);
  if (held !== undefined) return held;
  let made = null;
  const { data } = await supabase
    .from("families")
    .select("home_address, home_lat, home_lon, home_precise")
    .not("home_address", "is", null)
    .limit(1);
  const row = data?.[0];
  if (row?.home_address) {
    made = {
      name: "Home",
      detail: row.home_address,
      value: row.home_address,
      kind: row.home_precise ? "address" : "street",
      lat: Number.isFinite(row.home_lat) ? row.home_lat : null,
      lon: Number.isFinite(row.home_lon) ? row.home_lon : null,
    };
  }
  homes.set(userId, made);
  return made;
}

/**
 * Whether Home belongs at the top of this particular list.
 *
 * On an empty box, yes -- that is the tap this exists for. While typing, only
 * when the words point at it, either the word "home" being spelled out or the
 * address itself being typed. Anyone typing a restaurant name should not have to
 * scroll past their own house to reach it.
 */
function wantsHome(q, home, blank) {
  // Nothing typed. Whatever else is in the list was guessed from the title of the
  // thing being planned, and a guess does not outrank the house.
  if (blank) return true;
  const said = q.trim().toLowerCase();
  if (said.length < 2) return true;
  if ("home".startsWith(said)) return true;
  return String(home.detail || "")
    .toLowerCase()
    .includes(said);
}

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

  // Home is offered before anything has been typed, which is the whole point of
  // it, so this runs before the too-short check turns the search away.
  const offerHome = params.get("home") === "1";
  // An empty box, searching for the title instead. Home belongs at the top of it.
  const blank = params.get("blank") === "1";
  const home = offerHome ? await homeSuggestion(supabase, user.id) : null;

  // Two characters is not a search, it is the beginning of one. Home is not a
  // search result, so it still gets through.
  if (q.length < 2) {
    return NextResponse.json({ places: home ? [home] : [] });
  }

  // Home is stitched on after the cache, not into it: the cache is shared by
  // everyone on the instance and the address is not.
  const withHome = (places) => {
    if (!home) return places;
    if (!wantsHome(q, home, blank)) return places;
    return [home, ...places.filter((p) => p.value !== home.value)].slice(0, 6);
  };

  const key = `${q.toLowerCase()}|${near.toLowerCase()}|${category}`;
  const cached = results.get(key);
  if (cached) {
    return NextResponse.json({ places: withHome(cached), cached: true });
  }

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
  const wantsAddress = looksLikeAddress(q);
  const [json, lookup] = await Promise.all([
    fetchJson(searchUrl({ q, lat: bias?.lat ?? null, lon: bias?.lon ?? null })),
    wantsAddress
      ? lookUpAddress(q, {
          bias: bias
            ? {
                circle: {
                  center: { latitude: bias.lat, longitude: bias.lon },
                  radius: 50000,
                },
              }
            : null,
        })
      : { hit: null, why: "", detail: "" },
  ]);
  const exact = lookup.hit;
  if (!json && !exact) {
    // The geocoder is down or slow. The box stays typeable, which is what it was
    // before this feature existed, so this is a quiet nothing rather than an error.
    return NextResponse.json({ places: withHome([]), unavailable: true });
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
  // Why there is no house number in the list, when one was asked for. Said out
  // loud rather than swallowed, because from the outside a missing key, a key
  // without the right API switched on, and an address Google has never heard of
  // all look identical -- an empty result -- and they need different fixes.
  const trouble =
    wantsAddress && !exact
      ? addressTrouble(lookup.why, lookup.detail, lookup.second)
      : "";
  if (trouble) {
    console.warn("address lookup", {
      why: lookup.why,
      detail: lookup.detail,
      second: lookup.second,
    });
  }
  // Only the answer is cached. A refusal or a timeout should be retried on the
  // next keystroke, not remembered for ten minutes.
  if (!trouble || lookup.why === "none") results.set(key, places);
  return NextResponse.json({
    places: withHome(places),
    ...(trouble ? { trouble } : {}),
  });
}
