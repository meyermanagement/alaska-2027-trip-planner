// Whether one fare is good news for THIS household.
//
// A deals blog can only say a fare is cheap, which is a claim about the market.
// This file answers the question the family actually has, and every part of the
// answer comes from a row they typed: the airports they leave from, the fare they
// said a place was worth, the months it works in, the trip they already have in
// drafts, the budget they set on it, how many of them are going, and what else is
// on the calendar that week.
//
// Two rules hold everywhere below.
//
// Nothing is inferred. A drive time that was never typed is absent rather than
// estimated, a ceiling that was never set produces no verdict on price, and a
// place with no coordinates is matched on words or not at all. Every function here
// can return "cannot tell", and that is a better answer than a confident one.
//
// Nothing is written down. The verdict is computed at read time, every time, so a
// card cannot go on saying a fare is $451 under budget after the budget moved.
// That is why this module is pure: no database, no clock of its own beyond the
// today it is handed, and no model.

import { buildBudget, money, readMoney } from "@/lib/budget/budget";
import { formatFullDay } from "@/lib/format";
import { formatPoints } from "@/lib/rewards";
import { monthsSaid, monthWanted } from "@/lib/someday/months";
import { driveSaid } from "@/lib/airports/drive";

/** Words that carry no information when matching one place name against another. */
const NOISE =
  /\b(the|a|an|and|to|from|in|of|city|island|islands|airport|intl|international|greater|area)\b/g;

function words(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(NOISE, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Whether two place names are about the same place, as far as words can say.
 *
 * Deliberately generous in one direction and strict in the other: "Lisbon" should
 * match "Lisbon, Portugal" and "Portugal" should match "Lisbon, Portugal", because
 * a fare is announced in whichever of them the writer preferred. But a shared
 * noise word must never match, which is what the filtering above is for -- an
 * "island" in both strings is not a place in common.
 */
export function placeMatches(a, b) {
  const left = words(a);
  const right = words(b);
  if (!left.length || !right.length) return false;
  return left.some((word) =>
    right.some(
      (other) =>
        word === other ||
        (word.length >= 5 && other.startsWith(word)) ||
        (other.length >= 5 && word.startsWith(other)),
    ),
  );
}

/** The someday line this fare is about, if it is about one. */
export function somedayFor(deal, someday = []) {
  const rows = (someday || []).filter((row) => row && row.status === "open");
  const named = [deal?.destination, deal?.destination_code]
    .filter(Boolean)
    .join(" ");
  // The most specific match wins, so a fare to Lisbon lands on "Lisbon" rather
  // than on "Portugal" when the family happens to have written both down.
  let best = null;
  let bestScore = 0;
  for (const row of rows) {
    const onPlace = placeMatches(named, row.place);
    const onRegion = row.region ? placeMatches(named, row.region) : false;
    if (!onPlace && !onRegion) continue;
    const score = onPlace ? 2 : 1;
    if (score > bestScore) {
      best = row;
      bestScore = score;
    }
  }
  return best;
}

/**
 * What the fare does to the ceiling the family set.
 *
 * Only ever a comparison of their number with the pasted number. When there is no
 * ceiling this returns a verdict of null rather than a guess, because "cheap for
 * Japan" is exactly the kind of claim this app does not make.
 */
export function ceilingCheck(deal, place) {
  const price = readMoney(deal?.price);
  const ceiling = readMoney(place?.fare_ceiling);
  if (price === null || ceiling === null) return { verdict: null };
  const delta = Math.round(ceiling - price);
  return {
    verdict: delta >= 0 ? "under" : "over",
    delta: Math.abs(delta),
    ceiling,
    price,
  };
}

/** Whether the travel window falls in the months the place is wanted in. */
export function monthCheck(deal, place) {
  const months = place?.months || [];
  if (!place) return { verdict: null };
  if (!months.length) return { verdict: "any" };
  const start = deal?.travel_start;
  const end = deal?.travel_end;
  if (!start && !end) return { verdict: null };
  // A window can span months, and a fare good for March and April suits a family
  // who can only go in April. So the test is whether ANY month it covers works.
  const covered = new Set();
  const from = start || end;
  const to = end || start;
  const cursor = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime()))
    return { verdict: null };
  let guard = 0;
  while (cursor <= last && guard < 40) {
    covered.add(cursor.getUTCMonth() + 1);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    guard += 1;
  }
  covered.add(Number(String(to).slice(5, 7)));
  const fits = [...covered].some((m) =>
    monthWanted(months, `2000-${String(m).padStart(2, "0")}-01`),
  );
  return { verdict: fits ? "fits" : "misses", said: monthsSaid(months) };
}

