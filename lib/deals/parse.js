// Turning a pasted fare into a row, with the regexes going first.
//
// The pattern is the one the inbox already uses and for the same reason: a model
// asked to read a deal alert will happily fill in the blanks it cannot see. It
// will decide a fare with no dates on it is "spring 2027", it will round $348 to
// $350, and it will name an airline because most fares have one. Each of those is
// a plausible sentence and a wrong row, and a wrong row here is worse than no row,
// because the whole point of the verdict is that every number in it came from the
// family or from the page they were reading.
//
// So the order is: pull out everything a regex can prove, hand the model the text
// AND what was already proven, and then check its answer field by field against
// the text again. Anything it added that is not in the text is dropped. Anything
// required that is still missing means the candidate is refused with a sentence,
// which the screen shows, because "I could not tell what the fare was" is a
// useful answer and a silently mangled row is not.

import { readMoney } from "@/lib/budget/budget";

const CABINS = ["economy", "premium", "business", "first"];

/** Three capital letters standing on their own, which is how a fare names airports. */
const CODE = /\b([A-Z]{3})\b/g;

const CODE_NOISE = new Set([
  "USD",
  "CAD",
  "EUR",
  "GBP",
  "THE",
  "AND",
  "FOR",
  "NEW",
  "ONE",
  "TWO",
  "OFF",
  "ALL",
  "NOW",
  "OUT",
  "WAS",
  "PER",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
  "RT",
  "OW",
]);

/**
 * Every price in the text, in the order they appear.
 *
 * Kept as a list rather than reduced to one, because a deal alert routinely
 * carries three -- the fare, what it usually costs, and what you save -- and
 * which of them is the fare is a judgement the model is better at than a regex.
 * The regex's job is to make sure the model can only choose among numbers that
 * are actually written down.
 */
export function pricesIn(text) {
  const out = [];
  const re = /\$\s?([0-9][0-9,]*(?:\.[0-9]{2})?)/g;
  let match;
  while ((match = re.exec(String(text || "")))) {
    const n = readMoney(match[1]);
    if (n !== null && n > 0) out.push(n);
  }
  return [...new Set(out)];
}

/** Airport codes in the text, noise words removed. */
export function codesIn(text) {
  const out = [];
  let match;
  const source = String(text || "");
  CODE.lastIndex = 0;
  while ((match = CODE.exec(source))) {
    const code = match[1];
    if (CODE_NOISE.has(code)) continue;
    out.push(code);
  }
  return [...new Set(out)];
}

/** ISO dates in the text. The plainest form, and the easiest to be sure about. */
export function isoDatesIn(text) {
  const out = String(text || "").match(/\b\d{4}-\d{2}-\d{2}\b/g) || [];
  return [...new Set(out)].filter((iso) => {
    const d = new Date(`${iso}T12:00:00`);
    return !Number.isNaN(d.getTime());
  });
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const WRITTEN =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?\b/gi;

const DAY_FIRST =
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s*,?\s*(\d{4}))?\b/gi;

function monthNumber(word) {
  const start = String(word || "")
    .toLowerCase()
    .slice(0, 3);
  const found = MONTH_NAMES.findIndex((name) => name.startsWith(start));
  return found < 0 ? null : found + 1;
}

function isoFrom(year, month, day) {
  if (!year || !month || !day) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const back = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(back.getTime())) return null;
  // A day that does not exist in that month comes back as a different date --
  // February 30 rolls into March -- so the round trip is the check.
  return back.toISOString().slice(0, 10) === iso ? iso : null;
}

/**
 * Dates written the way an alert writes them: "May 28 - June 6, 2027".
 *
 * Worth the trouble because almost no fare alert speaks in ISO, and the travel
 * window is the fact the whole verdict turns on -- without it a fare cannot be
 * matched to a trip, checked against the months a place is worth doing, or set
 * beside what else is on that week. What it will not do is invent a year: a month
 * and a day with no year anywhere near them are left for the model to propose and
 * then get refused, rather than quietly assumed to mean this year.
 */
export function writtenDatesIn(text) {
  const said = String(text || "");
  const years = [];
  const yearRe = /\b(20\d{2})\b/g;
  let hit;
  while ((hit = yearRe.exec(said))) years.push({ at: hit.index, year: hit[1] });

  const nearestYear = (at) => {
    let best = null;
    for (const candidate of years) {
      const gap = Math.abs(candidate.at - at);
      // Far enough away and it is a different sentence about a different thing.
      if (gap > 60) continue;
      if (!best || gap < best.gap) best = { gap, year: candidate.year };
    }
    return best?.year || null;
  };

  const out = [];
  for (const pattern of [WRITTEN, DAY_FIRST]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(said))) {
      const dayFirst = pattern === DAY_FIRST;
      const month = monthNumber(dayFirst ? match[2] : match[1]);
      const day = Number(dayFirst ? match[1] : match[2]);
      const year = match[3] || nearestYear(match.index);
      const iso = isoFrom(year, month, day);
      if (iso) out.push(iso);
    }
  }
  return [...new Set(out)];
}

/**
 * What could be proven before the model was asked anything.
 *
 * Handed to the model as part of the question, so it is choosing among facts
 * rather than inventing them, and kept for the check afterwards.
 */
