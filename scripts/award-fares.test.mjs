import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { newsletterFares } = jiti("../lib/deals/newsletter.js");
const { checkCandidate } = jiti("../lib/deals/parse.js");
const { hasAwardPricing, validateAwardPricing, farePriceLabel, fareIdentity, consolidateAwardRoutes } = jiti("../lib/deals/award.js");
const { ceilingCheck, budgetCheck, dealVerdict, dealLines } = jiti("../lib/deals/verdict.js");
const { groupFareAlerts } = jiti("../lib/deals/groups.js");
const { deadlinesInView } = jiti("../lib/watch/deadlines.js");

// Route/pricing facts from the reported email. No personal data or tracking URLs.
const email = `England under 97k miles
London (LHR)
Flying American Airlines
Fly American Airlines biz class nonstop to London using your AA miles!
Book with American AAdvantage miles (video guide)
American is charging 72k to 97k miles each way. Taxes & fees are $6 one-way or $420 R/T. Transfer points from Citi.
Other Booking Options (limited dates - mostly from LHR one-way only)
Alaska: 45k-70k one way; $435 in fees from LHR
Chicago - London
ORD-LHR: Solid availability thru April & July - August
LHR-ORD: Solid availability thru August
Departure Cities
(All fares one-way, *nonstop)
Pricing via AA miles
Charlotte (CLT) - 97k*
Chicago (ORD) - 97k*
New York (JFK) - 74k*
How to Book`;
const source = { name: "Thrifty Traveler" };
const candidate = newsletterFares(email, [{ code: "ORD" }]).fares[0];
const fare = () => {
  const result = checkCandidate(candidate, { text: email, source });
  assert.equal(result.ok, true, result.why);
  return { ...result.row, id: "award-one", message_id: "email-one" };
};
test("AA newsletter produces one route using Chicago's 97k, not general 72k", () => {
  const parsed = newsletterFares(email, [{ code: "ORD" }]);
  assert.equal(parsed.complete, true);
  assert.equal(parsed.fares.length, 1);
  const row = fare(), [option] = row.award_pricing.options;
  assert.equal(row.price, null);
  assert.equal(option.points_min, 97000);
  assert.equal(option.points_max, 97000);
  assert.equal(option.cash_amount, 6);
  assert.equal(option.round_trip_cash, 420);
  assert.match(option.pricing_text, /72k to 97k/);
  assert.match(option.route_text, /Chicago/);
  assert.match(farePriceLabel(row), /97,000 American AAdvantage miles \+ \$6.*one-way.*per person/);
});
test("AA reader excludes foreign origins and return-only partner programs", () => {
  assert.deepEqual(newsletterFares(email, [{ code: "STL" }]), { complete: true, fares: [] });
  assert.equal(fare().award_pricing.options.length, 1);
  const ny = newsletterFares(email, [{ code: "JFK" }]).fares[0];
  assert.equal(ny.award_pricing.options[0].points_min, 74000);
});
test("cash-fees-only candidates are refused, including the original $6 and $420", () => {
  for (const price of [6, 420]) {
    assert.equal(checkCandidate({ ...candidate, award_pricing: undefined, price }, { text: email, source }).ok, false);
  }
});
test("card bonus text does not block an ordinary cash fare", () => {
  const text = "ORD to London LHR $499 round trip.\nCard bonus: earn 60,000 points after spending $4,000.";
  assert.equal(hasAwardPricing(text), false);
  assert.equal(checkCandidate({ origin: "ORD", destination: "London", price: 499 }, { text, source }).ok, true);
});
test("award headlines without a trip basis cannot turn their fees into cash fares", () => {
  assert.equal(hasAwardPricing("London 72k–97k points\nTaxes & fees $6"), true);
});
test("award validation rejects invented points, program, fee and swapped fee basis", () => {
  for (const change of [{ points_min: 65000 }, { program: "Imaginary Miles" }, { cash_amount: 5 }, { cash_amount: 420 }, { round_trip_cash: 6 }, { cash_currency: "CAD" }, { pricing_text: "Invented pricing" }]) {
    assert.equal(validateAwardPricing({ options: [{ ...candidate.award_pricing.options[0], ...change }] }, email), null);
  }
});
test("award ranges retain both endpoints, including abbreviated and full-number forms", () => {
  for (const range of ["72k to 97k", "72–97k", "72,000 to 97,000", "72,000–97k"]) {
    const quote = `Book with Example points: ${range} points each way + $6 one-way.`;
    const option = { program: "Example", points_min: 72000, points_max: 97000, points_unit: "points", points_basis: "one_way", cash_amount: 6, cash_currency: "USD", cash_basis: "one_way", pricing_text: quote };
    assert.ok(validateAwardPricing({ options: [option] }, quote), range);
  }
});
test("unknown fees are not zero; explicit zero stays zero", () => {
  for (const cash of [null, 0]) {
    const quote = `Book with Example: 20,000 points each way${cash === 0 ? " + $0 one-way" : ""}.`;
    const option = { program: "Example", points_min: 20000, points_unit: "points", points_basis: "one_way", cash_amount: cash, cash_currency: "USD", cash_basis: "one_way", pricing_text: quote };
    const checked = validateAwardPricing({ options: [option] }, quote);
    assert.ok(checked);
    assert.match(farePriceLabel({ award_pricing: checked }), cash === null ? /fees not stated/ : /\+ \$0/);
  }
});
test("award identity ignores source quote changes; routes and programs consolidate", () => {
  const row = fare();
  const changed = structuredClone(row);
  changed.award_pricing.options[0].pricing_text += " Extra source context.";
  assert.equal(fareIdentity(row), fareIdentity(changed));
  const merged = consolidateAwardRoutes([row, changed]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].award_pricing.options.length, 1);
});
test("award fees do not enter group cash summaries, ceilings or trip budgets", () => {
  const row = fare();
  assert.equal(groupFareAlerts([row])[0].lowestPrice, null);
  assert.equal(groupFareAlerts([row])[0].awardCount, 1);
  assert.equal(ceilingCheck(row, { fare_ceiling: 1000 }).verdict, null);
  assert.equal(budgetCheck(row, { budget: 5000 }, { count: 2 }, {}).verdict, null);
  assert.ok(dealVerdict(row).facts.some(fact => fact.includes("fees alone")));
  assert.match(dealLines([row]).join("\n"), /97,000.*\+ \$6/);
  assert.equal(groupFareAlerts([row, { ...row, id: "cash", price: 499, award_pricing: null }])[0].lowestPrice, 499);
});
test("deadline notifications keep miles and fees together", () => {
  const row = { ...fare(), book_by: "2026-10-01" };
  const alert = deadlinesInView({ deals: [row], today: "2026-10-01" }).alerts[0];
  assert.match(alert.title, /97,000.*\+ \$6/);
  assert.match(alert.body, /97,000.*\+ \$6/);
  assert.doesNotMatch(alert.title, /for \$6 to/);
});