/**
 * Where it leaves from, in the family's own terms.
 *
 * Three answers, and the third is the interesting one: an airport they use, an
 * airport they do not, or one of theirs that costs a drive worth mentioning
 * against the saving. The drive is only ever the number they typed.
 */
export function originCheck(deal, airports = []) {
  const code = String(deal?.origin || "").toUpperCase();
  const rows = (airports || []).filter((row) => row && row.code);
  const mine = rows.find((row) => String(row.code).toUpperCase() === code);
  if (!mine)
    return {
      verdict: rows.length ? "not ours" : null,
      code,
      ours: rows.map((row) => row.code),
    };
  const drive = Number(mine.drive_minutes);
  return {
    verdict: "ours",
    code,
    row: mine,
    primary: Boolean(mine.is_primary),
    drive: Number.isFinite(drive) && drive > 0 ? drive : null,
  };
}

/** The trip this fare would be for, when one already exists. */
export function tripFor(deal, trips = []) {
  const named = [deal?.destination, deal?.destination_code]
    .filter(Boolean)
    .join(" ");
  const live = (trips || []).filter(
    (trip) => trip && trip.status !== "complete" && trip.status !== "cancelled",
  );
  const onPlace = live.filter(
    (trip) =>
      placeMatches(named, trip.destination) || placeMatches(named, trip.name),
  );
  if (!onPlace.length) return null;
  // A trip whose dates the fare actually covers beats one that only shares a
  // destination, because that is the trip the family would put it on.
  const overlapping = onPlace.find((trip) => overlaps(deal, trip));
  return overlapping || onPlace[0];
}

function overlaps(deal, trip) {
  const aStart = deal?.travel_start;
  const aEnd = deal?.travel_end || deal?.travel_start;
  const bStart = trip?.start_date;
  const bEnd = trip?.end_date || trip?.start_date;
  if (!aStart || !bStart) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * Anything already on the calendar inside the fare's travel window.
 *
 * The point is not to refuse the fare. It is to say the one sentence a family
 * would want said out loud before they booked -- that the cheap week in Portugal
 * is the week of the horse show -- and then let them decide.
 */
export function clashesWith(deal, { trips = [], itinerary = [], trip = null }) {
  const start = deal?.travel_start;
  const end = deal?.travel_end || deal?.travel_start;
  if (!start) return [];
  const out = [];
  for (const other of trips || []) {
    if (!other || other.id === trip?.id) continue;
    if (other.status === "complete" || other.status === "cancelled") continue;
    if (!overlaps(deal, other)) continue;
    out.push({ kind: "trip", name: other.name, date: other.start_date });
  }
  // A dated commitment that is not a trip of its own -- a show, a wedding, a
  // recital somebody put on an itinerary -- counts just as much.
  for (const item of itinerary || []) {
    if (!item || !item.item_date) continue;
    if (item.item_date < start || item.item_date > end) continue;
    if (item.trip_id && item.trip_id === trip?.id) continue;
    const owner = (trips || []).find((t) => t.id === item.trip_id);
    if (owner && (owner.status === "complete" || owner.status === "cancelled"))
      continue;
    out.push({
      kind: "item",
      name: item.title || "something booked",
      date: item.item_date,
      trip: owner?.name || null,
    });
  }
  // Only ever a handful, and the earliest are the ones worth naming.
  return out
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 3);
}

