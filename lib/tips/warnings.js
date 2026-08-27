// Warnings are not tips, and the difference is worth being strict about.
//
// A pro tip is advice. You can take it or leave it, which is why a tip can be
// cleared and why the app keeps a note of the ones you waved off. A
// warning is the record contradicting itself: a passport that expires inside the
// window the border will actually check, on a trip that is already booked. There
// is nothing to weigh up, and offering a Clear button on it would be offering
// to hide the thing most likely to end the holiday at a check-in desk.
//
// So warnings are handled the opposite way round from tips in every respect:
//
//   - Worked out live, every time a screen is drawn, from the passport dates and
//     the return date. Nothing is stored.
//   - Therefore never stale. Renew the passport, put the new date in, and the
//     warning is gone on the next page load because the arithmetic that produced
//     it stopped being true. A stored warning would need clearing by hand, and a
//     warning you can clear by hand is a warning that outlives its cause.
//   - Not dismissible, and loud. It sits under the header on every screen.
//
// No model is involved. This is subtraction.

import { addMonths } from "./rules";

// What most countries want left on a passport, counted from the day you leave.
export const PASSPORT_MONTHS = 6;

const iso = (value) => (typeof value === "string" ? value.slice(0, 10) : "");

function niceList(values) {
  const list = (values || [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The best passport on file per traveler, as an ISO expiry or null. */
export function bestPassports(documents = []) {
  const out = new Map();
  for (const doc of documents) {
    if (String(doc?.doc_type || "") !== "passport") continue;
    const expiry = iso(doc.expiration_date);
    if (!expiry) continue;
    const held = out.get(doc.traveler_id);
    if (!held || expiry > held) out.set(doc.traveler_id, expiry);
  }
  return out;
}

/**
 * Where each traveler stands against one trip's return date.
 *
 * @returns {"expired"|"short"|"missing"|"fine"}
 *   expired  the passport runs out before they are back
 *   short    valid for the trip, but inside the six-month window at the border
 *   missing  no passport recorded at all
 *   fine     nothing to say
 */
export function passportStanding({ expiry, returnDate }) {
  if (!expiry) return "missing";
  const back = iso(returnDate);
  if (!back) return "fine";
  if (expiry < back) return "expired";
  const mustLastUntil = addMonths(back, PASSPORT_MONTHS);
  if (mustLastUntil && expiry < mustLastUntil) return "short";
  return "fine";
}

/**
 * Every passport problem across the trips that have not happened yet.
 *
 * Only for trips that leave the country: a passport is not needed to get to
 * Orlando, and a warning band about one there would teach everybody to scroll
 * past the band. Whether a trip leaves the country is researched once and kept
 * in trip_facts rather than guessed from the destination — guessing would call
 * this family's Alaska cruise domestic, and it sails from Vancouver.
 *
 * @param {object} input
 * @param {Array} input.trips  [{id, name, slug, end_date, family_id,
 *                              leavesCountry, countries,
 *                              going: [{id, name, is_person}]}]
 * @param {Array} input.documents  traveler_documents rows for those people
 * @param {string} input.today
 * @returns {Array} one per trip that has something wrong, worst trip first
 */
export function passportWarnings({ trips = [], documents = [], today }) {
  const passports = bestPassports(documents);
  const out = [];

  for (const trip of trips) {
    if (!trip?.leavesCountry) continue;
    const back = iso(trip.end_date);
    // A trip already behind us cannot be helped by renewing anything.
    if (!back || (today && back < today)) continue;
    const mustLastUntil = addMonths(back, PASSPORT_MONTHS);

    const expired = [];
    const short = [];
    const missing = [];
    for (const person of trip.going || []) {
      if (!person || person.is_person === false) continue;
      const expiry = passports.get(person.id) || null;
      const standing = passportStanding({ expiry, returnDate: back });
      if (standing === "expired") expired.push({ name: person.name, expiry });
      else if (standing === "short") short.push({ name: person.name, expiry });
      else if (standing === "missing") missing.push({ name: person.name });
    }
    if (!expired.length && !short.length && !missing.length) continue;

    const where =
      niceList(trip.countries) || trip.destination || "outside the US";
    out.push({
      tripId: trip.id,
      tripName: trip.name,
      tripSlug: trip.slug,
      returnDate: back,
      mustLastUntil,
      where,
      expired,
      short,
      missing,
      // Worst thing wrong with this trip, which is what the band leads with.
      severity: expired.length ? "expired" : short.length ? "short" : "missing",
      headline: headlineFor({
        trip,
        expired,
        short,
        missing,
        back,
        mustLastUntil,
      }),
    });
  }

  const rank = { expired: 0, short: 1, missing: 2 };
  out.sort(
    (a, b) =>
      rank[a.severity] - rank[b.severity] ||
      String(a.returnDate).localeCompare(String(b.returnDate)),
  );
  return out;
}

/**
 * The one sentence the band says.
 *
 * Written to explain why nothing looks wrong, because that is the whole trap with
 * the six-month rule: the passport is valid for every day of the trip, so every
 * check the family would think to make comes back clean.
 */
export function headlineFor({
  trip,
  expired,
  short,
  missing,
  back,
  mustLastUntil,
}) {
  if (expired.length) {
    const who = niceList(expired.map((p) => `${p.name}'s`));
    return `${who} passport expires before you fly home from ${trip.name} on ${back}.`;
  }
  if (short.length) {
    const who = niceList(short.map((p) => `${p.name}'s (${p.expiry})`));
    return `${who} passport is valid for ${trip.name} but expires before ${mustLastUntil} — six months past your ${back} return, which is the date the border checks.`;
  }
  return `No passport on file for ${niceList(missing.map((p) => p.name))}, and ${trip.name} leaves the country.`;
}

/** How many people, across every trip, have something wrong. Used for the band. */
export function countAffected(warnings = []) {
  const names = new Set();
  for (const warning of warnings) {
    for (const group of [warning.expired, warning.short, warning.missing]) {
      for (const person of group || []) names.add(person.name);
    }
  }
  return names.size;
}
