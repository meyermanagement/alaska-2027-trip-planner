// Where the family is standing, when they choose to say.
//
// "Nearby" is the one question a trip planner cannot answer from saved data. On
// the trip itself the difference matters: measured from the hotel, Westpunt at
// the north end of Curaçao and the beach outside the room look the same, and they
// are forty minutes apart.
//
// Two ways to answer it, and both are the family's choice rather than the app's:
// the phone can be asked once, or someone can type where they are. Nothing is
// sent until they press something. On a ship at sea, in a port with no signal, or
// on the plane, the typed answer is the reliable one - which is why it is a
// first-class way in rather than a fallback bolted on afterwards.

import { haversineKm } from "./photon";

// Past this, a position is a guess about which city you are in rather than a
// position. Wifi positioning at sea routinely reports tens of kilometres, and a
// distance printed from that reads as fact while being fiction.
export const COARSE_M = 5000;

const SOURCES = new Set(["device", "manual"]);

function coord(value, limit) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || Math.abs(n) > limit) return null;
  return Math.round(n * 1e6) / 1e6;
}

/**
 * A position from the browser or from a typed place name, cleaned up.
 * Returns null unless there is a usable point.
 */
export function normalizeHere(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = coord(raw.lat, 90);
  const lon = coord(raw.lon, 180);
  if (lat === null || lon === null) return null;
  // 0,0 is in the Atlantic off Ghana and is what a broken position looks like.
  if (lat === 0 && lon === 0) return null;
  const accuracy =
    typeof raw.accuracy === "number" && raw.accuracy > 0
      ? Math.round(raw.accuracy)
      : null;
  return {
    lat,
    lon,
    accuracy,
    label:
      typeof raw.label === "string" && raw.label.trim()
        ? raw.label.replace(/\s+/g, " ").trim().slice(0, 120)
        : null,
    source: SOURCES.has(raw.source) ? raw.source : "manual",
  };
}

/** Whether a position is precise enough to print a distance from. */
export function precise(here) {
  if (!here) return false;
  // A typed place name has no accuracy figure and is trusted as given: someone
  // saying they are in Skagway knows where they are.
  if (here.source === "manual") return true;
  return here.accuracy === null || here.accuracy <= COARSE_M;
}

/**
 * Which of two positions to measure the day from.
 *
 * The phone wins, because "how long to the next thing" is a question about where
 * somebody is standing right now, and a place typed into the drawer an hour ago
 * is a place they may have left. The one exception is the one this app already
 * respects everywhere else: a coarse fix -- wifi positioning at sea, a cold start
 * indoors -- loses to a typed place, because "somewhere within four miles" makes
 * a worse origin than "Skagway".
 */
export function nearerTruth(device, said) {
  const phone = normalizeHere(device);
  const typed = normalizeHere(said);
  if (!phone) return typed;
  if (!typed) return phone;
  return precise(phone) ? phone : typed;
}

/** Miles, the way this family reads them. */
export function miles(km) {
  return km * 0.621371;
}

/**
 * How far, in words. Deliberately vague close in, because a phone that says
 * fifty feet is usually wrong about which side of the street.
 */
export function distanceLabel(km) {
  if (!Number.isFinite(km) || km < 0) return null;
  const mi = miles(km);
  if (mi < 0.1) return "right here";
  if (mi < 1) return `${(Math.round(mi * 10) / 10).toFixed(1)} mi`;
  if (mi < 10) return `${(Math.round(mi * 10) / 10).toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

/**
 * Distances onto a shortlist, nearest first.
 *
 * Only for places whose coordinates came back from the place lookup: a distance
 * to a name the model typed would be a distance to whatever that name happened
 * to match, which is exactly the kind of confident wrongness to avoid.
 */
export function withDistance(places, here) {
  const list = Array.isArray(places) ? places : [];
  if (!here || !precise(here)) return list;
  const measured = list.map((place) => {
    const lat = coord(place?.lat, 90);
    const lon = coord(place?.lon, 180);
    if (lat === null || lon === null) return { ...place, km: null };
    const km = haversineKm({ lat: here.lat, lon: here.lon }, { lat, lon });
    return {
      ...place,
      km: Number.isFinite(km) ? Math.round(km * 100) / 100 : null,
      distance: distanceLabel(km),
    };
  });
  // Nearest first, and anything unmeasured keeps its place at the back rather
  // than being dropped: it may still be the best suggestion.
  const known = measured
    .filter((p) => p.km !== null)
    .sort((a, b) => a.km - b.km);
  const unknown = measured.filter((p) => p.km === null);
  return [...known, ...unknown];
}

/** How the position is described to the model. */
export function hereLine(here) {
  if (!here) return "";
  const where = here.label ? `${here.label} ` : "";
  const point = `${here.lat.toFixed(4)}, ${here.lon.toFixed(4)}`;
  const how =
    here.source === "device"
      ? here.accuracy
        ? `from their phone, accurate to about ${Math.round(here.accuracy)} m`
        : "from their phone"
      : "because they typed it";
  const caution = precise(here)
    ? ""
    : " That is too rough to measure distances from, so talk about the area rather than how far.";
  return `WHERE THEY ARE RIGHT NOW: ${where}(${point}), ${how}. "Nearby", "near me", "close by" and "walking distance" all mean from there, not from their hotel, unless they say otherwise. Suggest things around that point and say roughly how far each one is.${caution}`;
}

/** A circle for the place lookup to prefer, in the shape Google wants. */
export function bias(here) {
  if (!here) return null;
  return {
    circle: {
      center: { latitude: here.lat, longitude: here.lon },
      // Wide enough to cover a day out, tight enough that it is a real
      // preference rather than a gesture.
      radius: 20000,
    },
  };
}

/** Directions from where they are, rather than a pin they still have to route. */
export function directionsLink(place, here) {
  const name = typeof place?.name === "string" ? place.name.trim() : "";
  if (!name || !here) return null;
  const destination = [name, place?.area].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    api: "1",
    destination,
    origin: `${here.lat},${here.lon}`,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
