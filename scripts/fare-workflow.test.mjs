import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { canAttachFare, canAttachFareToPlace } = jiti("../lib/deals/targets.js");
const { verifiedFareBasis } = jiti("../lib/deals/basis.js");
const { tripFor, budgetCheck, ceilingCheck } = jiti("../lib/deals/verdict.js");
const { farePriceLabel } = jiti("../lib/deals/award.js");
const { allowedFareSubscriptions, fareArrivalPayload, pushFareArrival } = jiti("../lib/push/fares.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");
const { unreadFares } = jiti("../lib/deals/unread.js");

test("only drafts and upcoming trips can receive fares; stale dates do not pass", () => {
  const today = "2026-09-19";
  for (const status of ["complete", "archived", "cancelled", "active", undefined])
    assert.equal(canAttachFare({ status, start_date: "2027-01-01" }, today), false);
  for (const status of ["draft", "planning"]) {
    assert.equal(canAttachFare({ status }, today), true);
    assert.equal(canAttachFare({ status, start_date: "2027-01-01" }, today), true);
    assert.equal(canAttachFare({ status, start_date: "2026-01-01", end_date: "2026-01-10" }, today), false);
  }
  assert.equal(canAttachFare({ status: "planning", start_date: "2026-09-18", end_date: "2026-09-22" }, today), false);
  assert.equal(canAttachFareToPlace({ status: "open" }), true);
  assert.equal(canAttachFareToPlace({ status: "done" }), false);
});

test("saved fare follows the selected trip, not an automatic destination match", () => {
  const trips = [
    { id: "automatic", name: "Zurich", status: "draft" },
    { id: "chosen", name: "Disney", status: "planning" },
  ];
  assert.equal(tripFor({ status: "taken", trip_id: "chosen", destination: "Zurich" }, trips).id, "chosen");
  assert.equal(tripFor({ status: "taken", someday_id: "place", destination: "Zurich" }, trips), null);
  assert.equal(tripFor({ status: "taken", trip_id: "deleted" }, trips), null);
});

test("cash basis needs exact evidence, and mixed or missing declarations stay unknown", () => {
  assert.equal(verifiedFareBasis({}, "All fares round-trip, nonstop"), "round_trip");
  assert.equal(verifiedFareBasis({}, "All fares are one-way"), "one_way");
  assert.equal(verifiedFareBasis({}, "All fares round-trip. All fares one-way."), "unspecified");
  assert.equal(verifiedFareBasis({ price_basis_text: "round-trip" }, "$496"), "unspecified");
  assert.equal(verifiedFareBasis({ price_basis_text: "$496 each way" }, "ORD to Paris $496 each way"), "one_way");
  assert.equal(verifiedFareBasis({}, "Fly from $496 per person"), "unspecified");
});

test("cash labels name the basis and unknown/one-way cannot pass a round-trip budget", () => {
  const fare = { price: 496 };
  for (const [basis, label] of [["round_trip", "round-trip"], ["one_way", "one-way"], ["unspecified", "trip type not stated"]])
    assert.ok(farePriceLabel({ ...fare, price_basis: basis }).includes(label));
  for (const basis of ["one_way", "unspecified", undefined]) {
    assert.equal(ceilingCheck({ ...fare, price_basis: basis }, { fare_ceiling: 600 }).verdict, null);
    assert.equal(budgetCheck({ ...fare, price_basis: basis }, { budget_target: 2000 }, { count: 2 }).verdict, null);
  }
  assert.equal(ceilingCheck({ ...fare, price_basis: "round_trip" }, { fare_ceiling: 600 }).verdict, "under");
});

const consent = (user_id, extras = {}) => ({
  user_id, agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION,
  age_confirmed: true, data_acknowledged: true, features: { notifications: true }, ...extras,
});
test("push excludes withdrawn, opted-out, removed and secondary members", () => {
  const users = ["allowed", "withdrawn", "off", "removed", "secondary", "disabled", "stale"];
  const subscriptions = users.map((user_id) => ({ id: user_id, user_id, enabled: user_id !== "disabled" }));
  const members = users.filter((id) => id !== "removed").map((user_id) => ({ user_id }));
  const travelers = [{ user_id: "secondary", access_level: "secondary", is_person: true }];
  const consents = users.map((id) => consent(id, id === "withdrawn" ? { withdrawn_at: "2026-01-01" }
    : id === "off" ? { features: { notifications: false } } : id === "stale" ? { agreement_version: "old" } : {}));
  assert.deepEqual(allowedFareSubscriptions(subscriptions, members, travelers, consents).map((s) => s.id), ["allowed"]);
  assert.equal(fareArrivalPayload({ count: 3, messageId: "mail" }).tag, "fare-arrival-mail");
  assert.equal(fareArrivalPayload({ count: 3, messageId: "mail" }).url, "/someday#fares");
});

// Minimal fluent database fake exercises actual async send/claim code, not just
// the payload. Two workers must contend on the same unique database key.
function database() {
  const claims = new Set();
  const tables = {
    push_subscriptions: [{ id: "browser", user_id: "allowed", enabled: true }],
    family_members: [{ user_id: "allowed" }], travelers: [],
    beta_consents: [consent("allowed")],
    flight_deals: [{ id: "a" }, { id: "b" }], flight_deal_reads: [{ deal_id: "a" }],
  };
  return {
    claims,
    from(table) {
      let action = "select", value, messageId, subscriptionId;
      const q = {
        select() { return q; }, in() { return q; },
        eq(key, val) { if (key === "message_id") messageId = val; if (key === "subscription_id") subscriptionId = val; return q; },
        insert(row) { action = "insert"; value = row; return q; },
        update(row) { action = "update"; value = row; return q; },
        delete() { action = "delete"; return q; },
        then(resolve, reject) {
          let result = { data: tables[table] || [], error: null };
          if (table === "fare_arrival_pushes" && action === "insert") {
            const key = `${value.message_id}:${value.subscription_id}`;
            if (claims.has(key)) result.error = { code: "23505" };
            else claims.add(key);
          }
          if (table === "fare_arrival_pushes" && action === "delete") claims.delete(`${messageId}:${subscriptionId}`);
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
  };
}
test("simultaneous imports and repeated delivery produce one push per browser", async () => {
  const db = database();
  let sent = 0;
  const input = { supabase: db, familyId: "family", messageId: "mail", count: 4, configured: true,
    deliver: async () => { sent++; return { ok: true }; } };
  await Promise.all([pushFareArrival(input), pushFareArrival(input)]);
  await pushFareArrival(input);
  assert.equal(sent, 1);
});
test("failed delivery releases its claim for retry; disabled server sends nothing", async () => {
  const db = database();
  const input = { supabase: db, familyId: "family", messageId: "mail", count: 2, configured: true };
  await pushFareArrival({ ...input, deliver: async () => { throw new Error("offline"); } });
  assert.equal(db.claims.size, 0);
  assert.equal((await pushFareArrival({ ...input, deliver: async () => ({ ok: true }) })).delivered, 1);
  assert.equal((await pushFareArrival({ ...input, configured: false })).delivered, 0);
});
test("reading one fare removes only its own unread count", async () => {
  assert.deepEqual((await unreadFares(database(), "allowed", "family")).map((row) => row.id), ["b"]);
});
