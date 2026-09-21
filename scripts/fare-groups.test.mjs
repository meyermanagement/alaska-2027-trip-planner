import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { groupFareAlerts } = jiti("../lib/deals/groups.js");
const { homeDayOf } = jiti("../lib/format.js");
const { judged } = jiti("../lib/deals/world.js");
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

// A fare read at 9pm Central on the 20th used to be shown as received on the 21st:
// the row's own save time, sliced in UTC. The date a household recognizes is the
// day the email arrived, in their own zone.
test("the group says when the email arrived, not when this app saved the fare", () => {
  const group = groupFareAlerts([fare("a", {
    created_at: "2026-09-21T02:19:07+00:00",
    email_received_at: "2026-09-20T16:04:21+00:00",
  })])[0];
  assert.equal(group.receivedAt, "2026-09-20T16:04:21+00:00");
  assert.equal(homeDayOf(group.receivedAt), "2026-09-20");
});
test("an evening save is never labelled with tomorrow's date", () => {
  const group = groupFareAlerts([fare("a", { created_at: "2026-09-21T02:19:07+00:00" })])[0];
  assert.equal(group.receivedAt, "2026-09-21T02:19:07+00:00");
  assert.equal(homeDayOf(group.receivedAt), "2026-09-20");
  assert.equal("2026-09-21T02:19:07+00:00".slice(0, 10), "2026-09-21");
});
test("a missing or unreadable arrival date says nothing rather than guessing", () => {
  assert.equal(groupFareAlerts([fare("a", { created_at: null })])[0].receivedAt, null);
  assert.equal(homeDayOf(null), "");
  assert.equal(homeDayOf("not a date"), "");
});
test("the email date is flattened off the joined message and the nesting dropped", () => {
  const rows = judged([{
    id: "a", status: "open", origin: "STL", destination: "London",
    created_at: "2026-09-21T02:19:07+00:00",
    inbox_messages: { received_at: "2026-09-20T16:04:21+00:00" },
  }], {}, "2026-09-20");
  assert.equal(rows[0].email_received_at, "2026-09-20T16:04:21+00:00");
  assert.equal("inbox_messages" in rows[0], false);
});

// A shut row saying "5 award fares" hid which points the family would need.
test("the group names every program it holds, cheapest first", () => {
  const award = (program, points) => ({ options: [{
    program, points_min: points, points_max: points, points_unit: "miles",
    points_basis: "one_way", cash_amount: null, cash_basis: "one_way", round_trip_cash: null,
  }] });
  const group = groupFareAlerts([
    fare("a", { award_pricing: award("British Airways", 99000) }),
    fare("b", { destination: "London", award_pricing: award("Japan Airlines Mileage Bank", 60000) }),
    fare("c", { destination: "Dublin", award_pricing: award("British Airways", 88000) }),
  ])[0];
  assert.deepEqual(group.awardPrograms, ["Japan Airlines Mileage Bank", "British Airways"]);
  assert.equal(group.awardCount, 3);
});
test("a cash-only group names no programs", () => {
  assert.deepEqual(groupFareAlerts([fare("a")])[0].awardPrograms, []);
});
