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
// thing you cannot weigh up should not come with an Ignore button.
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
  const anchor = String(window?.anchor || "trip_start");
  if (anchor === "item" && window?.applies_to) {
    const needle = String(window.applies_to).toLowerCase();
    const hit = (itinerary || [])
      .filter((row) => row?.item_date)
      .sort((a, b) => String(a.item_date).localeCompare(String(b.item_date)))
      .find(
        (row) =>
          String(row.title || "")
            .toLowerCase()
            .includes(needle) ||
          String(row.location || "")
            .toLowerCase()
            .includes(needle),
      );
    anchorDate = hit ? iso(hit.item_date) : iso(trip?.start_date);
  } else if (anchor === "trip_end") {
    anchorDate = iso(trip?.end_date);
  } else {
    anchorDate = iso(trip?.start_date);
  }
  if (!anchorDate) return { opensOn: null, anchorDate: null };
  return { opensOn: minusDays(anchorDate, days), anchorDate };
}

/**
 * A dated tip for every booking window that has not closed.
 *
 * Three cases, and they read differently on purpose:
 *   - the window is still shut     → act on the day it opens, dated, "soon"
 *   - it opens inside a fortnight  → dated, "now", so it reaches the banner
 *   - it is already open           → "now", undated, because waiting costs them
 */
export function bookingWindowTips({ trip, facts, itinerary = [], today }) {
  const windows = Array.isArray(facts?.booking_windows)
    ? facts.booking_windows
    : [];
  const out = [];

  for (const window of windows.slice(0, 8)) {
    const name = String(window?.name || "").trim();
    const how = String(window?.note || "").trim();
    if (name.length < 3 || how.length < 20) continue;

    const { opensOn, anchorDate } = windowOpensOn(window, trip, itinerary);
    if (!opensOn) continue;

    // A window that opened and closed before they even planned the trip is not
    // advice, it is a regret.
    const closesOn = iso(window?.closes_on);
    if (closesOn && today && closesOn < today) continue;

    const open = Boolean(today && opensOn <= today);
    const at = String(window?.opens_time || "").trim();
    const applies = String(window?.applies_to || "").trim();

    const bodyBits = [];
    if (open) {
      bodyBits.push(
        `Booking for ${applies || name} opened on ${opensOn}${at ? ` at ${at}` : ""}, so this one is already live.`,
      );
    } else {
      bodyBits.push(
        `Booking opens ${opensOn}${at ? ` at ${at}` : ""}${anchorDate ? `, counted back from ${anchorDate}` : ""}.`,
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
          : `${name} opens ${opensOn}${applies ? ` for ${applies}` : ""}`,
        body: bodyBits.join(" ").slice(0, 560),
        because: `${applies || name} is on this trip, and the window is counted from ${anchorDate || opensOn} rather than from today.`,
        urgency: open ? "now" : "soon",
        // Undated once it is open: a date in the past reads as a missed deadline,
        // and this is the opposite of that.
        act_by: open ? null : opensOn,
        sources: Array.isArray(window?.sources)
          ? window.sources.slice(0, 3)
          : [],
        model: facts?.model || null,
        searched: true,
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
