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
import { formatFullDay } from "../format";
import { brandTokens, mentionsOperator } from "./members";
import {
  carrierGroups,
  languagesAcross,
  whoHasAid,
  whoSpeaks,
} from "../travelers/profile";
import { ageOn, birthdayDuring, milestonesBetween } from "../travelers/ages";

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
// Dates in a tip are read as sentences, not as data: "opens Saturday, August 29,
// 2026" is a day someone can picture, where 2026-08-29 has to be decoded. The ISO
// string still goes in act_by, which is a date column the app sorts on.
const day = (value) => formatFullDay(value) || String(value || "");

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
        `Booking for ${applies || name} opened on ${day(opensOn)}${at ? ` at ${at}` : ""}${tier ? ` for ${tier}` : ""}, so this one is already live.`,
      );
    } else {
      bodyBits.push(
        `Booking opens ${day(opensOn)}${at ? ` at ${at}` : ""}${tier ? ` for ${tier}` : ""}${
          anchorDate
            ? `, counted back from ${anchorLabel ? `${anchorLabel} on ${day(anchorDate)}` : day(anchorDate)}`
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
        `That is the general date. You are ${held} with them, and a level usually opens this earlier, so treat ${day(opensOn)} as the latest it could be and check your own wave before then.`,
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
          : `${name} opens ${day(opensOn)}${applies ? ` for ${applies}` : ""}${tier ? ` (${tier})` : ""}`,
        body: bodyBits.join(" ").slice(0, 560),
        because: tier
          ? `${applies || name} is on this trip and you are ${tier}, which is what sets the day.`
          : held
            ? `${applies || name} is on this trip and you are ${held} with them, so the general date is a floor rather than your date.`
            : `${applies || name} is on this trip, and the window is counted from ${anchorLabel ? `${anchorLabel} on ${day(anchorDate)}` : day(anchorDate || opensOn)} rather than from today.`,
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

/**
 * Which lines of an itinerary are of a given sort, named.
 *
 * The access tips are anchored to real bookings for the same reason the voltage
 * tip is named after the actual hairdryer: "think about accessibility" is advice
 * and "the Mendenhall glacier excursion and the White Pass railway are both
 * booked, and neither takes a wheelchair without being asked in advance" is a
 * thing about this trip.
 */
function linesOfKind(itinerary, kinds, limit = 4) {
  return (itinerary || [])
    .filter((row) =>
      kinds.includes(
        String(row?.category || "")
          .trim()
          .toLowerCase(),
      ),
    )
    .map((row) => String(row?.title || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

/**
 * Setting the phones up before the border, by name.
 *
 * Only for a trip that leaves the country, and only when somebody's provider is
 * actually on file — the whole point is to be able to say which company each
 * person has to deal with, because the answer is different at every one of them
 * and looking it up is the part people put off.
 */
export function roamingTips({ trip, facts, travelers = [], today }) {
  if (!facts?.leaves_country) return [];
  const groups = carrierGroups(travelers);
  if (!groups.length) return [];

  const where = niceList(facts?.countries) || trip?.destination || "there";
  const leave = iso(trip?.start_date);
  const carriers = niceList(groups.map((g) => g.carrier));
  const who = groups
    .map(
      (g) =>
        `${niceList(g.who) || "someone"} on ${g.carrier}${
          g.devices.length ? ` (${niceList(g.devices)})` : ""
        }`,
    )
    .join("; ");

  return [
    stamp({
      family_id: trip?.family_id,
      trip_id: trip?.id,
      itinerary_item_id: null,
      scope: "trip",
      title: `Sort ${carriers} out for ${where} before you fly`.slice(0, 90),
      body: `${who}. Every US carrier handles a foreign country differently — some include it, some sell a pass by the day that has to be added before you land, and some just bill by the megabyte — so this is one check per line in each carrier's own app rather than one decision for the family. Whichever phones you decide not to cover, turn data roaming off on those before you go, and if the passes look dear, an eSIM bought at home is usually cheaper on a phone that takes one.`,
      because: `${who} — and this trip goes to ${where}.`,
      urgency: "soon",
      // Days before, not the morning of: a pass that has to be added to an
      // account is a thing to do sitting down, and an eSIM has to arrive.
      act_by: leave ? shiftDays(leave, -5) : null,
    }),
  ];
}

/**
 * The translation pack that has to be downloaded while there is still signal.
 *
 * Needs two things the app now knows: what is spoken where they are going, and
 * what the people going actually speak. When those overlap there is nothing to
 * say and nothing is said.
 */
