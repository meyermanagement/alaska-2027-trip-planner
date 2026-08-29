/**
 * How long it takes to get from one thing to the next.
 *
 * This is the number a departure time rests on, which makes it the number most
 * worth being careful about. Three answers are possible and they are not
 * interchangeable:
 *
 * - `traffic` — Google's Routes API with live conditions at the hour you would
 *   actually be travelling. A real answer.
 * - `typical` — the same road network without live traffic, which is what the
 *   service returns for a departure too far out for conditions to mean anything.
 * - `null` — we do not know. Returned with the straight-line distance so the
 *   screen can say "1.4 miles away" and let a person judge, which is honest, while
 *   a made-up "6 minutes" is not.
 *
 * The third case is not an edge case. The Routes API has to be switched on in
 * Google Cloud with billing attached, and until it is, every lookup lands here.
 * So the shape of a missing answer is designed rather than tacked on: nothing
 * upstream is allowed to treat a null journey as a zero-minute one.
 */

import { haversineKm } from "@/lib/places/photon";

const ENDPOINT = "https://routes.googleapis.com/directions/v2:computeRoutes";

/** Under this, driving is the wrong suggestion and the answer is "walk". */
export const WALKABLE_KM = 1.2;

/** Roads are longer than the crow's route. Only used to describe, never to time. */
export const ROAD_FACTOR = 1.3;

/**
 * Ask Google how long the journey takes.
 *
 * @param from {lat, lon}
 * @param to   {lat, lon}
 * @param opts.departAt  a Date for when the journey would start. Live traffic is
 *   only requested when that is in the future and close enough to be meaningful;
 *   asking for conditions three days out returns a typical time dressed as a live
 *   one, which is exactly the sort of false precision this module exists to avoid.
 * @param opts.mode  "DRIVE", "WALK", "TRANSIT" or "BICYCLE". Only DRIVE asks about
 *   traffic; a train is not held up by it and a pavement even less so. TRANSIT
 *   needs a departure time to mean anything at all, because the answer is mostly
 *   about when the next one leaves.
 *
 * @returns { minutes, source, meters, straightKm, walkable, error }
 *   `minutes` is null whenever we could not find out, whatever the reason.
 */
export async function travelBetween(from, to, opts = {}) {
  // haversineKm takes two points and answers Infinity for a missing one, so the
  // guard comes first rather than trusting the number that comes back.
  const straightKm = points(from, to)
    ? Math.round(haversineKm(from, to) * 100) / 100
    : null;
  const walkable = straightKm !== null && straightKm <= WALKABLE_KM;
  const blank = {
    minutes: null,
    source: null,
    meters: null,
    straightKm,
    walkable,
    error: null,
  };

  if (!points(from, to)) return { ...blank, error: "no-coordinates" };

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { ...blank, error: "no-key" };

  // Same point, or near enough that a route is noise.
  if (straightKm !== null && straightKm < 0.05)
    return { ...blank, minutes: 0, source: "typical", meters: 0 };

  const mode = opts.mode || (walkable ? "WALK" : "DRIVE");
  const live = mode === "DRIVE" && withinTrafficWindow(opts.departAt);

  const body = {
    origin: {
      location: { latLng: { latitude: from.lat, longitude: from.lon } },
    },
    destination: {
      location: { latLng: { latitude: to.lat, longitude: to.lon } },
    },
    travelMode: mode,
  };
  if (mode === "DRIVE") {
    // routingPreference is rejected outright for other modes, which is a 400 and
    // reads as a broken feature rather than an unsupported one.
    body.routingPreference = live ? "TRAFFIC_AWARE" : "TRAFFIC_UNAWARE";
    if (live) body.departureTime = opts.departAt.toISOString();
  }
  if (mode === "TRANSIT") {
    // A transit answer without a departure time is the length of a journey nobody
    // is taking. Waiting for the next one is most of it.
    const at = opts.departAt;
    if (!(at instanceof Date) || Number.isNaN(at.getTime()))
      return { ...blank, error: "no-departure-time" };
    // The API refuses a departure in the past, and a page loaded at 8:59 for a
    // 9:00 item can land there between the check and the call.
    body.departureTime = new Date(
      Math.max(at.getTime(), Date.now() + 60000),
    ).toISOString();
  }

  let raw;
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
      },
      body: JSON.stringify(body),
      signal: opts.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // The most likely failure by far is the Routes API not being enabled on the
      // project, which comes back 403. Named rather than swallowed, so the screen
      // can eventually explain itself instead of just going quiet.
      return {
        ...blank,
        error: res.status === 403 ? "not-enabled" : `http-${res.status}`,
      };
    }
    raw = await res.json();
  } catch {
    return { ...blank, error: "unreachable" };
  }

  return { ...blank, ...readRoute(raw, live), straightKm, walkable };
}

/** Pull minutes and metres out of the response, or nothing if it is empty. */
export function readRoute(raw, live) {
  const route = raw?.routes?.[0];
  if (!route) return { error: "no-route" };
  // Durations come back as a protobuf duration string: "1234s".
  const seconds = Number(String(route.duration || "").replace(/s$/, ""));
  if (!Number.isFinite(seconds)) return { error: "no-duration" };
  return {
    minutes: Math.max(1, Math.round(seconds / 60)),
    source: live ? "traffic" : "typical",
    meters: Number.isFinite(route.distanceMeters) ? route.distanceMeters : null,
    error: null,
  };
}

/**
 * Is live traffic worth asking for?
 *
 * Conditions are forecastable a few hours out and fiction beyond that. Outside
 * this window the honest label is "typical", and asking for TRAFFIC_AWARE anyway
 * would cost more and return the same number under a better-sounding name.
 */
export function withinTrafficWindow(departAt, now = new Date()) {
  if (!(departAt instanceof Date) || Number.isNaN(departAt.getTime()))
    return false;
  const mins = (departAt.getTime() - now.getTime()) / 60000;
  return mins > -30 && mins < 300;
}

/** Distance in the units the family reads, or null. */
export function distanceSaid({ meters, straightKm }) {
  const km = Number.isFinite(meters) ? meters / 1000 : straightKm;
  if (!Number.isFinite(km)) return null;
  const miles = km * 0.621371;
  if (miles < 0.2) return "a few steps";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

/**
 * How the journey should be described, including when it is not known.
 *
 * The straight-line case says "away" rather than a duration on purpose. It is the
 * one phrasing that cannot be misread as a travel time.
 */
export function travelSaid(t) {
  if (!t) return null;
  const dist = distanceSaid(t);
  // Not `=== null`. A journey that failed carries an `error` and no `minutes` key
  // at all, and `undefined` slipped past an equality check to print
  // "undefined min drive" on the day view -- a fabricated number, which is the one
  // thing this file exists to avoid.
  if (!Number.isFinite(t.minutes)) {
    if (!dist) return null;
    return `${dist} away${t.walkable ? ", walkable" : ""}`;
  }
  const how = t.walkable && t.minutes <= 25 ? "walk" : "drive";
  const label = `${t.minutes} min ${how}`;
  if (t.source === "traffic") return `${label} in current traffic`;
  return dist ? `${label} \u00b7 ${dist}` : label;
}

function points(a, b) {
  return (
    Number.isFinite(a?.lat) &&
    Number.isFinite(a?.lon) &&
    Number.isFinite(b?.lat) &&
    Number.isFinite(b?.lon)
  );
}
