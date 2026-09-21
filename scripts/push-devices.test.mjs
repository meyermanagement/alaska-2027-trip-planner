import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { supersededSubscriptions, deviceIdentity, DEVICE_STORAGE_KEY } = jiti("../lib/push/devices.js");
const { fareArrivalPayload, cheapestFarePhrase } = jiti("../lib/push/fares.js");

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7) Safari";

test("a rotated endpoint retires its own device's old row and nothing else", () => {
  const rows = [
    { id: "old", user_id: "me", endpoint: "e1", device_id: "phone", label: IPHONE },
    { id: "new", user_id: "me", endpoint: "e2", device_id: "phone", label: IPHONE },
    { id: "laptop", user_id: "me", endpoint: "e3", device_id: "mac", label: "Mac Safari" },
    { id: "someone-else", user_id: "you", endpoint: "e4", device_id: "phone", label: IPHONE },
  ];
  assert.deepEqual(
    supersededSubscriptions(rows, { userId: "me", endpoint: "e2", deviceId: "phone", label: IPHONE }),
    ["old"],
  );
});

test("two phones with the same user agent never retire each other", () => {
  const rows = [
    { id: "hers", user_id: "me", endpoint: "e1", device_id: "phone-a", label: IPHONE },
    { id: "his", user_id: "me", endpoint: "e2", device_id: "phone-b", label: IPHONE },
  ];
  assert.deepEqual(supersededSubscriptions(rows, { userId: "me", endpoint: "e2", deviceId: "phone-b", label: IPHONE }), []);
  assert.deepEqual(supersededSubscriptions(rows, { userId: "me", endpoint: "e1", deviceId: "phone-a", label: IPHONE }), []);
});

test("rows from before identifiers existed are cleaned up by the same browser only", () => {
  const rows = [
    { id: "legacy-1", user_id: "me", endpoint: "e1", device_id: null, label: IPHONE },
    { id: "legacy-2", user_id: "me", endpoint: "e2", device_id: null, label: IPHONE },
    { id: "legacy-mac", user_id: "me", endpoint: "e3", device_id: null, label: "Mac Safari" },
    { id: "now", user_id: "me", endpoint: "e9", device_id: "phone", label: IPHONE },
  ];
  assert.deepEqual(
    supersededSubscriptions(rows, { userId: "me", endpoint: "e9", deviceId: "phone", label: IPHONE }),
    ["legacy-1", "legacy-2"],
  );
  // A browser that cannot keep an identifier retires nothing: it cannot prove which row is its own.
  assert.deepEqual(supersededSubscriptions(rows, { userId: "me", endpoint: "e9", deviceId: null, label: IPHONE }), []);
  // An unlabelled legacy row is left standing rather than guessed at.
  assert.deepEqual(
    supersededSubscriptions([{ id: "blank", user_id: "me", endpoint: "e1", device_id: null, label: null }],
      { userId: "me", endpoint: "e2", deviceId: "phone", label: IPHONE }),
    [],
  );
});

test("the identifier is made once and kept; refused storage is not fatal", () => {
  const held = new Map();
  const store = { getItem: (k) => held.get(k) ?? null, setItem: (k, v) => held.set(k, v) };
  const first = deviceIdentity(store);
  assert.ok(first);
  assert.equal(deviceIdentity(store), first);
  assert.equal(held.get(DEVICE_STORAGE_KEY), first);
  const refuses = { getItem: () => { throw new Error("no"); }, setItem: () => {} };
  assert.equal(deviceIdentity(refuses), null);
});

const option = (program, points, unit, basis = "one_way") => ({
  program, points_min: points, points_max: points, points_unit: unit,
  points_basis: basis, cash_amount: null, cash_basis: "unspecified",
  round_trip_cash: null, pricing_text: "",
});
const london = (origin, options) => ({
  origin, destination: "London", destination_code: "LHR", cabin: "business",
  price: null, price_basis: "unspecified", award_pricing: { options },
});

test("the alert names the place, the cabin, the airports and the cheapest seat", () => {
  const deals = [
    london("ATL", [option("British Airways", 99000, "avios"), option("Japan Airlines Mileage Bank", 60000, "miles")]),
    london("ORD", [option("British Airways", 88000, "avios"), option("Japan Airlines Mileage Bank", 42000, "miles")]),
    london("STL", [option("British Airways", 99000, "avios")]),
  ];
  const payload = fareArrivalPayload({ messageId: "mail", count: 3, deals });
  assert.equal(payload.title, "3 new London fares came in");
  assert.equal(payload.body, "Business class · out of ATL, ORD and STL · from 42,000 Japan Airlines Mileage Bank miles");
  assert.equal(payload.url, "/someday#fares");
  assert.equal(payload.tag, "fare-arrival-mail");
  assert.equal(fareArrivalPayload({ messageId: "mail", count: 1, deals: [deals[1]] }).title, "A new London fare came in");
});

test("a round-trip quote is not judged cheapest against one-way ones", () => {
  const deals = [london("STL", [option("Program A", 70000, "miles", "round_trip"), option("Program B", 60000, "miles")])];
  assert.equal(cheapestFarePhrase(deals), "from 70,000 Program A miles");
});

test("cash fares name a dollar price; more than one place is listed", () => {
  const payload = fareArrivalPayload({ messageId: "mail", count: 2, deals: [
    { origin: "STL", destination: "Dublin", cabin: "economy", price: 412, price_basis: "round_trip" },
    { origin: "ORD", destination: "Lisbon", cabin: "economy", price: 538, price_basis: "round_trip" },
  ] });
  assert.equal(payload.title, "2 new fares came in");
  assert.equal(payload.body, "Economy · Dublin and Lisbon · out of STL and ORD · from $412 round-trip");
});

test("what is not known is left out, down to the old wording", () => {
  assert.equal(fareArrivalPayload({ messageId: "mail", count: 1, deals: [{}] }).body,
    "Your forwarded fares are ready to review.");
  assert.equal(fareArrivalPayload({ messageId: "mail", count: 3 }).body,
    "Your forwarded fares are ready to review.");
  // A stated cabin with no price still says the cabin rather than nothing.
  assert.equal(fareArrivalPayload({ messageId: "mail", count: 1, deals: [
    { origin: "STL", destination: "Dublin", cabin: "business" }] }).body,
    "Business class · out of STL");
  assert.equal(cheapestFarePhrase([{ price: null }]), "");
});