export function translationTips({ trip, facts, travelers = [], today }) {
  const spoken = (Array.isArray(facts?.languages) ? facts.languages : [])
    .map((l) => String(l || "").trim())
    .filter(Boolean);
  if (!spoken.length) return [];

  // English is the one the family is assumed to have, and a destination that
  // only speaks it has nothing to download.
  const foreign = spoken.filter((l) => !/^english$/i.test(l));
  if (!foreign.length) return [];

  const held = languagesAcross(travelers).map((l) => l.toLowerCase());
  const missing = foreign.filter((l) => !held.includes(l.toLowerCase()));
  // Somebody going speaks all of it. Telling them to download a phrasebook for a
  // language they speak is exactly the kind of tip this file exists to not send.
  if (!missing.length) return [];

  const covered = foreign.filter((l) => held.includes(l.toLowerCase()));
  const coveredBy = covered
    .map((l) => `${niceList(whoSpeaks(travelers, l))} has ${l}`)
    .filter(Boolean);
  const where = niceList(facts?.countries) || trip?.destination || "there";
  const leave = iso(trip?.start_date);

  return [
    stamp({
      family_id: trip?.family_id,
      trip_id: trip?.id,
      itinerary_item_id: null,
      scope: "trip",
      title: `Download ${niceList(missing)} before you lose the signal`.slice(
        0,
        90,
      ),
      body: `${where} runs on ${niceList(spoken)}, and ${
        coveredBy.length
          ? `${niceList(coveredBy)} — but nobody going has ${niceList(missing)}`
          : `nobody going has any of it recorded`
      }. In Google Translate, open the language list and tap the download arrow beside ${niceList(missing)}: the pack makes the camera and the conversation mode work with the phone offline, which is where a menu or a pharmacy label actually gets read. Doing it on home wifi costs nothing and doing it on arrival costs roaming.`,
      because: `${where} speaks ${niceList(missing)}, and that is not on anybody's list of languages.`,
      urgency: "soon",
      act_by: leave ? shiftDays(leave, -3) : null,
    }),
  ];
}

// Each piece of equipment, what it changes, and which sort of booking it changes
// it for. Anchored to categories rather than to words, so a tip only appears when
// the itinerary actually holds the kind of thing being talked about.
const ACCESS_RULES = [
  {
    aid: "wheelchair",
    also: ["mobility_scooter"],
    kinds: ["flight", "cruise", "excursion", "activity", "transport"],
    scope: "trip",
    lead: -21,
    title: (who) => `Ask for ${who}'s chair on each booking, one at a time`,
    body: (who, named) =>
      `A wheelchair is not carried across a reservation — it has to be added to each one, and the number of accessible places on a tour or a coach is usually small and first-come. ${named} ${
        named.includes(",") || / and /.test(named) ? "are" : "is"
      } the ${/ and |,/.test(named) ? "ones" : "one"} to call about: ask what the transfer looks like, whether the chair travels as mobility equipment rather than baggage, and what happens at the tender or the coach step. Get it on the reservation in writing rather than agreed on the phone.`,
    because: (who, named) =>
      `${who} travels with a wheelchair, and ${named} ${/ and |,/.test(named) ? "are" : "is"} booked on this trip.`,
  },
  {
    aid: "stroller",
    kinds: ["flight", "cruise", "activity", "excursion"],
    scope: "trip",
    lead: -7,
    title: () => "Work out where the stroller goes on each of these",
    body: (who, named) =>
      `${named} each have their own rule about a stroller, and they are not the same rule: gate-check tags, a folded size limit, a place it has to be left, or no strollers at all past a certain point. Ask before the day rather than at the door — the answer decides whether the big one comes at all, and a folding umbrella stroller is often the one that fits everywhere.`,
    because: (who, named) =>
      `${who} still needs a stroller, and ${named} ${/ and |,/.test(named) ? "are" : "is"} on the itinerary.`,
  },
  {
    aid: "hearing_aid",
    kinds: ["activity", "excursion", "dining", "cruise"],
    scope: "packing",
    lead: 0,
    title: (who) => `Spares for ${who}'s hearing aid go in the carry-on`,
    body: (who, named) =>
      `Batteries and the charger belong in the bag that stays with you, not in the case that gets checked — a hearing aid that dies on the first morning of a trip like this one is not something you replace on the way. Worth one question at each of ${named}: many tours, theaters and venues lend assistive listening receivers to whoever asks at the desk, and almost nobody asks.`,
    because: (who) =>
      `${who} wears a hearing aid, and most of this trip is spent listening to somebody.`,
  },
  {
    aid: "service_animal",
    kinds: ["flight", "cruise", "lodging", "excursion"],
    scope: "trip",
    lead: -45,
    title: (who) => `${who}'s service animal has paperwork with deadlines`,
    body: (who, named) =>
      `Airlines, ships and hotels each ask for their own form, and several of them close the window weeks before departure — this is the one on the list that cannot be fixed late. Start with ${named}, ask what form and what notice they need, and ask the same question about the destination itself: entry rules for an animal are a separate matter from the carrier's.`,
    because: (who, named) =>
      `${who} travels with a service animal, and ${named} ${/ and |,/.test(named) ? "are" : "is"} booked.`,
  },
];

