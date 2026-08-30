/**
 * The ways of getting to the next thing, in the order this family would consider.
 *
 * Three separate questions, kept separate on purpose because they fail
 * differently:
 *
 * 1. Is the mode possible? Distance decides walking. The place decides transit.
 *    Deterministic, and no answer is invented.
 * 2. How long does it take? A routed answer when we have one. Otherwise a walking
 *    estimate, which is honest because walking pace barely varies, or a driving
 *    range, which is honest because it admits its own width. Never a transit
 *    estimate: a transit journey is mostly waiting and walking to the stop, and
 *    a number derived from distance would be fiction.
 * 3. Which does the family want? Read from what they wrote, and applied last so
 *    it reorders options rather than inventing them.
 *
 * The point of the split is that a missing routing key costs us question 2 and
 * leaves 1 and 3 intact. The screen still says walking is twelve minutes and
 * transit is worth checking, which is most of the value.
 */

import { ROAD_FACTOR, WALKABLE_KM } from "@/lib/travel/route";
import { leanOn } from "@/lib/travel/lean";
import { transitWorthOffering } from "@/lib/travel/transit";

/** A family with a child walks at about this, in km/h, including crossings. */
export const WALK_KMH = 4.5;

/** Beyond this many road kilometres, walking is not an option to offer. */
export const WALK_LIMIT_KM = 3.2;

/** Below this, catching anything costs more than walking it. */
export const TRANSIT_FLOOR_KM = 0.8;

/** Below this, a car is absurd. */
export const DRIVE_FLOOR_KM = 0.25;

export const MODE_LABEL = {
  walk: "Walk",
  transit: "Transit",
  drive: "Drive",
};

/** Road distance from a straight line. Describing, not timing. */
export function roadKm(straightKm) {
  return Number.isFinite(straightKm) ? straightKm * ROAD_FACTOR : null;
}

/**
 * Minutes on foot, from distance.
 *
 * Safe to estimate: walking pace is a property of people, not of traffic, and
 * being wrong by three minutes on a fifteen minute walk does not make anybody
 * miss a reservation.
 */
export function walkMinutes(straightKm) {
  const km = roadKm(straightKm);
  if (!Number.isFinite(km)) return null;
  return Math.max(1, Math.round((km / WALK_KMH) * 60));
}

/**
 * A range of minutes in a car, from distance.
 *
 * Deliberately a range. City speeds run from a crawl to clear, and a single
 * number would be a claim about traffic we have not looked at. The spread is
 * wide because the truth is wide.
 */
export function driveRange(straightKm) {
  const km = roadKm(straightKm);
  if (!Number.isFinite(km)) return null;
  // km/h, slow and fast, chosen by how far the journey is: a two-mile hop is all
  // junctions, a thirty-mile one is mostly not.
  const [slow, fast] = km < 3 ? [18, 32] : km < 15 ? [28, 50] : [55, 88];
  const low = Math.max(2, Math.round((km / fast) * 60));
  const high = Math.max(low + 2, Math.round((km / slow) * 60));
  return { low, high };
}

/** "12 min", "8-14 min", or null. */
export function minutesSaid(option) {
  if (Number.isFinite(option?.minutes)) return `${option.minutes} min`;
  if (option?.range) return `${option.range.low}\u2013${option.range.high} min`;
  return null;
}

/**
 * Every way of making one journey, best first.
 *
 * @param opts.straightKm  crow-flies distance, or null
 * @param opts.transit     the result of transitAt() for where the family is
 * @param opts.lean        the result of readLean() over their written preferences
 * @param opts.place       words describing where they are, for exceptions
 * @param opts.routed      { walk, transit, drive } minutes already routed, when we have any
 *
 * @returns [{ mode, label, minutes, range, source, why, wanted }]
 *   `source` is "routed" for a real answer, "estimate" for one derived from
 *   distance, and "unknown" when there is no time at all -- which is a legitimate
 *   option to show, because "transit is good here, go and check" beats silence.
 */
