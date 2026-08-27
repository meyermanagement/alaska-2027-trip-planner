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
export function houseTips(input) {
  return [...voltageTips(input), ...coverageTips(input)];
}