/** How many people this fare has to cover, from the roster rather than a guess. */
export function partyFor(trip, { rosters = [], travelers = [], place = null }) {
  if (trip) {
    const ids = (rosters || [])
      .filter((row) => row && row.trip_id === trip.id)
      .map((row) => row.traveler_id);
    if (ids.length) return { count: ids.length, from: "roster" };
  }
  const wanted = (place?.traveler_ids || []).filter(Boolean);
  if (wanted.length) return { count: wanted.length, from: "someday" };
  const people = (travelers || []).filter((row) => row && row.name);
  if (people.length) return { count: people.length, from: "household" };
  return { count: null, from: null };
}

/** Seats against people, which is where a fare quietly stops being a fare. */
export function seatCheck(deal, party) {
  const seats = Number(deal?.seats);
  if (!Number.isFinite(seats) || seats <= 0) return { verdict: null };
  if (!party?.count) return { verdict: null, seats };
  return {
    verdict: seats >= party.count ? "enough" : "short",
    seats,
    going: party.count,
    short: Math.max(0, party.count - seats),
  };
}

/** Days until the fare has to be bought, from the day it is being read on. */
export function urgency(deal, today = new Date()) {
  const by = deal?.book_by;
  if (!by) return { verdict: null };
  const then = new Date(`${by}T12:00:00`);
  if (Number.isNaN(then.getTime())) return { verdict: null };
  const start = new Date(today);
  start.setHours(12, 0, 0, 0);
  const days = Math.round((then - start) / 86400000);
  if (days < 0) return { verdict: "gone", days, said: formatFullDay(by) };
  return {
    verdict: days <= 2 ? "today" : days <= 7 ? "soon" : "later",
    days,
    said: formatFullDay(by),
  };
}

/**
 * What the fare does to the budget of the trip it would go on.
 *
 * Flights for the whole party against the target the family set, which is a
 * target and never a cap: the number is said and the decision is theirs. Nothing
 * here estimates a hotel, a bag or a meal.
 */
export function budgetCheck(deal, trip, party, budget = null) {
  const price = readMoney(deal?.price);
  if (price === null || !party?.count) return { verdict: null };
  const flights = Math.round(price * party.count);
  const target = budget?.target ?? readMoney(trip?.budget_target);
  if (target === null) return { verdict: "no target", flights };
  // Anything already priced on the trip stands, and the fare is added to it: a
  // family with the hotel booked wants to know where the flights leave them, not
  // what the flights alone cost against the whole budget.
  const already = Number.isFinite(budget?.expected) ? budget.expected : 0;
  const delta = Math.round(target - (already + flights));
  return {
    verdict: delta >= 0 ? "under" : "over",
    flights,
    target,
    already: Math.round(already),
    delta: Math.abs(delta),
  };
}

/** Points that could go towards this, named only when the family holds them. */
export function pointsFor(deal, rewards = []) {
  const airline = String(deal?.airline || "").toLowerCase();
  const rows = (rewards || []).filter((row) => row && row.name);
  const out = [];
  for (const row of rows) {
    const kind = String(row.kind || "");
    if (kind !== "airline" && kind !== "credit_card") continue;
    const balance = Number(row.points_balance);
    if (!Number.isFinite(balance) || balance <= 0) continue;
    const named =
      airline && placeMatches(airline, row.name) ? "the same airline" : null;
    if (kind === "airline" && !named) continue;
    out.push({
      name: row.name,
      balance,
      said: formatPoints(balance),
      currency: row.currency_label || "points",
      kind,
      matched: Boolean(named),
    });
  }
  // The airline's own program first, then the flexible balances.
  return out.sort((a, b) => Number(b.matched) - Number(a.matched)).slice(0, 3);
}

