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
      rate: Number.isFinite(Number(rule?.rate)) ? Number(rule.rate) : null,
      on: typeof rule?.on === "string" ? rule.on.trim() : "",
      note: typeof rule?.note === "string" ? rule.note.trim() : "",
    }))
    .filter((rule) => rule.on && rule.rate !== null);
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
  flights: ["flight", "air", "airline", "travel", "everything else"],
  hotels: ["hotel", "lodging", "stay", "travel", "everything else"],
  dining: ["dining", "restaurant", "takeaway", "everything else"],
  car: ["car rental", "car", "rental", "travel", "everything else"],
  groceries: ["grocer", "supermarket", "everything else"],
  gas: ["gas", "fuel", "petrol", "everything else"],
  cruise: ["cruise", "travel", "everything else"],
  other: ["everything else"],
};

export function bestCardFor(rows, spend) {
  const words = SPEND_WORDS[spend] || SPEND_WORDS.other;
  let best = null;
  for (const row of rows || []) {
    if (row.kind !== "credit_card" || row.is_active === false) continue;
    for (const rule of normalizeRules(row.earn_rules)) {
      const haystack = rule.on.toLowerCase();
      const hit = words.findIndex((w) => haystack.includes(w));
      if (hit === -1) continue;
      // An earlier word in the list is a more specific match, and a bigger
      // multiplier wins among equally specific ones.
      const score = (words.length - hit) * 100 + rule.rate;
      if (!best || score > best.score) best = { score, row, rule };
    }
  }
  return best ? { card: best.row, rule: best.rule } : null;
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
