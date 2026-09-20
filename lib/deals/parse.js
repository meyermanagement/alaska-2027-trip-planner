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
import { hasAwardPricing, validateAwardPricing } from "./award";
import { verifiedFareBasis } from "./basis";

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

const MONTH_WORD =
  /\b(january|jan|february|feb|march|mar|april|apr|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b\.?/gi;

/** A season written as two months with a dash or the word between them. */
const MONTH_SPAN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|May|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b\s*(?:-|\u2013|\u2014|to|through|thru|until)\s*\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|May|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/gi;

/**
 * The months named in the text, as numbers.
 *
 * A fare alert states its travel window in month names far more often than in
 * dates -- "full availability Oct - Feb, best in November" -- and the reader is
 * told, rightly, never to turn a month name into a date. That left the most
 * decidable fact in the email on the floor. Months are the honest middle: enough
 * to say whether a fare falls in the part of the year the family can travel,
 * without anybody pretending to know a day.
 *
 * May is the one that has to be capitalized to count, because "may" is also a
 * word every newsletter uses about what a fare might do.
 */
export function monthsIn(text) {
  const said = String(text || "");
  const out = [];
  MONTH_WORD.lastIndex = 0;
  let match;
  while ((match = MONTH_WORD.exec(said))) {
    const n = monthNumber(match[1]);
    if (n) out.push(n);
  }
  // Handled apart from the others so the verb does not become a month.
  if (/\bMay\b/.test(said)) out.push(5);

  // A written span means every month inside it, including the ones it does not
  // spell out. "Full availability: Oct - Feb" names four months on the page and
  // offers five, and a check that only accepted what was spelled out would throw
  // December away -- so the span is filled in here, where it can be proven off
  // the text, rather than trusted to the model.
  MONTH_SPAN.lastIndex = 0;
  let span;
  while ((span = MONTH_SPAN.exec(said))) {
    const from = monthNumber(span[1]);
    const to = monthNumber(span[2]);
    if (!from || !to) continue;
    // Wraps through the new year, because a winter season is written that way.
    for (let m = from, guard = 0; guard < 12; guard += 1) {
      out.push(m);
      if (m === to) break;
      m = (m % 12) + 1;
    }
  }
  return [...new Set(out)].sort((a, b) => a - b);
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
    months: monthsIn(text),
  };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** The sentence a fare alert uses for a clock it will not put a date on. */
const HORIZON =
  /\b(?:last|lasts|gone|expires?|ends?|book|booked|available)\b[^.!?\n]{0,40}?\b(?:in|within|less than|under|for about|for)\s+(\d{1,3})\s*(hour|hours|hr|hrs|day|days)\b/i;

/**
 * How long the sender says the fare will last, in hours.
 *
 * Not a date and never stored as one on its own. "We think this will last less
 * than 24 hours" is the most useful line in a fare alert and the least provable:
 * it is the sender's guess about a price nobody controls. So the number is pulled
 * out here, turned into a date only against the hour the mail actually arrived,
 * and the row that results is marked as inferred so the card can say who expected
 * what rather than announcing a deadline this app made up.
 */
export function horizonIn(text) {
  const said = String(text || "");
  const match = said.match(HORIZON);
  if (!match) return null;
  const count = Number(match[1]);
  if (!Number.isFinite(count) || count <= 0) return null;
  const hours = /^h/i.test(match[2]) ? count : count * 24;
  // A month of notice is not urgency, it is a fare with a season.
  if (hours > 24 * 31) return null;
  return { hours, said: match[0].trim() };
}

/** The date a horizon lands on, counted from when the mail arrived. */
export function bookByFromHorizon(hours, receivedAt) {
  const from = receivedAt ? new Date(receivedAt) : null;
  if (!from || Number.isNaN(from.getTime())) return null;
  const then = new Date(from.getTime() + hours * 3600000);
  if (Number.isNaN(then.getTime())) return null;
  return then.toISOString().slice(0, 10);
}

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
export function checkCandidate(
  candidate,
  { text, hard, source, receivedAt = null } = {},
) {
  const said = String(text || "");
  const lower = said.toLowerCase();
  const proven = hard || hardParse(said);
  // An older caller may hand over a proven set from before months were read.
  const provenMonths = proven.months || [];
  const refuse = (why) => ({ ok: false, why });

  if (!candidate || typeof candidate !== "object")
    return refuse("nothing came back that looked like a fare");

  const award = candidate.award_pricing ? validateAwardPricing(candidate.award_pricing, said) : null;
  if (candidate.award_pricing && !award)
    return refuse("the points and fees could not be verified together in that alert");
  const cashQuote = String(candidate.fare_text || "").trim();
  const flatten = value => String(value).replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const independentCash = cashQuote && flatten(said).includes(flatten(cashQuote)) &&
    !hasAwardPricing(cashQuote) && !/\b(?:taxes|fees|surcharge|bonus|was|normally)\b/i.test(cashQuote) &&
    codesIn(cashQuote).includes(String(candidate.origin || "").toUpperCase()) &&
    pricesIn(cashQuote).includes(readMoney(candidate.price));
  if (!award && hasAwardPricing(said) && !independentCash)
    return refuse("this alert includes award pricing; cash fees alone are not a fare");
  const price = award ? null : readMoney(candidate.price);
  if (!award && (price === null || price <= 0))
    return refuse("there is no fare in that text I could read");
  if (!award && proven.prices.length && !proven.prices.includes(price))
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

  // Months the fare is good for, kept only when the month was named in the text.
  // These are what the check runs against when nobody wrote a day down.
  const proposedMonths = Array.isArray(candidate.travel_months)
    ? candidate.travel_months
    : [];
  const travelMonths = [
    ...new Set(
      proposedMonths
        .map((value) => Number(value))
        .filter(
          (n) =>
            Number.isInteger(n) &&
            n >= 1 &&
            n <= 12 &&
            (!provenMonths.length || provenMonths.includes(n)),
        ),
    ),
  ].sort((a, b) => a - b);

  // The sender's own words about the clock, only if they are the sender's own
  // words: a paraphrase here would read on the card as something they wrote.
  const flat = (value) =>
    String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  const claimed = flat(candidate.deadline_said).slice(0, 160);
  const horizon = horizonIn(said);
  const deadlineSaid =
    claimed && flat(said).toLowerCase().includes(claimed.toLowerCase())
      ? claimed
      : horizon?.said || null;
  // A horizon becomes a date only against the hour the mail arrived, and only
  // when nobody wrote a real one.
  const inferredBookBy =
    !bookBy && horizon
      ? bookByFromHorizon(horizon.hours, receivedAt || Date.now())
      : null;

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
      price_basis: award ? "unspecified" : verifiedFareBasis(candidate, text),
      ...(award ? { award_pricing: award } : {}),
      currency: "USD",
      cabin,
      airline: keptAirline,
      book_by: bookBy || inferredBookBy,
      book_by_inferred: Boolean(!bookBy && inferredBookBy),
      deadline_said: deadlineSaid,
      travel_months: travelMonths.length ? travelMonths : null,
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
      travelStart || travelEnd || travelMonths.length
        ? null
        : "the travel dates",
      bookBy || inferredBookBy ? null : "the date it has to be booked by",
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
    "Fields: origin (3-letter airport code), destination (the city or country as written), destination_code (3-letter code, only if one is written), price (one number, per person, no currency symbol), cabin (economy|premium|business|first), airline, book_by (YYYY-MM-DD), travel_start (YYYY-MM-DD), travel_end (YYYY-MM-DD), travel_months (array of month numbers 1-12), deadline_said (the sentence about how long it lasts, copied word for word), seats (integer), notes (one short line, only what the text says), source_name, source_url.",
    "",
    "Rules. Use only what is written. Leave a field out entirely rather than guessing it -- a missing date is fine and a wrong one is not. Do not convert a month name into a date unless the day is written too; put the month in travel_months instead, which is what it is for. Copy deadline_said word for word or leave it out. Do not round the price. Do not name an airline the text does not name.",
    "",
    `Prices written in this text: ${hard.prices.length ? hard.prices.map((p) => `$${p}`).join(", ") : "none"}. The price you return must be one of these.`,
    `Airport codes written in this text: ${hard.codes.length ? hard.codes.join(", ") : "none"}. Any code you return must be one of these.`,
    `Dates written in this text: ${hard.dates.length ? hard.dates.join(", ") : "none"}. Any date you return must be one of these.`,
    `Months named in this text: ${hard.months?.length ? hard.months.join(", ") : "none"}. Any month you return must be one of these.`,
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