export function hardParse(text) {
  return {
    prices: pricesIn(text),
    codes: codesIn(text),
    dates: [...new Set([...isoDatesIn(text), ...writtenDatesIn(text)])].sort(),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The model's answer, checked back against the text it was reading.
 *
 * Returns either a row ready to insert or a refusal with the reason said plainly.
 * Every rule here exists because the alternative is a confident wrong number:
 *
 * - the price must be one of the prices written in the text,
 * - the origin and destination code must be codes written in the text,
 * - a date must be a date written in the text, or dropped,
 * - the airline and the destination name must appear in the text,
 * - the source is required and never guessed, because a fare with no provenance
 *   cannot be checked by the family later.
 */
export function checkCandidate(candidate, { text, hard, source } = {}) {
  const said = String(text || "");
  const lower = said.toLowerCase();
  const proven = hard || hardParse(said);
  const refuse = (why) => ({ ok: false, why });

  if (!candidate || typeof candidate !== "object")
    return refuse("nothing came back that looked like a fare");

  const price = readMoney(candidate.price);
  if (price === null || price <= 0)
    return refuse("there is no fare in that text I could read");
  if (proven.prices.length && !proven.prices.includes(price))
    return refuse(
      `the fare came back as $${price}, which is not one of the prices in that text`,
    );

  const origin = String(candidate.origin || "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(origin))
    return refuse("it does not say which airport the fare leaves from");
  if (proven.codes.length && !proven.codes.includes(origin))
    return refuse(`${origin} is not an airport named in that text`);

  const destination = String(candidate.destination || "").trim();
  if (!destination) return refuse("it does not say where the fare goes");
  // The destination is a name rather than a code, so it is checked by word: at
  // least one of its words has to be in the text.
  const words = destination
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length && !words.some((w) => lower.includes(w)))
    return refuse(`"${destination}" is not the place that text is about`);

  const destinationCode = String(
    candidate.destination_code || "",
  ).toUpperCase();
  const dest =
    /^[A-Z]{3}$/.test(destinationCode) &&
    (!proven.codes.length || proven.codes.includes(destinationCode))
      ? destinationCode
      : null;

  const sourceName = String(candidate.source_name || source?.name || "").trim();
  if (!sourceName)
    return refuse(
      "I do not know where that fare came from, so I did not save it",
    );

  const dateOr = (value) => {
    const iso = String(value || "").trim();
    if (!ISO.test(iso)) return null;
    if (proven.dates.length && !proven.dates.includes(iso)) return null;
    return iso;
  };
  const travelStart = dateOr(candidate.travel_start);
  const travelEnd = dateOr(candidate.travel_end);
  const bookBy = dateOr(candidate.book_by);

  const airline = String(candidate.airline || "").trim();
  const keptAirline =
    airline && lower.includes(airline.toLowerCase().split(/\s+/)[0])
      ? airline
      : null;

  const cabin = CABINS.includes(String(candidate.cabin || "").toLowerCase())
    ? String(candidate.cabin).toLowerCase()
    : "economy";

  const seats = Number(candidate.seats);

  return {
    ok: true,
    row: {
      origin,
      destination,
      destination_code: dest,
      price,
      currency: "USD",
      cabin,
      airline: keptAirline,
      book_by: bookBy,
      travel_start: travelStart,
      travel_end:
        travelEnd && travelStart && travelEnd < travelStart ? null : travelEnd,
      seats:
        Number.isInteger(seats) && seats >= 1 && seats <= 99 ? seats : null,
      source_name: sourceName,
      source_url:
        String(candidate.source_url || source?.url || "").trim() || null,
      notes: String(candidate.notes || "").trim() || null,
      status: "open",
    },
    // What the model was not able to prove, so the screen can say it rather than
    // the family discovering it when the verdict comes back thin.
    missing: [
      travelStart || travelEnd ? null : "the travel dates",
      bookBy ? null : "the date it has to be booked by",
      Number.isInteger(seats) && seats >= 1
        ? null
        : "how many seats are at that fare",
    ].filter(Boolean),
  };
}

/** The instruction the model gets, with everything already proven written into it. */
export function parseBrief(text, hard, source) {
  return [
    "Read this fare alert and return one JSON object describing the single best fare in it. No prose, no markdown fence.",
    "",
    "Fields: origin (3-letter airport code), destination (the city or country as written), destination_code (3-letter code, only if one is written), price (one number, per person, no currency symbol), cabin (economy|premium|business|first), airline, book_by (YYYY-MM-DD), travel_start (YYYY-MM-DD), travel_end (YYYY-MM-DD), seats (integer), notes (one short line, only what the text says), source_name, source_url.",
    "",
    "Rules. Use only what is written. Leave a field out entirely rather than guessing it -- a missing date is fine and a wrong one is not. Do not convert a month name into a date unless the day is written too. Do not round the price. Do not name an airline the text does not name.",
    "",
    `Prices written in this text: ${hard.prices.length ? hard.prices.map((p) => `$${p}`).join(", ") : "none"}. The price you return must be one of these.`,
    `Airport codes written in this text: ${hard.codes.length ? hard.codes.join(", ") : "none"}. Any code you return must be one of these.`,
    `Dates written in this text: ${hard.dates.length ? hard.dates.join(", ") : "none"}. Any date you return must be one of these.`,
    source?.name ? `Where it came from: ${source.name}.` : "",
    "",
    "The text:",
    String(text || "").slice(0, 6000),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The JSON object out of whatever the model wrapped it in. */
export function jsonFrom(text) {
  const said = String(text || "").trim();
  const fenced = said.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : said;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}
