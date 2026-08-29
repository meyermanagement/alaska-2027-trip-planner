/**
 * When to leave.
 *
 * The useful sentence on a trip is not "dinner at 7:30." It is "leave by 6:55."
 * Getting there takes three things: how long the journey is, how early you have to
 * be, and what time the thing starts. The app knows the third, can usually find
 * the first, and the second is either researched or a well-known rule.
 *
 * The discipline here is that a departure time is a promise. Every number that
 * goes into one is labelled with where it came from, and if the journey is unknown
 * the answer is the buffer alone with the journey named as missing -- never a
 * plausible-looking time built on a guessed drive. A fabricated "leave by 4:15"
 * for a flight is worse than silence, because silence sends you to look it up.
 */

/**
 * How early to be there, when nobody has researched this particular booking.
 *
 * These are the published rules and common practice, not guesses:
 * - Flights: two hours for domestic check-in and security is the standard airline
 *   and TSA recommendation; three for international.
 * - Cruise embarkation: terminals close well before sailing, and the all-aboard
 *   time is usually an hour or more before departure.
 * - Ticketed tours and excursions: operators almost universally say fifteen to
 *   thirty minutes before departure.
 * - Restaurants: a few minutes, because a reservation held is a reservation lost.
 *
 * A researched value for the actual booking always beats these.
 */
export const DEFAULT_BUFFER = {
  flight: 120,
  cruise: 90,
  excursion: 20,
  activity: 15,
  dining: 5,
  transport: 10,
  lodging: 0,
};

/** Words for why a buffer is what it is, so the screen can say it. */
export const BUFFER_REASON = {
  flight: "check-in and security",
  cruise: "terminal check-in",
  excursion: "operator check-in",
  activity: "getting in and seated",
  dining: "holding the table",
  transport: "being there before it leaves",
  lodging: "",
};

/**
 * The buffer to use, and where it came from.
 *
 * `insight.arrive_minutes` is what Aly found for this specific booking -- the
 * operator's own instruction, which beats any rule of thumb. `source` is carried
 * through so the screen can distinguish "the tour company says 30 minutes" from
 * "tours usually want 20."
 */
export function bufferFor(item, insight = null) {
  const researched = Number(insight?.arrive_minutes);
  if (Number.isFinite(researched) && researched >= 0 && researched <= 480) {
    return {
      minutes: Math.round(researched),
      source: "researched",
      why: insight?.arrive_why || null,
    };
  }
  const key = item?.category;
  if (key in DEFAULT_BUFFER) {
    return {
      minutes: DEFAULT_BUFFER[key],
      source: "rule",
      why: BUFFER_REASON[key] || null,
    };
  }
  return { minutes: 0, source: "none", why: null };
}

/**
 * When to leave for an item, and what that answer rests on.
 *
 * @param item      the itinerary row (needs `start_time` and `category`)
 * @param travel    { minutes, source } from the routing lookup, or null
 * @param insight   the researched insight for this item, or null
 *
 * @returns null when the item has no start time -- there is nothing to be early
 *   for. Otherwise { leaveHM, startHM, bufferMinutes, travelMinutes, complete,
 *   missing }, where `complete` is false when the journey is unknown and
 *   `missing` names what is absent so the screen can say so instead of implying
 *   the number is whole.
 */
export function leaveBy(item, travel = null, insight = null) {
  const start = minutesOfTime(item?.start_time);
  if (start === null) return null;

  const buffer = bufferFor(item, insight);
  // Read the field before coercing it. `Number(null)` is 0, and `Number(undefined)`
  // is NaN, so a failed routing lookup -- which carries `minutes: null` and an
  // error -- came through as a journey of zero minutes and the screen printed a
  // real-looking departure time built on nothing. A travel time must be a finite
  // number BEFORE it is turned into one.
  const raw = travel?.minutes;
  const travelMinutes =
    typeof raw === "number" && Number.isFinite(raw) && raw >= 0
      ? Math.round(raw)
      : null;

  const leave = start - buffer.minutes - (travelMinutes ?? 0);

  return {
    startHM: pad(start),
    leaveHM: pad(leave),
    bufferMinutes: buffer.minutes,
    bufferSource: buffer.source,
    bufferWhy: buffer.why,
    travelMinutes,
    travelSource: travelMinutes === null ? null : travel?.source || null,
    // False means the leave time counts the buffer but not the journey. The
    // screen must not print it as a departure time.
    complete: travelMinutes !== null,
    missing: travelMinutes === null ? "travel" : null,
  };
}

/**
 * Is this departure time already behind us?
 *
 * The point of a leave-by is the moment it stops being advice and becomes a
 * problem. Only ever true for a complete answer -- a partial one is not something
 * to raise an alarm about.
 */
export function running(plan, nowHM) {
  if (!plan || !plan.complete) return false;
  const now = minutesOfTime(nowHM);
  if (now === null) return false;
  return minutesOfTime(plan.leaveHM) <= now;
}

function minutesOfTime(value) {
  const s = String(value || "").slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(s)) return null;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
}

function pad(minutes) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(
    m % 60,
  ).padStart(2, "0")}`;
}
