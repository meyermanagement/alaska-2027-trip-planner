import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { groupFareAlerts } = jiti("../lib/deals/groups.js");
const fare = (id, overrides = {}) => ({
  id, message_id: "email-one", origin: "ORD", destination: "Paris",
  price: 497, source_name: "Thrifty Traveler", ...overrides,
});

test("one alert groups its destinations under the outbound airport", () => {
  const deals = [fare("a"), fare("b", { destination: "Brussels", price: 401 })];
  const result = groupFareAlerts(deals);
  assert.equal(result.length, 1);
  assert.equal(result[0].destinationCount, 2);
  assert.equal(result[0].lowestPrice, 401);
  assert.deepEqual(result[0].deals, deals);
  assert.equal(result[0].deals[0], deals[0]);
});
test("different outbound airports remain separate", () => {
  assert.equal(groupFareAlerts([fare("a"), fare("b", { origin: "STL" })]).length, 2);
});
test("different emails from the same sender and date remain separate", () => {
  assert.equal(groupFareAlerts([fare("a"), fare("b", { message_id: "email-two" })]).length, 2);
});
test("legacy fares without message identity never merge", () => {
  assert.equal(groupFareAlerts([fare("a", { message_id: null }), fare("b", { message_id: "" })]).length, 2);
});
test("normalize airport whitespace and case, not city names", () => {
  assert.equal(groupFareAlerts([fare("a"), fare("b", { origin: " ord " })]).length, 1);
  assert.equal(groupFareAlerts([fare("a"), fare("b", { origin: "MDW" })]).length, 2);
});
test("unknown airports are not silently treated as one airport", () => {
  assert.equal(groupFareAlerts([fare("a", { origin: null }), fare("b", { origin: null })]).length, 2);
});
test("summary counts unique destinations while retaining all fares", () => {
  const [group] = groupFareAlerts([fare("a"), fare("b", { destination: "PARIS", price: 550 })]);
  assert.equal(group.destinationCount, 1);
  assert.equal(group.deals.length, 2);
});
test("invalid, absent, or zero prices do not turn into a free fare", () => {
  const bad = [null, "", "no price", -1, 0, Infinity];
  assert.equal(groupFareAlerts(bad.map((price, i) => fare(String(i), { price })))[0].lowestPrice, null);
  assert.equal(groupFareAlerts([fare("a", { price: null }), fare("b", { price: "401" })])[0].lowestPrice, 401);
});
test("empty input and stable group order", () => {
  assert.deepEqual(groupFareAlerts(), []);
  const groups = groupFareAlerts([fare("a", { origin: "STL" }), fare("b"), fare("c", { origin: "STL" })]);
  assert.deepEqual(groups.map(g => g.origin), ["STL", "ORD"]);
  assert.deepEqual(groups[0].deals.map(d => d.id), ["a", "c"]);
});
