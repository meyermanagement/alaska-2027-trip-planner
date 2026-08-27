// The tips the app works out for itself, without asking a model anything.
//
// Some of what looks like advice is not judgement at all. "There is no cell
// coverage on that stretch, so download the maps before you go" is a fact about a
// place plus a date to act on, and "the hairdryer on your list expects 120 volts
// and that country runs at 230" is a lookup and a comparison. Neither needs a
// model to have an opinion.
//
// The passport window used to live here too. It moved to lib/tips/warnings.js,
// because it turned out not to be a tip: there is nothing to weigh up, and a
// thing you cannot weigh up should not come with a Clear button.
//
// So the work is split. Anything that follows from the record by a rule lives
// here, runs every time the screen is drawn, costs nothing, and cannot be wrong
// in the way a model is wrong. Anything that needs judgement or a look at the
// web goes to Gemini. The two produce the same shape of tip and sit in the same
// list, and a tip from this file is the more trustworthy of the two.
//
// What this file needs that the record does not hold is whether a trip leaves the
// country and what comes out of the wall there. Guessing that from the word
// "Alaska" would be wrong in an interesting way - the sailing starts in Vancouver
// - so it is researched once per trip, written to trip_facts, and read here.
//
// Pure. Rows in, tips out, no clock and no network.

import { fingerprintOf } from "./tip";
import { brandTokens, mentionsOperator } from "./members";

// Things that turn mains electricity into heat or motion, which is where voltage
// stops being an adapter problem and becomes a burnt-out appliance problem. A
// phone charger handles the whole world; a hairdryer does not.
const HEAT_APPLIANCE =
  /\b(hair\s?dry(?:er)?|blow\s?dry(?:er)?|straighten(?:er|ing iron)|flat iron|curl(?:er|ing iron|ing wand)|hot brush|steamer|travel iron|kettle|electric razor|shaver|water\s?pik|clippers|heating pad|electric blanket|cpap)\b/i;

const iso = (value) => (typeof value === "string" ? value.slice(0, 10) : "");

