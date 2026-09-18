// Award prices are a pair, never a cash fare with a small number.
const normalized = (text) => String(text || "")
  .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
  .replace(/https?:\/\/[^\s<>]+/g, "")
  .replace(/\*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const number = (value) => {
  const said = String(value).replace(/,/g, "").toLowerCase();
  return Number(said.replace(/k$/, "")) * (said.endsWith("k") ? 1000 : 1);
};
export function hasAwardPricing(text) {
  // Bonus adverts are not redemption prices. All other quoted miles/points
  // require award validation, even when the sender omits the trip basis.
  return String(text || "").split(/\n/).some((line) => {
    if (/\b(?:bonus|earn|spending|spend|welcome offer)\b/i.test(line) &&
        !/\b(?:redeem|redemption|book with|charging)\b/i.test(line)) return false;
    return /\b\d[\d,.]*k?\s*(?:(?:to|[-–—])\s*\d[\d,.]*k?\s*)?(?:aa\s+)?(?:miles|points)\b/i.test(line);
  });
}
function hasPoints(text, value) {
  const tokens = String(text).match(/\b\d[\d,]*(?:\.\d+)?k\b|\b\d[\d,]*\s*(?=(?:aa\s+)?(?:miles|points)\b)/gi) || [];
  for (const match of String(text).matchAll(/\b(\d[\d,.]*k?)\s*(?:to|[-–—])\s*(\d[\d,.]*k?)\s*(?:aa\s+)?(?:miles|points)\b/gi)) {
    const left = /k$/i.test(match[2]) && number(match[1]) < 1000 ? `${match[1]}k` : match[1];
    tokens.push(left, match[2]);
  }
  return tokens.some((token) => number(token.trim()) === value);
}
function hasCash(text, value) {
  return [...String(text).matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)]
    .some((match) => number(match[1]) === value);
}
function cashWithBasis(text, value, direction) {
  if (direction === "unspecified") return hasCash(text, value);
  const expression = direction === "one_way" ? /^(?:\s*(?:in )?(?:taxes(?: & fees)?|fees))?\s*(?:each way|one.way)/i : /^(?:\s*(?:in )?(?:taxes(?: & fees)?|fees))?\s*(?:round.trip|r\/t)/i;
  return [...String(text).matchAll(/\$\s*([\d,]+(?:\.\d{1,2})?)/g)].some(
    (match) => number(match[1]) === value && expression.test(text.slice(match.index + match[0].length)),
  );
}
export function validateAwardPricing(award, text) {
  if (!award || !Array.isArray(award.options) || !award.options.length || award.options.length > 12) return null;
  const options = [];
  for (const raw of award.options) {
    const quote = String(raw.pricing_text || "").trim();
    const routeQuote = String(raw.route_text || "").trim();
    if (!quote || !normalized(text).includes(normalized(quote))) return null;
    if (routeQuote && !normalized(text).includes(normalized(routeQuote))) return null;
    const proof = `${quote} ${routeQuote}`;
    const min = Number(raw.points_min), max = Number(raw.points_max ?? raw.points_min);
    if (!Number.isInteger(min) || min <= 0 || !Number.isInteger(max) || max < min) return null;
    if (!["points", "miles"].includes(raw.points_unit) || !new RegExp(`\\b${raw.points_unit}\\b`, "i").test(proof)) return null;
    if (!hasPoints(proof, min) || !hasPoints(proof, max)) return null;
    const program = String(raw.program || "").trim();
    if (!program || !normalized(proof).includes(normalized(program))) return null;
    if (!["one_way", "round_trip", "unspecified"].includes(raw.points_basis)) return null;
    if (raw.points_basis === "one_way" && !/each way|one.way/i.test(proof)) return null;
    if (raw.points_basis === "round_trip" && !/round.trip|r\/t/i.test(proof)) return null;
    const cash = raw.cash_amount === null || raw.cash_amount === undefined ? null : Number(raw.cash_amount);
    if (cash !== null && (!Number.isFinite(cash) || cash < 0 || !hasCash(proof, cash))) return null;
    if (!["one_way", "round_trip", "unspecified"].includes(raw.cash_basis)) return null;
    if (cash !== null && (raw.cash_currency !== "USD" || /\b(?:CAD|AUD|NZD|HKD)\s*\$|C\$|A\$/i.test(proof))) return null;
    if (cash !== null && !cashWithBasis(proof, cash, raw.cash_basis)) return null;
    const rt = raw.round_trip_cash == null ? null : Number(raw.round_trip_cash);
    if (rt !== null && (!Number.isFinite(rt) || rt < 0 || !cashWithBasis(proof, rt, "round_trip"))) return null;
    options.push({
      program, points_min: min, points_max: max,
      points_unit: raw.points_unit === "points" ? "points" : "miles",
      points_basis: raw.points_basis,
      cash_amount: cash, cash_currency: cash === null ? null : "USD",
      cash_basis: raw.cash_basis, round_trip_cash: rt,
      pricing_text: quote, route_text: routeQuote || null,
    });
  }
  return { options };
}
const count = (value) => Number(value).toLocaleString("en-US");
const dollars = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value).replace(/\.00$/, "");
const basis = (value) => value === "one_way" ? "one-way" : value === "round_trip" ? "round-trip" : "trip type not stated";
export function awardOptionLabel(option) {
  const points = option.points_min === option.points_max ? count(option.points_min) : `${count(option.points_min)}–${count(option.points_max)}`;
  const main = `${points} ${option.program} ${option.points_unit}`;
  if (option.cash_amount === null) return `${main} · ${basis(option.points_basis)} · fees not stated`;
  if (option.points_basis === option.cash_basis)
    return `${main} + ${dollars(option.cash_amount)} · ${basis(option.points_basis)}`;
  return `${main} ${basis(option.points_basis)} + ${dollars(option.cash_amount)} ${basis(option.cash_basis)}`;
}
export function farePriceLabel(deal) {
  if (deal.award_pricing?.options?.length) {
    const first = awardOptionLabel(deal.award_pricing.options[0]);
    return `${first} per person${deal.award_pricing.options.length > 1 ? ` · ${deal.award_pricing.options.length} booking options` : ""}`;
  }
  return deal.price == null ? "Price not stated" : `${dollars(Number(deal.price))} each`;
}
export function fareIdentity(deal) {
  return JSON.stringify([
    deal.origin, String(deal.destination_code || deal.destination || "").toLowerCase(),
    deal.cabin || "economy", deal.award_pricing ? "award" : "cash",
    deal.award_pricing ? deal.award_pricing.options.map(optionIdentity).sort() : Number(deal.price),
  ]);
}
function optionIdentity(option) {
  const { pricing_text, route_text, ...price } = option;
  return JSON.stringify(price);
}
// Multiple booking programs/fee bases for one award route stay inside one row.
export function consolidateAwardRoutes(rows) {
  const output = [], groups = new Map();
  for (const row of rows) {
    if (!row.award_pricing) { output.push(row); continue; }
    const key = JSON.stringify([row.origin, row.destination_code || row.destination.toLowerCase(), row.cabin, row.airline, row.travel_start, row.travel_end, row.travel_months]);
    const prior = groups.get(key);
    if (!prior) {
      const copy = { ...row, award_pricing: { options: [...row.award_pricing.options] } };
      groups.set(key, copy); output.push(copy);
    } else {
      for (const option of row.award_pricing.options) {
        if (!prior.award_pricing.options.some((old) => optionIdentity(old) === optionIdentity(option)))
          prior.award_pricing.options.push(option);
      }
    }
  }
  return output;
}

