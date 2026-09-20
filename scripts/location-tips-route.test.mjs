import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = `${root}/scripts/fixtures/location-server.js`;
const alias = { "@": root };
for (const name of ["supabase/server", "supabase/admin", "beta/consent", "agent/llm", "tips/groundingUrls", "push/send"])
  alias[`@/lib/${name}`] = fixture;
const jiti = createJiti(import.meta.url, { alias, moduleCache: false });
const { POST } = await jiti.import("../app/api/tips/location/route.js");
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const today = new Date().toISOString().slice(0, 10);
function setup() {
  const state = globalThis.__locationTest = {
    ai: true, features: { location: true, notifications: true },
    generated: [], pushed: [], claims: new Set(), reads: [], finishAllowed: true,
    tables: {
      trips: [{ id: id(10), family_id: id(100), status: "planned", start_date: today, end_date: today, destination: "Maui" }],
      itinerary_items: [{ id: id(20), trip_id: id(10), item_date: today, title: "Harbor ferry", location: "Harbor", status: "confirmed", is_done: false }],
      location_tip_preferences: [{ user_id: id(1), trip_id: id(10), enabled: true, push_enabled: true, revision: id(40), notice_version: "foreground-location-v1" }],
      location_tips: [],
      push_subscriptions: [
        { id: id(30), user_id: id(1), family_id: id(100), endpoint: "https://push.example/mine", enabled: true },
        { id: id(31), user_id: id(2), family_id: id(100), endpoint: "https://push.example/other-adult", enabled: true },
        { id: id(32), user_id: id(1), family_id: id(200), endpoint: "https://push.example/other-family", enabled: true },
      ],
    },
    result: { searched: true, sources: [{ title: "Ferry operator", url: "https://example.com/ferry" }], text: JSON.stringify({ impacts: [{
      item_id: id(20), kind: "transport", effect: "blocked", affects_plan: true, applies_on: today,
      reported_at: new Date().toISOString(), title: "Ferry departure suspended",
      detail: "The operator reports that the afternoon ferry departure has been suspended.",
      action: "Contact the operator about the replacement bus before leaving.",
      source_url: "https://example.com/ferry", evidence: "Afternoon ferry suspended today",
    }] }) },
  };
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: id(1) } } }) },
    from(table) {
      let filters = [], mode = "read", payload, single = false;
      const q = {
        select() { return q; }, eq(k, v) { filters.push(row => row[k] === v); return q; },
        neq(k, v) { filters.push(row => row[k] !== v); return q; },
        lte() { return q; }, or() { return q; }, order() { return q; }, limit() { return q; },
        maybeSingle() { single = true; return q; },
        update(p) { mode = "update"; payload = p; return q; },
        upsert(p) { mode = "upsert"; payload = p; return q; },
        insert(p) { mode = "insert"; payload = p; return q; },
        delete() { mode = "delete"; return q; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            state.reads.push({ table, mode });
            const rows = (state.tables[table] || []).filter(r => filters.every(f => f(r)));
            if (mode === "update") rows.forEach(r => Object.assign(r, payload));
            if (mode === "upsert") state.tables[table] = [{ ...state.tables[table][0], ...payload }];
            if (table === "location_tip_pushes" && mode === "insert") {
              const key = `${payload.tip_id}:${payload.subscription_id}`;
              if (state.claims.has(key)) return { error: { code: "23505" } };
              state.claims.add(key);
            }
            return { data: single ? rows[0] || null : rows, error: null };
          }).then(resolve, reject);
        },
      }; return q;
    },
    async rpc(name, body) {
      if (name === "claim_location_tips") return { data: state.claimAllowed !== false, error: null };
      if (name === "finish_location_tips") {
        if (state.finishAllowed) state.tables.location_tips = body.p_tips.map((t, index) => ({
          id: id(70 + index), user_id: body.p_user, trip_id: body.p_trip, content: t.content,
          checked_at: new Date().toISOString(), status: "active",
        }));
        return { data: state.finishAllowed, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  };
  state.client = db; state.admin = db;
  return state;
}
async function post(action = "check", extra = {}, child = false) {
  const body = { action, tripId: id(10), timeZone: "UTC", place: { source: "device",
    latitude: 20.889134, longitude: -156.47723, accuracy: 30, timestamp: Date.now() }, ...extra };
  const r = await POST({ url: "https://aly.example/api/tips/location",
    headers: new Headers({ origin: "https://aly.example" }), cookies: { get: () => child ? "child-token" : null },
    json: async () => body });
  return { status: r.status, body: await r.json() };
}
test("route saves a verified personal result, sends coarse research, and does not broadcast", async () => {
  const state = setup();
  const response = await post();
  assert.equal(response.status, 200);
  assert.equal(response.body.tips.length, 1);
  assert.equal(state.generated.length, 1);
  const brief = JSON.parse(state.generated[0].messages[0].text);
  assert.equal(brief.current_place.latitude, 20.89);
  assert.equal(state.generated[0].consentFor, id(1));
  assert.equal(state.pushed.length, 0);
  assert.equal(state.reads.some(x => x.table === "pro_tips"), false);
});
test("child view, AI refusal, missing trip and disabled location fail before model", async () => {
  let state = setup(); assert.equal((await post("check", {}, true)).status, 403); assert.equal(state.generated.length, 0);
  state = setup(); state.ai = false; assert.equal((await post()).status, 403); assert.equal(state.generated.length, 0);
  state = setup(); assert.equal((await post("check", { tripId: id(999) })).status, 404); assert.equal(state.generated.length, 0);
  state = setup(); state.features.location = false; assert.equal((await post()).status, 403); assert.equal(state.generated.length, 0);
  state = setup(); state.tables.location_tip_preferences[0].enabled = false;
  assert.equal((await post()).status, 403); assert.equal(state.generated.length, 0);
});
test("missing grounding, modified plans and revoked opt-in do not save an answer", async () => {
  let state = setup(); state.result.searched = false; assert.equal((await post()).status, 502); assert.equal(state.tables.location_tips.length, 0);
  state = setup(); state.duringResearch = () => { state.tables.itinerary_items = [{ ...state.tables.itinerary_items[0], title: "Changed plan" }]; };
  assert.equal((await post()).status, 409); assert.equal(state.tables.location_tips.length, 0);
  state = setup(); state.finishAllowed = false; assert.equal((await post()).status, 409); assert.equal(state.tables.location_tips.length, 0);
});
test("typed fallback does not need device permission; duplicate claims do not call model", async () => {
  let state = setup(); state.features.location = false;
  assert.equal((await post("check", { place: { source: "typed", label: "Kahului Harbor" } })).status, 200);
  state = setup(); state.claimAllowed = false;
  assert.equal((await post()).body.skipped, true); assert.equal(state.generated.length, 0);
});
test("notification is generic, endpoint-and-family scoped, opt-in gated and deduplicated", async () => {
  const state = setup(); await post();
  for (const endpoint of ["https://push.example/other-adult", "https://push.example/other-family"])
    assert.equal((await post("notify", { tipId: id(70), endpoint })).body.sent, false);
  const extra = { tipId: id(70), endpoint: "https://push.example/mine" };
  assert.equal((await post("notify", extra)).body.sent, true);
  assert.equal((await post("notify", extra)).body.duplicate, true);
  assert.equal(state.pushed.length, 1);
  assert.doesNotMatch(JSON.stringify(state.pushed[0].payload), /Maui|Harbor|20\.89|ferry/i);
  assert.equal(state.pushed[0].ttl, 900);
  assert.match(state.pushed[0].payload.url, /#location-tip-/);
  state.features.notifications = false;
  assert.equal((await post("notify", extra)).body.sent, false);
});