/** The same date with whole months added, clamped when the day does not exist. */
export function addMonths(date, months) {
  const raw = iso(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

function stamp(tip) {
  const full = {
    sources: [],
    searched: false,
    model: null,
    status: "active",
    ...tip,
  };
  full.fingerprint = fingerprintOf(full);
  return full;
}

function niceList(values) {
  const list = (values || []).map((v) => String(v).trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * The hairdryer tip: something on the packing list runs on mains electricity, and
 * the mains where they are going is not the mains at home.
 *
 * Named after the actual appliance on their actual list, because "check your
 * voltage" is advice and "the hairdryer you have listed will not survive 230
 * volts" is a fact about their trip.
 */
export function voltageTips({ trip, facts, packing = [], today }) {
  if (!facts?.leaves_country) return [];
  const volts = String(facts.mains_voltage || "");
  // Nothing to say when it is the same 120 V as home, or when nobody has looked.
  if (!volts || /^1[01]\d\b|^120\b/.test(volts)) return [];

  const risky = (packing || [])
    .filter((row) => HEAT_APPLIANCE.test(String(row?.item || "")))
    .slice(0, 4);
  if (!risky.length) return [];

  const names = niceList([...new Set(risky.map((r) => String(r.item).trim()))]);
  const plugs = niceList(facts.plug_types);
  const where = niceList(facts.countries) || trip?.destination || "there";
  const leave = iso(trip?.start_date);

  return [
    stamp({
      family_id: trip?.family_id,
      trip_id: trip?.id,
      itinerary_item_id: null,
      scope: "packing",
      title: `${names} will not survive ${where} on an adapter`,
      body: `${where} runs at ${volts}${plugs ? `, on ${plugs} sockets` : ""}. A plug adapter changes the shape of the pins and nothing about the voltage, so ${names} will either burn out on first use or trip the room. Take a dual-voltage or convertible travel version instead, or plan on the hotel's.`,
      because: `${names} ${risky.length === 1 ? "is" : "are"} on the packing list, and ${where} runs at ${volts} rather than the 120 V it expects.`,
      urgency: "soon",
      // Worth doing before the case is packed rather than before the flight, but
      // the departure date is the honest deadline the app can be sure of.
      act_by: leave || null,
    }),
  ];
}

/**
 * Download the maps before you lose the signal.
 *
 * Only fires when the research came back with something specific to say about
 * coverage - a named stretch of road, a park, a valley. A generic "there may be
 * patchy signal" is the kind of tip this whole feature exists to not send.
 */
export function coverageTips({ trip, facts, today }) {
  const note = String(facts?.coverage_note || "").trim();
  if (note.length < 25) return [];
  const leave = iso(trip?.start_date);
  const where = niceList(facts?.countries) || trip?.destination || "there";
  // Three days out: late enough that the download is current, early enough that
  // it is not a thing to do at the airport.
  const actBy = leave ? shiftDays(leave, -3) : null;

  return [
    stamp({
      family_id: trip?.family_id,
      trip_id: trip?.id,
      itinerary_item_id: null,
      scope: "trip",
      title: "Download the offline maps before you go",
      body: `${note} In Google Maps, search the area and pick Download offline map — it keeps working with the phone in airplane mode, which also spares you ${facts?.leaves_country ? "the roaming bill" : "the dead zone"}. Do it on hotel wifi the night before rather than on the road.`,
      because: `Coverage on ${where}: ${note.slice(0, 120)}`,
      urgency: "soon",
      act_by: actBy,
    }),
  ];
}

function shiftDays(date, days) {
  const at = Date.parse(`${iso(date)}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  return new Date(at + days * 86400000).toISOString().slice(0, 10);
}

/**
 * Every tip the app can work out on its own, for one trip.
 *
 * Order is deliberate: documents first, because a passport is the only item on
 * the list that can stop the trip happening at all.
 */
// ── Booking windows ────────────────────────────────────────────────────────
//
// The most useful travel advice there is has this shape: "the thing you want
// cannot be booked yet, it can be booked on the 14th, and if you are not there on
// the 14th you will not get it." Disney Lightning Lane, restaurant reservations,
// Half Dome permits, Alhambra tickets, the Sagrada Família, Anne Frank House,
// Uffizi, timed-entry national parks — all the same shape, all different numbers.
//
// The numbers are researched once per trip and written to trip_facts. The dates
// are worked out here, because "seven days before check-in" is subtraction and a
// model doing subtraction on request is a model that will eventually be a day out
// on something that sells out in ninety seconds.

/** How many days before an anchor date, as a whole number, or null. */
function daysBefore(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 730) return null;
  return Math.round(n);
}

/** Move an ISO date back by whole days. */
export function minusDays(date, days) {
  const raw = iso(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(days)) return null;
  const at = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  return new Date(at - days * 86400000).toISOString().slice(0, 10);
}

/**
 * When one booking window opens, in dates rather than in days.
 *
 * @param {object} window   a researched entry from trip_facts.booking_windows
 * @param {object} trip
 * @param {Array} itinerary
 * @returns {{opensOn: string|null, anchorDate: string|null}}
 */
export function windowOpensOn(window, trip, itinerary = []) {
  const fixed = iso(window?.opens_on);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fixed))
    return { opensOn: fixed, anchorDate: null };

  const days = daysBefore(window?.opens_days_before);
  if (days === null) return { opensOn: null, anchorDate: null };

  // What the countdown counts back from. Disney counts from check-in for resort
  // guests and from each park day for everyone else, which is why the anchor is
  // part of the researched answer rather than assumed.
  let anchorDate = null;
  let anchorLabel = null;
  const anchor = String(window?.anchor || "trip_start");
  if (anchor === "item") {
    const hit = anchorItem(window, itinerary);
    anchorDate = hit ? iso(hit.item_date) : iso(trip?.start_date);
    anchorLabel = hit ? String(hit.title || "").trim() || null : null;
  } else if (anchor === "trip_end") {
    anchorDate = iso(trip?.end_date);
  } else {
    anchorDate = iso(trip?.start_date);
  }
  if (!anchorDate)
    return { opensOn: null, anchorDate: null, anchorLabel: null };
  return { opensOn: minusDays(anchorDate, days), anchorDate, anchorLabel };
}

/**
 * Which sort of line a window counts back from.
 *
 * A cruise line counts from the sailing, a resort from check-in, a park from the
 * park day. The window's own wording says which, so the kind is read from it and
 * the search is confined to lines of that kind. Order matters: a cruise window
 * that mentions dining is still a cruise window, so cruise is asked first.
 */
const WINDOW_KINDS = [
  [
    /\b(cruise|cruises|sailing|sail|embark\w*|port adventure\w*|shore excursion\w*|onboard|shipboard|stateroom|castaway)\b/,
    ["cruise"],
  ],
  [
    /\b(lightning lane|virtual queue|park pass|park reservation|theme park|attraction\w*|ride|rides|safari|excursion\w*|tour|tours)\b/,
    ["activity", "excursion"],
  ],
  [
    /\b(dining|restaurant\w*|table[- ]service|dinner|breakfast|lunch)\b/,
    ["dining"],
  ],
  [/\b(hotel|resort|check[- ]?in|lodge|room|rooms|stay)\b/, ["lodging"]],
  [/\b(flight|flights|airline|seat|seats|boarding)\b/, ["flight"]],
  [/\b(rental car|car hire|rail|train|transfer)\b/, ["transport"]],
];

/**
 * The line a window's countdown is measured from.
 *
 * The old version looked for the whole of `applies_to` inside a title, which for a
 * phrase like "Disney Dream onboard activities, adult dining, and port adventures"
 * can never match — so every window silently fell back to the trip's first day and
 * came out a week early. Now the kind of line is read from the window's wording,
 * only lines of that kind are considered, and the best-named one wins with the
 * earliest date breaking a tie. No match at all still falls back, but only after
 * genuinely looking.
 */
export function anchorItem(window, itinerary = []) {
  const said =
    `${window?.name || ""} ${window?.applies_to || ""} ${window?.note || ""}`
      .toLowerCase()
      .trim();
  const kinds = WINDOW_KINDS.find(([test]) => test.test(said))?.[1] || null;
  const dated = (itinerary || [])
    .filter((row) => row?.item_date)
    .sort((a, b) => String(a.item_date).localeCompare(String(b.item_date)));
  const pool = kinds
    ? dated.filter((row) =>
        kinds.includes(
          String(row?.category || "")
            .trim()
            .toLowerCase(),
        ),
      )
    : dated;
  if (!pool.length) return null;

  // Among the right sort of line, the one the window actually names.
  const tokens = brandTokens(window?.applies_to, window?.name);
  let best = null;
  let bestScore = -1;
  for (const row of pool) {
    const text = [row?.title, row?.location, row?.notes]
      .filter(Boolean)
      .join(" | ");
    const score = tokens.filter((token) =>
      mentionsOperator(text, token),
    ).length;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  // Nothing in the wording said what sort of line this was, and nothing was
  // named: picking the first line of the trip would be a coincidence dressed up
  // as arithmetic. Better to hand back nothing and let the caller count from the
  // day they arrive, which errs early rather than late.
  if (!kinds && bestScore <= 0) return null;
  return best;
}

/**
 * A dated tip for every booking window that has not closed.
 *
 * Three cases, and they read differently on purpose:
 *   - the window is still shut     → act on the day it opens, dated, "soon"
 *   - it opens inside a fortnight  → dated, "now", so it reaches the banner
 *   - it is already open           → "now", undated, because waiting costs them
 */
export function bookingWindowTips({
  trip,
  facts,
  itinerary = [],
  today,
  memberships = [],
}) {
  const windows = Array.isArray(facts?.booking_windows)
    ? facts.booking_windows
    : [];
  const out = [];

  for (const window of windows.slice(0, 8)) {
    const name = String(window?.name || "").trim();
    const how = String(window?.note || "").trim();
    if (name.length < 3 || how.length < 20) continue;

    const { opensOn, anchorDate, anchorLabel } = windowOpensOn(
      window,
      trip,
      itinerary,
    );
    if (!opensOn) continue;

    // A window that opened and closed before they even planned the trip is not
    // advice, it is a regret.
    const closesOn = iso(window?.closes_on);
    if (closesOn && today && closesOn < today) continue;

    const open = Boolean(today && opensOn <= today);
    const at = String(window?.opens_time || "").trim();
    const applies = String(window?.applies_to || "").trim();
    // The level this window belongs to, when the level is the reason the date is
    // not the one on the public page. Said out loud in the tip, because a date
    // that disagrees with the website is only trustworthy if it explains itself.
    const tier = String(window?.applies_to_status || "").trim();

    // A level they hold with whoever runs this window. When the researched answer
    // already carries a level, this is only confirmation. When it does not, it is
    // the more useful case: the date on screen is the general one and theirs is
    // probably earlier, which is worth saying out loud rather than quietly being
    // a week late.
    const said = `${name} ${how} ${applies}`;
    const standing = tier
      ? null
      : (memberships || []).find(
          (program) =>
            program?.is_active !== false &&
            String(program?.status_tier || "").trim() &&
            mentionsOperator(said, program?.brand, program?.program_name),
        );
    const held = standing ? String(standing.status_tier).trim() : "";

    const bodyBits = [];
    if (open) {
      bodyBits.push(
        `Booking for ${applies || name} opened on ${opensOn}${at ? ` at ${at}` : ""}${tier ? ` for ${tier}` : ""}, so this one is already live.`,
      );
    } else {
      bodyBits.push(
        `Booking opens ${opensOn}${at ? ` at ${at}` : ""}${tier ? ` for ${tier}` : ""}${
          anchorDate
            ? `, counted back from ${anchorLabel ? `${anchorLabel} on ${anchorDate}` : anchorDate}`
            : ""
        }.`,
      );
    }
    if (tier) {
      bodyBits.push(
        `That is your ${tier} date rather than the general one, so the pages you find may quote a later day.`,
      );
    } else if (held) {
      bodyBits.push(
        `That is the general date. You are ${held} with them, and a level usually opens this earlier, so treat ${opensOn} as the latest it could be and check your own wave before then.`,
      );
    }
    bodyBits.push(how);

    out.push(
      stamp({
        family_id: trip?.family_id,
        trip_id: trip?.id,
        itinerary_item_id: null,
        scope: "trip",
        title: open
          ? `${name} can be booked now${applies ? ` for ${applies}` : ""}`
          : `${name} opens ${opensOn}${applies ? ` for ${applies}` : ""}${tier ? ` (${tier})` : ""}`,
        body: bodyBits.join(" ").slice(0, 560),
        because: tier
          ? `${applies || name} is on this trip and you are ${tier}, which is what sets the day.`
          : held
            ? `${applies || name} is on this trip and you are ${held} with them, so the general date is a floor rather than your date.`
            : `${applies || name} is on this trip, and the window is counted from ${anchorLabel ? `${anchorLabel} on ${anchorDate}` : anchorDate || opensOn} rather than from today.`,
        urgency: open ? "now" : "soon",
        // Undated once it is open: a date in the past reads as a missed deadline,
        // and this is the opposite of that.
        act_by: open ? null : opensOn,
        sources: Array.isArray(window?.sources)
          ? window.sources.slice(0, 3)
          : [],
        model: facts?.model || null,
        searched: true,
        // Not a column. The title carries the date, so a corrected date is a new
        // tip rather than an edited one, and without this the old wrong date would
        // sit on the screen beside the right one forever. Whoever saves these
        // retires the earlier tips for the same window.
        _supersedes: name,
      }),
    );
  }

  return out;
}

export function houseTips(input) {
  return [
    ...bookingWindowTips(input),
    ...voltageTips(input),
    ...coverageTips(input),
  ];
}