export function travelOptions(opts = {}) {
  const { straightKm = null, transit, lean, place = "", routed = {} } = opts;
  const km = Number.isFinite(straightKm) ? straightKm : null;
  const road = roadKm(km);
  const options = [];

  const routedFor = (mode) => {
    const m = routed?.[mode];
    // Same trap as everywhere else in this feature: a failed lookup carries null
    // and `Number(null)` is 0, so the field is checked before it is trusted.
    return typeof m === "number" && Number.isFinite(m) && m >= 0
      ? Math.round(m)
      : null;
  };

  // --- walking -------------------------------------------------------------
  if (road !== null && road <= WALK_LIMIT_KM) {
    const r = routedFor("walk");
    options.push({
      mode: "walk",
      label: MODE_LABEL.walk,
      minutes: r ?? walkMinutes(km),
      range: null,
      source: r === null ? "estimate" : "routed",
      why: km <= WALKABLE_KM ? "close enough to walk" : null,
      wanted: false,
    });
  }

  // --- transit -------------------------------------------------------------
  const offerTransit =
    transitWorthOffering(transit?.quality) &&
    (road === null || road >= TRANSIT_FLOOR_KM);
  if (offerTransit) {
    const r = routedFor("transit");
    options.push({
      mode: "transit",
      label:
        transit.quality === "resort" ? "Resort transport" : MODE_LABEL.transit,
      minutes: r,
      range: null,
      // No estimate branch. There is no honest way to guess a headway.
      source: r === null ? "unknown" : "routed",
      why: transit.said || null,
      wanted: false,
    });
  }

  // --- driving -------------------------------------------------------------
  if (road === null || road >= DRIVE_FLOOR_KM) {
    const r = routedFor("drive");
    options.push({
      mode: "drive",
      label: MODE_LABEL.drive,
      minutes: r,
      range: r === null ? driveRange(km) : null,
      source: r === null ? (km === null ? "unknown" : "estimate") : "routed",
      why: null,
      wanted: false,
    });
  }

  // --- what the family said ------------------------------------------------
  for (const option of options) {
    // Resort transport is exempt. "Prefer a car over public transportation" is a
    // sentence about cities, and applying it at Walt Disney World produced a
    // Disney bus labelled "you would rather not" -- an objection the family never
    // made to a network they will certainly ride, on a day when their car is
    // parked at the hotel.
    if (option.mode === "transit" && transit?.quality === "resort") {
      option.rank = 0;
      continue;
    }
    const { rank, why } = leanOn(lean, option.mode, place);
    option.rank = rank;
    option.wanted = rank > 0;
    if (rank !== 0 && why) option.why = why;
  }

  return options.sort(byUsefulness).map((o, n) => ({ ...o, best: n === 0 }));
}

/**
 * Order the options.
 *
 * Short distances put walking first whatever anybody wrote down, because a
 * four-minute walk is not a transport decision. Past that, a preference the
 * family took the trouble to record outranks our own view of the place, and only
 * then does a known time beat an unknown one.
 */
function byUsefulness(a, b) {
  return score(b) - score(a);
}

function score(option) {
  let n = 0;
  // Walking is scored by how long it takes, not by being walking. A ten minute
  // walk is the answer and nothing should outrank it. A twenty-eight minute walk
  // in Caribbean heat is not, and the first version of this put it above a five
  // minute drive because the mode itself carried the score.
  if (option.mode === "walk") {
    const m = Number.isFinite(option.minutes) ? option.minutes : 999;
    n += m <= 15 ? 160 : m <= 25 ? 70 : 40;
  }
  if (option.mode === "transit") n += 60;
  if (option.mode === "drive") n += 50;
  // The written preference, weighted to be able to move transit above driving or
  // the other way round, but never to promote a mode over a short walk.
  n += (option.rank || 0) * 45;
  // A time we know is worth more than one we do not, all else equal.
  if (option.source === "routed") n += 8;
  else if (option.source === "estimate") n += 4;
  return n;
}

/** What Google Maps calls each of our modes. */
export const MAPS_MODE = {
  walk: "walking",
  transit: "transit",
  drive: "driving",
};

/**
 * Directions for one mode, to the place the chip is quoting a time for.
 *
 * The chips used to be three inert pills: the app worked out that the tour is a
 * twelve minute drive and then made the family retype the destination into their
 * phone. Each one is now a door to the same journey it just measured, in the mode
 * it measured it in -- tapping "Walk" should not hand you a driving route.
 *
 * No origin is ever sent, and that is the whole design rather than an omission.
 * A route starts where the person holding the phone is standing, which the phone
 * knows to the metre and this app knows at best from something typed some time
 * ago. Passing the previous item as the origin routes them from the restaurant
 * they have already left.
 *
 * @returns string|null  null when there is no destination or no such mode
 */
export function directionsUrl({ to, mode } = {}) {
  const travelmode = MAPS_MODE[mode];
  if (!travelmode) return null;
  if (!Number.isFinite(to?.lat) || !Number.isFinite(to?.lon)) return null;
  // Coordinates rather than the item's title on purpose. The app already geocoded
  // this place; handing Maps "Karstens Public House" invites it to find a
  // different one two thousand miles away.
  const params = new URLSearchParams({
    api: "1",
    destination: `${to.lat},${to.lon}`,
    travelmode,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * One line for the top of the day: how long to the next thing, and by what.
 *
 * @returns string|null  null when there is nothing true to say
 */
export function etaSaid(options = []) {
  const best = options.find((o) => minutesSaid(o));
  if (!best) return null;
  const said = minutesSaid(best);
  const how =
    best.mode === "walk" ? "on foot" : `by ${best.label.toLowerCase()}`;
  // "about" is not decoration. It is the difference between a routed answer and
  // one worked out from a distance, and the family should be able to tell.
  return best.source === "estimate" ? `about ${said} ${how}` : `${said} ${how}`;
}