/**
 * The whole verdict, as facts.
 *
 * `facts` is the part everything else uses: the card prints it, and Aly is given
 * it and told to say it rather than to work it out. Each line is one sentence,
 * already true, in the order a person would want to hear them -- what it answers,
 * what it costs against their own number, where it leaves from, who it covers,
 * what it clashes with, and when it has to be bought.
 */
export function dealVerdict(deal, world = {}) {
  const {
    someday = [],
    airports = [],
    trips = [],
    rosters = [],
    travelers = [],
    itinerary = [],
    costs = [],
    rewards = [],
    today = new Date(),
  } = world;

  const place = somedayFor(deal, someday);
  const trip = tripFor(deal, trips);
  const party = partyFor(trip, { rosters, travelers, place });
  const ceiling = ceilingCheck(deal, place);
  const month = monthCheck(deal, place);
  const origin = originCheck(deal, airports);
  const seats = seatCheck(deal, party);
  const when = urgency(deal, today);
  // Everything already priced on that trip counts, so the fare is measured
  // against what is left of the budget rather than against all of it.
  const budget = budgetCheck(
    deal,
    trip,
    party,
    trip
      ? buildBudget({
          trip,
          itinerary: (itinerary || []).filter(
            (item) => item && item.trip_id === trip.id,
          ),
          costs: (costs || []).filter(
            (cost) => cost && cost.trip_id === trip.id,
          ),
        })
      : null,
  );
  const clashes = clashesWith(deal, { trips, itinerary, trip });
  const points = pointsFor(deal, rewards);

  const facts = [];

  if (trip) facts.push(`This is ${trip.name}, which you already have.`);
  else if (place) facts.push(`${place.place} is on your someday list.`);

  if (ceiling.verdict === "under")
    facts.push(
      `${money(ceiling.price)} each is ${money(ceiling.delta)} under the ${money(ceiling.ceiling)} you said ${place.place} was worth.`,
    );
  else if (ceiling.verdict === "over")
    facts.push(
      `${money(ceiling.price)} each is ${money(ceiling.delta)} over the ${money(ceiling.ceiling)} you said ${place.place} was worth.`,
    );
  else if (place)
    facts.push(
      `You have not said what a fare to ${place.place} is worth, so there is nothing to measure this against.`,
    );

  if (month.verdict === "misses")
    facts.push(`The travel dates fall outside ${month.said}.`);
  else if (month.verdict === "fits" && month.said !== "any month")
    facts.push(`The dates are inside ${month.said}, which is when you can go.`);

  if (origin.verdict === "ours") {
    const drive = origin.drive ? `, ${driveSaid(origin.drive)} away` : "";
    facts.push(
      origin.primary
        ? `It leaves from ${origin.code}, your home airport${drive}.`
        : `It leaves from ${origin.code}, one of yours${drive}.`,
    );
  } else if (origin.verdict === "not ours")
    facts.push(
      `It leaves from ${origin.code}, which is not one of your airports${origin.ours.length ? ` (${origin.ours.join(", ")})` : ""}.`,
    );

  if (budget.verdict === "under" || budget.verdict === "over") {
    const alongside = budget.already
      ? `, alongside the ${money(budget.already)} already priced on ${trip.name},`
      : ` for ${trip.name}`;
    facts.push(
      budget.verdict === "under"
        ? `${money(budget.flights)} of flights for ${party.count}${alongside} leaves you ${money(budget.delta)} under the ${money(budget.target)} you set.`
        : `${money(budget.flights)} of flights for ${party.count}${alongside} puts you ${money(budget.delta)} over the ${money(budget.target)} you set.`,
    );
  }
  if (budget.verdict === "no target" && party.count)
    facts.push(`${money(budget.flights)} for the ${party.count} of you.`);

  if (seats.verdict === "short")
    facts.push(
      `There are ${seats.going} of you and ${seats.seats} ${seats.seats === 1 ? "seat" : "seats"} at that fare.`,
    );
  else if (seats.verdict === "enough")
    facts.push(`${seats.seats} seats, which covers the ${seats.going} of you.`);

  for (const clash of clashes) {
    facts.push(
      clash.kind === "trip"
        ? `It overlaps ${clash.name}.`
        : // "covers" read like good news the first time this was written, and a
          // clash is the opposite: the fare's dates run over something already on
          // the calendar.
          `Those dates run over ${clash.name}${clash.trip ? ` on ${clash.trip}` : ""}, ${formatFullDay(clash.date)}.`,
    );
  }

  if (when.verdict === "gone")
    facts.push(`The booking date, ${when.said}, has gone by.`);
  else if (when.verdict === "today")
    facts.push(
      when.days === 0
        ? "It has to be booked today."
        : `It has to be booked by ${when.said} -- ${when.days} ${when.days === 1 ? "day" : "days"}.`,
    );
  else if (when.verdict === "soon")
    facts.push(`It has to be booked by ${when.said}, ${when.days} days off.`);

  for (const row of points) {
    facts.push(
      row.matched
        ? `You have ${row.said} ${row.currency} with ${row.name}, the same airline.`
        : `You have ${row.said} ${row.currency} with ${row.name} that could go towards it.`,
    );
  }

  return {
    place,
    trip,
    party,
    ceiling,
    month,
    origin,
    seats,
    when,
    budget,
    clashes,
    points,
    facts,
    // The one line the card leads with, and the only judgement in here: it is
    // made of the checks above rather than of an opinion about the fare.
    headline: headlineFor({ place, trip, ceiling, month, origin, seats, when }),
  };
}

