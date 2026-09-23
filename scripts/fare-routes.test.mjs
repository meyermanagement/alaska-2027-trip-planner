import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { moduleCache: false, alias: {
  "@/lib/supabase/server": fileURLToPath(new URL("./fixtures/fare-server.js", import.meta.url)),
  "@": fileURLToPath(new URL("..", import.meta.url)),
} });
const single = jiti("../app/api/deals/[id]/route.js");
const group = jiti("../app/api/deals/group/route.js");
const unread = jiti("../app/api/deals/unread/route.js");

function setup({ user = { id: "me" }, secondary = false, trip = null, place = null, fare = {} } = {}) {
  const calls = [];
  globalThis.__fareTestDb = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      const call = { table, filters: [], action: "read" };
      calls.push(call);
      const q = {
        select() { return q; }, order() { return q; }, maybeSingle() { call.single = true; return q; },
        eq(key, value) { call.filters.push([key, value]); return q; },
        in(key, value) { call.filters.push([key, value]); return q; },
        or(value) { call.filters.push(["or", value]); return q; },
        update(value) { call.action = "update"; call.value = value; return q; },
        upsert(value) { call.action = "upsert"; call.value = value; return q; },
        then(resolve, reject) {
          const data = table === "family_members" ? [{ family_id: "family" }]
            : table === "travelers" ? [{ id: "traveler", family_id: "family", access_level: secondary ? "secondary" : "primary", is_person: true }]
            : table === "trips" ? trip : table === "someday_places" ? place
            : table === "flight_deals" ? (call.single ? { id: "fare", ...fare, ...call.value } : [{ id: "fare" }])
            : [];
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return calls;
}
const req = (body) => new Request("http://localhost/api/deals/fare", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const save = (body) => single.POST(req(body), { params: Promise.resolve({ id: "fare" }) });

test("fare routes reject unsigned and secondary writes before any update", async () => {
  for (const state of [{ user: null }, { secondary: true }]) {
    const calls = setup(state);
    const expected = state.user === null ? 401 : 403;
    assert.equal((await save({ status: "taken", trip_id: "trip" })).status, expected);
    assert.equal((await group.POST(req({ ids: ["fare"] }))).status, expected);
    assert.equal((await unread.POST(req({ ids: ["fare"] }))).status, expected);
    assert.equal(calls.filter((call) => call.action !== "read").length, 0);
  }
});
test("trip attachment returns canonical destination and scopes every write to household", async () => {
  const calls = setup({ trip: { id: "trip", name: "Disney", slug: "disney", public_id: "3rdp5s", status: "planning", start_date: "2099-11-20" } });
  const response = await save({ status: "taken", trip_id: "trip" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).destinationUrl, "/trips/disney-3rdp5s?tab=overview#fares");
  assert.ok(calls.find((c) => c.table === "trips").filters.some(([k, v]) => k === "family_id" && v === "family"));
  assert.ok(calls.find((c) => c.action === "update").filters.some(([k, v]) => k === "family_id" && v === "family"));
});
test("past, current, missing and ambiguous targets are rejected without saving", async () => {
  for (const trip of [null, { status: "complete" }, { status: "active" }, { status: "planning", end_date: "2020-01-01" }]) {
    const calls = setup({ trip });
    assert.equal((await save({ status: "taken", trip_id: "trip" })).status, 400);
    assert.equal(calls.some((c) => c.action === "update"), false);
  }
  setup();
  assert.equal((await save({ status: "taken" })).status, 400);
  assert.equal((await save({ status: "taken", trip_id: "trip", someday_id: "place" })).status, 400);
});
test("bucket list save and restoring an accidental attachment use explicit destinations", async () => {
  const calls = setup({ place: { id: "place", status: "open" } });
  const result = await save({ status: "taken", someday_id: "place" });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).destinationUrl, "/someday#saved-fares");
  await save({ status: "open" });
  assert.equal(calls.filter((c) => c.action === "update").at(-1).value.trip_id, null);
  assert.equal(calls.filter((c) => c.action === "update").at(-1).value.someday_id, null);
  await save({ status: "dismissed", reason: "Wrong week" });
  const declined = calls.filter((c) => c.action === "update").at(-1).value;
  assert.equal(declined.trip_id, null);
  assert.equal(declined.someday_id, null);
  assert.equal(declined.dismissed_reason, "Wrong week");
});
test("clearing a group is one update, restricted to open fares in the household", async () => {
  const calls = setup();
  assert.equal((await group.POST(req({ ids: ["fare", "fare", "another"] }))).status, 200);
  const writes = calls.filter((c) => c.action === "update");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].filters, [["family_id", "family"], ["status", "open"], ["id", ["fare", "another"]]]);
});
test("marking read uses authorized fare IDs and the caller's user ID", async () => {
  const calls = setup();
  assert.equal((await unread.POST(req({ ids: ["fare", "foreign"] }))).status, 200);
  assert.deepEqual(calls.find((c) => c.action === "upsert").value, [{ deal_id: "fare", user_id: "me" }]);
});

test("group dismissal saves the same optional reason as an individual fare", async () => {
  const calls = setup();
  assert.equal((await group.POST(req({ ids: ["fare"], reason: "  Wrong week for us  " }))).status, 200);
  assert.equal(calls.find((call) => call.action === "update").value.dismissed_reason, "Wrong week for us");
  const fallback = setup();
  await group.POST(req({ ids: ["fare"], reason: "" }));
  assert.equal(fallback.find((call) => call.action === "update").value.dismissed_reason, "Cleared with email group");
});

test("a past stated deadline cannot be restored, while estimates can", async () => {
  const calls = setup({ fare: { book_by: "2000-01-01" } });
  assert.equal((await save({ status: "open" })).status, 409);
  assert.equal(calls.some((call) => call.action === "update"), false);
  setup({ fare: { book_by: "2000-01-01", book_by_inferred: true } });
  assert.equal((await save({ status: "open" })).status, 200);
});

test("group restore is atomic, household-scoped, declined-only and deadline guarded", async () => {
  const calls = setup();
  const response = await group.POST(req({ ids: ["fare", "fare", "another"], action: "restore" }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { restored: 1, skipped: 1 });
  const writes = calls.filter((c) => c.action === "update");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].value, { status: "open", dismissed_reason: null, trip_id: null, someday_id: null, updated_by: "me" });
  assert.ok(writes[0].filters.some(([k, v]) => k === "family_id" && v === "family"));
  assert.ok(writes[0].filters.some(([k, v]) => k === "status" && v === "dismissed"));
  assert.deepEqual(writes[0].filters.find(([k]) => k === "id")[1], ["fare", "another"]);
  assert.match(writes[0].filters.find(([k]) => k === "or")[1], /^book_by\.is\.null,book_by\.gte\.\d{4}-\d{2}-\d{2},book_by_inferred\.eq\.true$/);
});

test("group actions reject malformed requests and unauthorized restore", async () => {
  for (const body of [{ ids: ["fare"], action: "erase" }, { ids: [] }, { ids: [3] },
    { ids: Array.from({ length: 201 }, (_, i) => `${i}`) }]) {
    const calls = setup();
    assert.equal((await group.POST(req(body))).status, 400);
    assert.equal(calls.some((c) => c.action === "update"), false);
  }
  for (const state of [{ user: null }, { secondary: true }]) {
    const calls = setup(state);
    assert.equal((await group.POST(req({ ids: ["fare"], action: "restore" }))).status, state.user === null ? 401 : 403);
    assert.equal(calls.some((c) => c.action === "update"), false);
  }
});
