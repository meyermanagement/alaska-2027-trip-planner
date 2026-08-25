// Everything the app agrees on about rewards programs: what kinds there are,
// how a points balance is worth talking about, and how an earning rule reads.
//
// A rewards row is deliberately loose. A hotel program has a balance and a
// tier; a credit card has an annual fee and a list of earning rules; a car
// rental club often has nothing but a membership number. One table holds all of
// them and each kind simply leaves the fields it does not use empty.

export const REWARD_KINDS = [
  {
    key: "credit_card",
    label: "Credit card",
    plural: "Credit cards",
    blurb: "What you pay with, and what each purchase earns.",
  },
  {
    key: "airline",
    label: "Airline",
    plural: "Airlines",
    blurb: "Miles you could put towards a flight.",
  },
  {
    key: "hotel",
    label: "Hotel",
    plural: "Hotels",
    blurb: "Points and status for somewhere to stay.",
  },
  {
    key: "cruise",
    label: "Cruise line",
    plural: "Cruise lines",
    blurb: "Past-guest clubs and the perks they carry.",
  },
  {
    key: "car",
    label: "Car rental",
    plural: "Car rental",
    blurb: "Skip-the-counter clubs and free-day points.",
  },
  {
    key: "rail",
    label: "Rail",
    plural: "Rail",
    blurb: "Train points, for the legs nobody flies.",
  },
  {
    key: "dining",
    label: "Dining or shopping",
    plural: "Dining and shopping",
    blurb: "Programs that feed miles into the others.",
  },
  {
    key: "other",
    label: "Something else",
    plural: "Everything else",
    blurb: "Anything that does not fit the boxes above.",
  },
];

export const KIND_LABEL = new Map(REWARD_KINDS.map((k) => [k.key, k.label]));

/** The order the tab shows the groups in: what you pay with comes first. */
export const KIND_ORDER = REWARD_KINDS.map((k) => k.key);

/** 42500 → "42,500". Balances are always read, never calculated with. */
export function formatPoints(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n.toLocaleString("en-US");
}

/**
 * Roughly what a balance is worth in dollars, at whatever cents-per-point the
 * row carries. Deliberately rounded to whole dollars and always spoken about as
 * an estimate: the real worth of a point is whatever you manage to redeem it
 * for, which is not something a database column knows.
 */
export function estimatedValue(row) {
  const points = Number(row?.points_balance);
  const cents = Number(row?.point_value_cents);
  if (!Number.isFinite(points) || !Number.isFinite(cents)) return null;
  if (points <= 0 || cents <= 0) return null;
  return Math.round((points * cents) / 100);
}

export function formatMoney(dollars) {
  if (dollars === null || dollars === undefined) return null;
  return `$${Number(dollars).toLocaleString("en-US")}`;
}

/** The whole household's points, added up per currency and then in dollars. */
export function totalEstimatedValue(rows) {
  return (rows || []).reduce((sum, row) => sum + (estimatedValue(row) || 0), 0);
}

/**
 * An earning rule is `{ rate, on, note }` — "5x" "on flights booked through
 * the portal" "(after the first $500)". Rate is stored as a number so it can be
 * compared across cards; everything else is words.
 */
export function normalizeRules(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((rule) => ({
      rate: positiveNumber(rule?.rate),
      on: typeof rule?.on === "string" ? rule.on.trim() : "",
      note: typeof rule?.note === "string" ? rule.note.trim() : "",
    }))
    .filter((rule) => rule.on && rule.rate !== null);
}

/**
 * A blank input is not a zero. An empty string coerces to 0 in JavaScript, so a
 * half-typed row would otherwise be saved as "0x on nothing" or a $0 credit.
 */
function positiveNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function formatRule(rule) {
  const rate = Number(rule.rate);
  const shown = Number.isInteger(rate) ? `${rate}x` : `${rate}x`;
  return [`${shown} ${rule.on}`, rule.note ? `(${rule.note})` : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Which of a card's rules applies to a given kind of spending, best first. The
 * matching is deliberately simple word-overlap rather than a category system:
 * the rules are written in the issuer's own words, and a card that says
 * "restaurants" should still answer a question about dining.
 */
const SPEND_WORDS = {
  flights: ["flight", "airline", "air", "travel", "everything else"],
  hotels: [
    "hotel",
    "resort",
    "lodging",
    "propert",
    "stay",
    "travel",
    "everything else",
  ],
  dining: ["dining", "restaurant", "takeaway", "everything else"],
  // Not a bare "car", which would match the word "card" in a credit's wording.
  car: ["car rental", "rental car", "rental", "travel", "everything else"],
  groceries: ["grocer", "supermarket", "everything else"],
  gas: ["gas", "fuel", "petrol", "everything else"],
  cruise: ["cruise", "travel", "everything else"],
  other: ["everything else"],
};

/**
 * How a booking was made changes which card wins, which is why one answer per
 * category is not enough: a card can pay 8x through its own travel site and 4x
 * when you book the hotel directly, and the family's decision depends on which
 * they are about to do. Every rule is sorted into one of these routes by the
 * words the issuer used to write it.
 */
export const BOOKING_ROUTES = [
  {
    key: "portal",
    label: "Booked through the card's travel site",
    short: "through the card's travel site",
    words: [
      "through chase travel",
      "chase travel",
      "capital one travel",
      "amex travel",
      "american express travel",
      "citi travel",
      "ultimate rewards travel",
      "the portal",
      "travel portal",
      "booked through",
      "purchased through",
    ],
  },
  {
    key: "direct",
    label: "Booked direct with the airline or hotel",
    short: "booked direct",
    words: [
      "booked direct",
      "booked directly",
      "direct with",
      "purchased directly",
      "with the airline",
      "with the hotel",
      "on delta",
      "on united",
      "on southwest",
      "at marriott",
      "at hilton",
      "at hyatt",
    ],
  },
  {
    key: "any",
    label: "However you book it",
    short: "any way you book",
    words: [],
  },
];

const ROUTE_LABEL = new Map(BOOKING_ROUTES.map((r) => [r.key, r.label]));
const ROUTE_SHORT = new Map(BOOKING_ROUTES.map((r) => [r.key, r.short]));
const ROUTE_RANK = new Map(BOOKING_ROUTES.map((r, i) => [r.key, i]));

export function routeLabel(key) {
  return ROUTE_LABEL.get(key) || ROUTE_LABEL.get("any");
}

export function routeShort(key) {
  return ROUTE_SHORT.get(key) || ROUTE_SHORT.get("any");
}

/**
 * Sorts one earning rule into a booking route by how the issuer worded it. A
 * rule that names both ways — "flights booked direct or through Amex Travel" —
 * is not route-specific at all, so it counts as however you book.
 */
export function ruleRoute(rule) {
  const text = `${rule?.on || ""} ${rule?.note || ""}`.toLowerCase();
  const hits = BOOKING_ROUTES.filter(
    (route) => route.words.length && route.words.some((w) => text.includes(w)),
  );
  if (hits.length !== 1) return "any";
  return hits[0].key;
}

/**
 * Every card rule that could apply to one kind of spending, scored so the most
 * specific wording wins over a vague one and a bigger multiplier breaks the tie.
 */
function matchesFor(rows, spend) {
  const words = SPEND_WORDS[spend] || SPEND_WORDS.other;
  const out = [];
  for (const row of rows || []) {
    if (row.kind !== "credit_card" || row.is_active === false) continue;
    for (const rule of normalizeRules(row.earn_rules)) {
      const haystack = rule.on.toLowerCase();
      const hit = words.findIndex((w) => haystack.includes(w));
      if (hit === -1) continue;
      out.push({
        card: row,
        rule,
        route: ruleRoute(rule),
        specificity: words.length - hit,
        rate: rule.rate,
      });
    }
  }
  return out;
}

/** The single best card for a kind of spending, ignoring how it is booked. */
export function bestCardFor(rows, spend) {
  const all = matchesFor(rows, spend);
  let best = null;
  for (const m of all) {
    const score = m.specificity * 100 + m.rate;
    if (!best || score > best.score) best = { ...m, score };
  }
  return best ? { card: best.card, rule: best.rule, route: best.route } : null;
}

/**
 * The best card for each way of booking one kind of spending — one line per
 * route rather than a single winner, because the answer genuinely differs: a
 * hotel charged on the card's own travel site, booked direct with the chain, or
 * paid for anywhere else can each want a different card. Two routes that come
 * out at the same card and the same rule collapse into one line.
 */
export function payWithOptions(rows, spend, limit = 3) {
  const all = matchesFor(rows, spend);
  if (!all.length) return [];

  const bestPerRoute = new Map();
  for (const m of all) {
    const score = m.specificity * 100 + m.rate;
    const seen = bestPerRoute.get(m.route);
    if (!seen || score > seen.score) bestPerRoute.set(m.route, { ...m, score });
  }

  const options = [...bestPerRoute.values()].sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    return ROUTE_RANK.get(a.route) - ROUTE_RANK.get(b.route);
  });

  const seen = new Set();
  const out = [];
  for (const m of options) {
    const key = `${m.card.id}|${m.rule.on}|${m.rule.rate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ card: m.card, rule: m.rule, route: m.route });
    if (out.length === limit) break;
  }
  return out;
}

/**
 * A statement credit is `{ amount, on, resets, note }` — "$300" "on travel
 * purchases" "every year" "(enrollment required)". These are listed, never
 * counted down: the app does not know what the family has already spent
 * against a credit this year, and pretending otherwise would be worse than
 * saying nothing.
 */
export const CREDIT_PERIODS = [
  { key: "monthly", label: "every month", each: "a month" },
  { key: "quarterly", label: "every quarter", each: "a quarter" },
  { key: "semiannual", label: "twice a year", each: "half-year" },
  { key: "annual", label: "every year", each: "a year" },
  { key: "multiyear", label: "every few years", each: "several years" },
];

const PERIOD_LABEL = new Map(CREDIT_PERIODS.map((p) => [p.key, p.label]));

export function normalizeCredits(value) {
  const list = Array.isArray(value) ? value : [];
  return list
    .map((credit) => ({
      amount: positiveNumber(credit?.amount),
      on: typeof credit?.on === "string" ? credit.on.trim() : "",
      resets: PERIOD_LABEL.has(credit?.resets) ? credit.resets : "annual",
      note: typeof credit?.note === "string" ? credit.note.trim() : "",
    }))
    .filter((credit) => credit.on && credit.amount !== null);
}

export function formatCredit(credit) {
  const money = formatMoney(credit.amount);
  const period = PERIOD_LABEL.get(credit.resets) || "every year";
  return [
    `${money} ${period} on ${credit.on}`,
    credit.note ? `(${credit.note})` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** What a credit is worth over a full year, for adding several of them up. */
export function creditAnnualValue(credit) {
  const amount = Number(credit?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (credit.resets === "monthly") return amount * 12;
  if (credit.resets === "quarterly") return amount * 4;
  if (credit.resets === "semiannual") return amount * 2;
  if (credit.resets === "multiyear") return 0; // Too lumpy to annualize honestly.
  return amount;
}

/** Every credit on the family's cards that plausibly covers this spending. */
export function creditsFor(rows, spend) {
  const words = (SPEND_WORDS[spend] || []).filter(
    (w) => w !== "everything else",
  );
  const out = [];
  for (const row of rows || []) {
    if (row.kind !== "credit_card" || row.is_active === false) continue;
    for (const credit of normalizeCredits(row.credits)) {
      const haystack = `${credit.on} ${credit.note}`.toLowerCase();
      if (!words.some((w) => haystack.includes(w))) continue;
      out.push({ card: row, credit });
    }
  }
  return out.sort((a, b) => b.credit.amount - a.credit.amount);
}

/** All credits across the family's cards, biggest annual value first. */
export function allCredits(rows) {
  const out = [];
  for (const row of rows || []) {
    if (row.kind !== "credit_card" || row.is_active === false) continue;
    for (const credit of normalizeCredits(row.credits)) {
      out.push({ card: row, credit });
    }
  }
  return out.sort(
    (a, b) => creditAnnualValue(b.credit) - creditAnnualValue(a.credit),
  );
}

/** What the household could claim back in a year if it used every credit. */
export function totalCreditValue(rows) {
  return allCredits(rows).reduce(
    (sum, entry) => sum + creditAnnualValue(entry.credit),
    0,
  );
}

/** A one-line way to say what a row is, for headings and for Aly's context. */
export function describeRow(row, travelerName) {
  const bits = [row.brand];
  if (row.status_tier) bits.push(`${row.status_tier} tier`);
  const points = formatPoints(row.points_balance);
  if (points) bits.push(`${points} ${row.currency_label || "points"}`);
  const value = estimatedValue(row);
  if (value) bits.push(`about ${formatMoney(value)}`);
  if (travelerName) bits.push(travelerName);
  return bits.join(" · ");
}