// Exact AA newsletter format. A route's listed miles override the overall range;
// the original pricing sentence remains available as source context.
export function aaAwardFares(text, airports = []) {
  const clean = String(text || "").replace(/\*/g, "");
  const program = clean.match(/Book with (American AAdvantage) miles/i);
  const pricing = clean.match(/American is charging [^\n]+/i);
  const fee = pricing?.[0].match(/Taxes & fees are \$([\d,.]+) one-way or \$([\d,.]+) R\/T/i);
  const section = clean.match(/Departure Cities[\s\S]*?Pricing via AA miles\s*([\s\S]*?)(?:How to Book|$)/i);
  const destination = clean.match(/^\s*([A-Za-z][A-Za-z .'-]+)\s*\(([A-Z]{3})\)\s*$/m);
  if (!program || !pricing || !fee || !section || !destination || !/\bbiz class\b|\bbusiness(?: class)?\b/i.test(clean.slice(0, section.index)))
    return { complete: false, fares: [] };
  const wanted = new Set(airports.map((a) => a.code.toUpperCase()));
  const fares = [];
  const pricingText = clean.slice(program.index, pricing.index + pricing[0].length);
  let routes = 0;
  for (const match of section[1].matchAll(/([A-Za-z][A-Za-z .'-]+)\s*\(([A-Z]{3})\)\s*[-–—]\s*(\d[\d,.]*k)\b/gi)) {
    routes++;
    const origin = match[2].toUpperCase();
    if (wanted.size && !wanted.has(origin)) continue;
    const routeText = match[0].trim();
    const award = validateAwardPricing({ options: [{
      program: program[1], points_min: number(match[3]), points_max: number(match[3]),
      points_unit: "miles", points_basis: "one_way",
      cash_amount: number(fee[1]), cash_currency: "USD", cash_basis: "one_way",
      round_trip_cash: number(fee[2]),
      pricing_text: pricingText, route_text: routeText,
    }] }, clean);
    if (!award) return { complete: false, fares: [] };
    fares.push({ origin, destination: destination[1].trim(), destination_code: destination[2], cabin: "business", airline: "American Airlines", award_pricing: award });
  }
  return { complete: routes > 0, fares };
}