function headlineFor({ place, trip, ceiling, month, origin, seats, when }) {
  if (when.verdict === "gone") return "Too late";
  if (month.verdict === "misses") return "Wrong time of year";
  if (origin.verdict === "not ours") return "Not from your airports";
  if (seats.verdict === "short") return "Not enough seats";
  // Short on purpose: this is a chip beside a heading on a 320px card, and that
  // there is a trip for it is already said on the button underneath.
  if (ceiling.verdict === "under") return "Under your ceiling";
  if (ceiling.verdict === "over") return "Above what you said it was worth";
  if (trip) return "For a trip you already have";
  if (place) return "A place on your list";
  return "Nothing on file to measure it against";
}

/** The verdict as lines for Aly's briefing, one deal at a time. */
export function dealLines(deals = [], world = {}) {
  const open = (deals || []).filter((row) => row && row.status === "open");
  if (!open.length) return [];
  const lines = [
    "FARES THE FAMILY PASTED IN (open, with the verdict already worked out for you):",
  ];
  for (const deal of open) {
    const v = dealVerdict(deal, world);
    const window =
      deal.travel_start || deal.travel_end
        ? `${deal.travel_start || "?"} to ${deal.travel_end || "?"}`
        : "no dates given";
    lines.push(
      `  ${deal.origin} to ${deal.destination}, ${money(deal.price)} each ${deal.cabin}${deal.airline ? ` on ${deal.airline}` : ""}, ${window}, from ${deal.source_name} [id: ${deal.id}]`,
    );
    for (const fact of v.facts) lines.push(`    - ${fact}`);
  }
  lines.push(
    "  Say those facts as they are written. Do not recompute them, do not soften them, and never quote a fare, a route, an airline or an award price that is not on one of these lines -- this app holds no prices of its own.",
  );
  const refused = (deals || []).filter(
    (row) => row && row.status === "dismissed",
  );
  if (refused.length) {
    lines.push("FARES THEY HAVE ALREADY TURNED DOWN:");
    for (const row of refused.slice(0, 8))
      lines.push(
        `  ${row.origin} to ${row.destination}, ${money(row.price)}${row.dismissed_reason ? ` -- ${row.dismissed_reason}` : ""}`,
      );
    lines.push(
      "  Do not put one of these in front of them again unless something has changed, and say what changed.",
    );
  }
  return lines;
}
