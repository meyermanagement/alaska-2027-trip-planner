// The airports a household could plausibly leave from.
//
// A deal is only a deal if it leaves from an airport this family would actually
// drive to. "$312 to Lisbon" is a headline out of Newark and an irrelevance from
// a house in Missouri, and until now the app had no way to tell the two apart:
// it knew the street the family lives on and nothing about how they get off the
// ground from there.
//
// The reference list is the public-domain OurAirports dataset, filtered to the
// airports with scheduled service and a three-letter code in the United States,
// Canada and the US territories, and cut to the two size classes that carry
// passengers -- 654 rows, large ones first. It ships as data rather than as a
// lookup so the picker works with no network and cannot answer differently on
// two different days. It is deliberately not the whole planet: this list answers
// "where do we leave from", which is a question about home, and the places a
// family flies *to* are named in words on the bucket list instead.
//
// Source: https://ourairports.com/data/ (public domain), airports.csv.
//
// Nothing in here is a fare, a route or an airline. An airport being 40 miles
// away does not mean anybody flies from it to anywhere useful, and the app never
// implies otherwise -- the family says which of these are theirs.

import { haversineKm } from "@/lib/places/photon";
import { miles } from "@/lib/places/here";
import rows from "./airports.json";

/** Every airport in the reference list. Large airports first, then by code. */
export function allAirports() {
  return rows;
}

/** One airport by its three-letter code, or null. */
export function airportByCode(code) {
  const want = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (want.length !== 3) return null;
  return rows.find((row) => row.code === want) || null;
}

/** "St Louis MO", or just the city when there is no region, or the code. */
export function airportPlace(row) {
  if (!row) return "";
  const city = row.city || "";
  const region = row.country === "US" || row.country === "CA" ? row.region : "";
  if (city && region) return `${city} ${region}`;
  return city || row.code || "";
}

/** "STL — St Louis Lambert International Airport". */
export function airportLabel(row) {
  if (!row) return "";
  return `${row.code} \u2014 ${row.name}`;
}

/**
 * The airports nearest a point, closest first.
 *
 * Straight-line miles, not drive time, and the app says so wherever it prints
 * one: the map data this list carries is a coordinate per airport and nothing
 * about roads. A family who cares about the drive types it themselves, because
 * they are the ones who have done it.
 *
 * Large airports are not favored in the ordering. A regional field twenty
 * minutes away is often the honest first answer, and the size is carried on the
 * row so a caller can say which is which.
 */
export function nearestAirports({ lat, lon, limit = 8, withinMiles = 350 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
  const from = { lat, lon };
  const out = [];
  for (const row of rows) {
    const away = Math.round(
      miles(haversineKm(from, { lat: row.lat, lon: row.lon })),
    );
    if (away > withinMiles) continue;
    out.push({ ...row, miles: away });
  }
  out.sort((a, b) => a.miles - b.miles);
  return out.slice(0, Math.max(1, limit));
}

/**
 * A typed search over the reference list.
 *
 * An exact code wins outright -- somebody typing "MCO" means Orlando and does
 * not want Mount Cook first. After that, a match on the start of a city or an
 * airport name beats one buried in the middle of it, so "spring" finds
 * Springfield before it finds anything with "spring" in its name.
 */
export function searchAirports(query, { limit = 8, near = null } = {}) {
  const q = typeof query === "string" ? query.trim().toLowerCase() : "";
  if (q.length < 2) return [];
  const exact = q.length === 3 ? airportByCode(q) : null;
  const scored = [];
  for (const row of rows) {
    if (exact && row.code === exact.code) continue;
    const city = (row.city || "").toLowerCase();
    const name = row.name.toLowerCase();
    let score = null;
    if (row.code.toLowerCase() === q) score = 0;
    else if (city.startsWith(q)) score = 1;
    else if (name.startsWith(q)) score = 2;
    else if (city.includes(q)) score = 3;
    else if (name.includes(q)) score = 4;
    if (score === null) continue;
    // A tie inside a score band goes to the bigger airport, then to whichever is
    // closer to home when home is known. Typing "portland" should offer PDX
    // before a floatplane dock on the same water.
    const away =
      near && Number.isFinite(near.lat) && Number.isFinite(near.lon)
        ? miles(haversineKm(near, { lat: row.lat, lon: row.lon }))
        : 0;
    scored.push({ row, score, away });
  }
  scored.sort(
    (a, b) =>
      a.score - b.score ||
      Number(b.row.big) - Number(a.row.big) ||
      a.away - b.away ||
      a.row.code.localeCompare(b.row.code),
  );
  const found = scored.slice(0, Math.max(1, limit)).map((s) => s.row);
  return exact ? [exact, ...found].slice(0, Math.max(1, limit)) : found;
}
