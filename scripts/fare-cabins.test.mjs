import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { fareCabinLabel, fareOfferLabel, fareGroupCabinLabel } = jiti("../lib/deals/cabin.js");

test("every supported cabin has an explicit, readable label", () => {
  for (const [cabin, label] of [
    ["economy", "Economy"], ["premium", "Premium economy"],
    ["business", "Business class"], ["first", "First class"],
    ["premium_economy", "Premium economy"], [" Premium Economy ", "Premium economy"],
  ]) assert.equal(fareCabinLabel({ cabin }), label);
  for (const cabin of [undefined, null, "", "mixed", "unknown"])
    assert.equal(fareCabinLabel({ cabin }), "Cabin not stated");
});

test("cash and award summaries retain price and trip basis alongside cabin", () => {
  assert.equal(fareOfferLabel({ cabin: "economy", price: 496, price_basis: "round_trip" }),
    "$496 per person · round-trip · Economy");
  const award = { cabin: "business", award_pricing: { options: [{
    program: "American AAdvantage", points_min: 97000, points_max: 97000,
    points_unit: "miles", points_basis: "one_way", cash_amount: 6, cash_basis: "one_way",
  }] } };
  assert.equal(fareOfferLabel(award),
    "97,000 American AAdvantage miles + $6 · one-way per person · Business class");
  assert.equal(fareOfferLabel({}), "Price not stated · Cabin not stated");
});

test("group summaries do not assign one cabin to a mixed-cabin email", () => {
  assert.equal(fareGroupCabinLabel([{ cabin: "first" }, { cabin: "first" }]), "First class");
  assert.equal(fareGroupCabinLabel([{ cabin: "business" }, { cabin: "economy" }]), "Mixed cabins");
  assert.equal(fareGroupCabinLabel([{ cabin: "business" }, {}]), "Mixed cabins");
  assert.equal(fareGroupCabinLabel([]), "Cabin not stated");
});