/**
 * What the equipment changes about this particular itinerary.
 *
 * One tip per piece of equipment at most, and only when the trip actually holds
 * the sort of booking it bears on.
 */
export function accessTips({ trip, travelers = [], itinerary = [], today }) {
  const leave = iso(trip?.start_date);
  const out = [];

  for (const rule of ACCESS_RULES) {
    const people = [
      ...new Set([
        ...whoHasAid(travelers, rule.aid),
        ...(rule.also || []).flatMap((a) => whoHasAid(travelers, a)),
      ]),
    ];
    if (!people.length) continue;
    const lines = linesOfKind(itinerary, rule.kinds);
    if (!lines.length) continue;

    const who = niceList(people);
    const named = niceList(lines);
    out.push(
      stamp({
        family_id: trip?.family_id,
        trip_id: trip?.id,
        itinerary_item_id: null,
        scope: rule.scope,
        title: rule.title(who, named).slice(0, 90),
        body: rule.body(who, named).slice(0, 560),
        because: rule.because(who, named).slice(0, 200),
        // Paperwork with a closing window is the only one of these that is
        // urgent on its own; the rest are things to have settled before packing.
        urgency: rule.lead <= -21 ? "now" : "soon",
        act_by: leave ? shiftDays(leave, rule.lead) : null,
      }),
    );
  }

  return out;
}

/**
 * What somebody's age will have become by the time they travel.
 *
 * This is the rule the record is most likely to be booked against wrongly,
 * because the number in everybody's head is the number today. Veda is twelve now;
 * she is thirteen before Curaçao, and a thirteen-year-old is a different line on a
 * cruise fare, a different club on the ship, and a different ticket at a park. The
 * gap between now and a trip eighteen months out is exactly where a booking is
 * made on last year's age.
 *
 * Only milestones actually crossed between today and the last day of the trip,
 * and at most two per person so a trip far enough out does not produce a list.
 * Fare-changing ones come first, because those cost money rather than attention.
 */
export function ageTips({ trip, travelers = [], today }) {
  const start = iso(trip?.start_date);
  const end = iso(trip?.end_date) || start;
  const now = iso(today);
  if (!start || !now) return [];
  const out = [];

  for (const person of travelers || []) {
    if (!person || person.is_person === false || !person.name) continue;
    const dob = iso(person.date_of_birth);
    if (!dob) continue;
    const name = person.name;

    const crossed = milestonesBetween(dob, now, end)
      .slice()
      .sort((a, b) => (a.fare === b.fare ? 0 : a.fare ? -1 : 1))
      .slice(0, 2);

    for (const milestone of crossed) {
      const atStart = ageOn(dob, start);
      const before = milestone.on > start;
      out.push(
        stamp({
          family_id: trip?.family_id,
          trip_id: trip?.id,
          itinerary_item_id: null,
          scope: "trip",
          title: `${name} is ${milestone.age} ${before ? "during this trip" : "by this trip"}, not ${milestone.age - 1}`,
          body: `${name} turns ${milestone.age} on ${formatFullDay(milestone.on)}, so by ${before ? "partway through the trip" : `the first day (${formatFullDay(start)})`} ${name} ${milestone.what}. ${capital(milestone.why)}. Book on the age at the time, not the age today${typeof atStart === "number" ? ` — ${name} is ${atStart} when you leave` : ""}.`,
          because: `${name}'s birthday is on file as ${dob}, and this trip starts ${start}.`,
          urgency: milestone.fare ? "soon" : "whenever",
          // Worth settling before the booking is made, which is before the
          // birthday itself when the birthday lands before departure.
          act_by: before ? start : milestone.on,
        }),
      );
    }

    const on = birthdayDuring(dob, start, end);
    if (on) {
      const turning = ageOn(dob, on);
      out.push(
        stamp({
          family_id: trip?.family_id,
          trip_id: trip?.id,
          itinerary_item_id: null,
          scope: "trip",
          title: `${name} has a birthday on this trip`,
          body: `${name} turns ${turning} on ${formatFullDay(on)}, while you are away. Hotels, ships and restaurants do something about it when they are told in advance and nothing at all when they are not, so put it on the reservation rather than mentioning it at the desk.`,
          because: `${name}'s birthday is ${dob}, inside ${start} to ${end}.`,
          urgency: "whenever",
          act_by: minusDays(start, 14),
        }),
      );
    }
  }

  return out;
}

function capital(text) {
  const value = String(text || "");
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function houseTips(input) {
  return [
    ...ageTips(input),
    ...bookingWindowTips(input),
    ...voltageTips(input),
    ...coverageTips(input),
    ...roamingTips(input),
    ...translationTips(input),
    ...accessTips(input),
  ];
}
