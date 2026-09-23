import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { newsletterFares, fareReadInput } = jiti("../lib/deals/newsletter.js");
const { checkCandidate } = jiti("../lib/deals/parse.js");
const { hasAwardPricing, farePriceLabel } = jiti("../lib/deals/award.js");
const airports = [{ code: "ORD" }, { code: "STL" }];
// Redacted facts only: no mailbox identifiers or account/tracking links.
const award = `England from 33k points
London (LHR, LGW)
Flying British Airways
Fly British Airways biz class.
Best: November - May
Book with British Airways Avios (video guide)
British Airways charges 88k to 110k Avios + $394 to $599 each way in fees, depending on route & travel dates.
Book with Cathay Pacific Asia Miles
Cathay charges 63k to 93k miles each way.
Book with Japan Airlines Mileage Bank
JAL charges 42k to 60k miles one way or 80k - 100k R/T.
Taxes & fees vary from ~$220 - $390 one way or $900 - $1200 R/T.
With the 30% transfer bonus, book from 33k Citi points.
No availability from STL via Cathay & JAL.
****Departure Cities****
(All fares one-way, *nonstop)
Pricing via BA Avios or JAL miles
******via BA Avios (off-peak)******
London (LHR)
Boston (BOS) - 88k*
Chicago (ORD) - 88k*
St. Louis (STL) - 99k*
London (LGW)
Orlando (MCO) - 99k
via JAL miles
London (LHR)
Boston (BOS) - 42k*
Chicago (ORD) - 42k*
London (LGW)
Orlando (MCO) - 60k
How to Book`;
const cash = `Ireland under $578
Dublin (DUB), Shannon (SNN)
Flying Aer Lingus, American, Delta, United
Best: November, January - April
Departure Cities
(All fares round-trip, *nonstop)
Dublin (DUB)
Boston (BOS) - $440*
Chicago (ORD) - $540*
****Shannon (SNN)****Boston (BOS) - $471*
How to Book`;
test("destination-headed awards retain program-specific route prices, not headline transfers", () => {
  const result = newsletterFares(award, airports);
  assert.equal(result.complete, true);
  assert.equal(result.fares.length, 2);
  const ord = result.fares.find(f => f.origin === "ORD");
  assert.equal(ord.destination_code, "LHR");
  assert.equal(ord.cabin, "business");
  assert.deepEqual(ord.award_pricing.options.map(o => o.points_min), [88000, 42000]);
  assert.equal(result.fares.find(f => f.origin === "STL").award_pricing.options.length, 1);
  for (const candidate of result.fares) {
    const checked = checkCandidate(candidate, { text: award, source: { name: "Thrifty Traveler" } });
    assert.equal(checked.ok, true, checked.why);
    assert.equal(checked.row.price, null);
    assert.ok(checked.row.award_pricing.options.every(o => o.cash_amount === null));
  }
  // The email lists Avios first; the household cares which seat is cheapest.
  assert.match(farePriceLabel(ord), /^42,000 Japan Airlines Mileage Bank miles/);
  assert.match(farePriceLabel(ord), /also British Airways/);
});
test("cash destination headers and collapsed Markdown headings do not reverse routes", () => {
  const result = newsletterFares(cash, airports);
  assert.equal(result.complete, true);
  assert.equal(result.fares.length, 1);
  assert.equal(result.fares[0].origin, "ORD");
  assert.equal(result.fares[0].destination_code, "DUB");
  assert.equal(result.fares[0].price, 540);
  const boston = newsletterFares(cash, [{ code: "BOS" }]);
  assert.deepEqual(boston.fares.map(f => f.destination_code), ["DUB", "SNN"]);
});
test("fallback does not discard destination tables, even on its second pass", () => {
  for (const text of [award, cash, award.replace("London (LHR, LGW)", "England")]) {
    const input = fareReadInput(fareReadInput(text, airports), airports);
    assert.match(input, /Chicago \(ORD\)/);
  }
});
test("Avios-only prices are awards, never fees-only cash fares", () => {
  assert.equal(hasAwardPricing("Book with British Airways: 88,000 Avios each way + $394."), true);
});
test("unsupported award programs and ambiguous directions require fallback", () => {
  assert.equal(newsletterFares(award.replace("via JAL miles\n", "via Unknown miles\n"), airports).complete, false);
  assert.equal(newsletterFares(cash.replace("Dublin (DUB), Shannon (SNN)", "Ireland"), airports).complete, false);
});

// Thrifty Traveler's single-program award layout (Madrid, September 22, 2026).
// Redacted facts only: no links or account identifiers.
const iberia = `Spain
from 20k points
Madrid (MAD)
Flying Iberia
Best: October - November, January - March
(Full availability: Oct - Mar — Varies by city)
We think this will last less than 24 hours (sale ends tomorrow, Sep. 23rd!)
Deal Summary
Book for as low as 20k Amex MR points R/T w/ transfer bonus (details below).
Booking Options
Book with Iberia Avios
Iberia is charging 26k - 34k Avios R/T for basic economy (
upgrade to comfort from 14k more). This is 15 - 20% off the usual rates.
Use the 30% Amex transfer bonus to book from
20k Amex MR points R/T!
****Departure Cities****
(All fares roundtrip, *nonstop)
**Prices via Iberia Avios**
**Boston (BOS) - 26k*
Chicago (ORD) - 28k*
Dallas (DFW) - 34k*
Washington, D.C. (IAD) - 26k***
****How to Book****
Taxes & fees are ~$220 roundtrip.`;
test("a single-program points table is read exactly, per route, without the model", () => {
  const result = newsletterFares(iberia, [{ code: "ORD" }, { code: "DFW" }, { code: "STL" }]);
  assert.equal(result.complete, true);
  assert.deepEqual(result.fares.map(f => [f.origin, f.destination_code, f.award_pricing.options[0].points_min]),
    [["ORD", "MAD", 28000], ["DFW", "MAD", 34000]]);
  const ord = result.fares[0];
  assert.equal(ord.destination, "Madrid");
  assert.equal(ord.cabin, "economy");
  assert.equal(ord.award_pricing.options[0].program, "Iberia");
  assert.equal(ord.award_pricing.options[0].points_basis, "round_trip");
  // The estimate is kept as the sender's words, never as an exact fee.
  assert.equal(ord.award_pricing.options[0].cash_amount, null);
  assert.deepEqual(ord.travel_months, [1, 2, 3, 10, 11, 12]);
  const checked = checkCandidate(ord, { text: iberia, source: { name: "Thrifty Traveler" }, receivedAt: "2026-09-22T18:14:54Z" });
  assert.equal(checked.ok, true);
  assert.equal(farePriceLabel(checked.row), "28,000 Iberia Avios · round-trip · exact fees not confirmed per person");
});
test("an unfamiliar row in a points table sends the whole email to the model", () => {
  const odd = iberia.replace("Dallas (DFW) - 34k*", "Dallas (DFW) - 34k (Comfort only)");
  const result = newsletterFares(odd, [{ code: "ORD" }]);
  assert.equal(result.complete, false);
  assert.equal(result.fares.length, 0);
});
