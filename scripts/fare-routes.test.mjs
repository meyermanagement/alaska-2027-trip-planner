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

function setup({ user = { id: "me" }, secondary = false, trip = null, place = null } = {}) {
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
        update(value) { call.action = "update"; call.value = value; return q; },
        upsert(value) { call.action = "upsert"; call.value = value; return q; },
        then(resolve, reject) {
          const data = table === "family_members" ? [{ family_id: "family" }]
            : table === "travelers" ? [{ id: "traveler", access_level: secondary ? "secondary" : "primary", is_person: true }]
            : table === "trips" ? trip : table === "someday_places" ? place
            : table === "flight_deals" ? (call.single ? { id: "fare", ...call.value } : [{ id: "fare" }])
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
