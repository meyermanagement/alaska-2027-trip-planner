// The read-only assistant connection, against two invented households that
// share traveler names, a child, a secondary traveler, a draft trip and notes
// that must never leave the app. Made-up data only.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { readerScope } = jiti("../lib/mcp/scope.js");
const { TOOLS, callTool } = jiti("../lib/mcp/tools.js");
const { handleMessage } = jiti("../lib/mcp/protocol.js");
const { devKeyConfig, keyMatches } = jiti("../lib/mcp/devKey.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");

const TODAY = "2027-03-10";
const A = "fam-a", B = "fam-b";
const consent = (user_id) => ({ user_id, agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION, age_confirmed: true, data_acknowledged: true });

function world() {
  return {
    beta_consents: [consent("u-ann"), consent("u-sam"), consent("u-bob"), consent("u-kid")],
    family_members: [
      { family_id: A, user_id: "u-ann" }, { family_id: A, user_id: "u-sam" },
      { family_id: B, user_id: "u-bob" },
    ],
    travelers: [
      { id: "ta1", family_id: A, name: "Ann", user_id: "u-ann", is_person: true, access_level: "primary", date_of_birth: "1980-01-01", accessibility_notes: "SECRET-HEALTH" },
      { id: "ta2", family_id: A, name: "Sam", user_id: "u-sam", is_person: true, access_level: "secondary", date_of_birth: "1982-01-01" },
      { id: "ta3", family_id: A, name: "Kit", user_id: null, is_person: true, access_level: "primary", date_of_birth: "2015-06-01" },
      { id: "tb1", family_id: B, name: "Ann", user_id: null, is_person: true, access_level: "primary", date_of_birth: "1970-01-01" },
      { id: "tb2", family_id: B, name: "Bob", user_id: "u-bob", is_person: true, access_level: "primary", date_of_birth: "1971-01-01" },
    ],
    trips: [
      { id: "trip-a1", family_id: A, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-15", status: "planning" },
      { id: "trip-a2", family_id: A, name: "Secret draft", destination: "Oslo", start_date: "2027-06-01", end_date: "2027-06-05", status: "draft" },
      { id: "trip-a0", family_id: A, name: "Maui last year", destination: "Maui", start_date: "2026-03-01", end_date: "2026-03-08", status: "complete" },
      { id: "trip-b1", family_id: B, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-12", status: "planning" },
    ],
    trip_travelers: [
      { trip_id: "trip-a1", traveler_id: "ta1" }, { trip_id: "trip-a1", traveler_id: "ta2" }, { trip_id: "trip-a1", traveler_id: "ta3" },
      { trip_id: "trip-a2", traveler_id: "ta2" },
      { trip_id: "trip-a0", traveler_id: "ta1" },
      { trip_id: "trip-b1", traveler_id: "tb1" }, { trip_id: "trip-b1", traveler_id: "tb2" },
    ],
    itinerary_items: [
      { trip_id: "trip-a1", item_date: TODAY, start_time: "14:00:00", title: "Snorkel tour", location: "Playa Lagun", notes: "SECRET-NOTE", confirmation_number: "SECRET-CONF", cost_actual: 999 },
      { trip_id: "trip-a1", item_date: TODAY, start_time: "08:30:00", title: "Breakfast" },
      { trip_id: "trip-a1", item_date: "2027-03-09", end_date: "2027-03-15", title: "Hotel stay", category: "lodging" },
      { trip_id: "trip-a0", item_date: "2026-03-03", title: "Mama's Fish House", location: "Paia", rating: 5, review: "Worth it" },
      { trip_id: "trip-b1", item_date: TODAY, start_time: "09:00:00", title: "OTHER-HOUSEHOLD", location: "Playa Lagun", rating: 1, review: "OTHER-HOUSEHOLD" },
    ],
    packing_items: [
      { id: "p1", trip_id: "trip-a1", category: "Clothes", item: "Swimsuit", assignee: "Ann", is_packed: true },
      { id: "p2", trip_id: "trip-a1", category: "Clothes", item: "Hat", assignee: "Ann", is_packed: false },
      { id: "p3", trip_id: "trip-a1", category: "Gear", item: "Snorkel", assignee: "Sam", is_packed: false },
      { id: "p4", trip_id: "trip-a1", category: "Toys", item: "Kit's goggles", assignee: "Kit", is_packed: false },
      { id: "p5", trip_id: "trip-a1", category: "Old", item: "Stashed", assignee: "Ann", is_packed: false, stashed_at: "2027-01-01" },
      { id: "p6", trip_id: "trip-b1", category: "Clothes", item: "OTHER-HOUSEHOLD", assignee: "Ann", is_packed: false },
      { id: "p7", trip_id: "trip-a1", category: "Health", item: "Inhaler", assignee: "Ann", is_packed: false },
      { id: "p8", trip_id: "trip-a1", category: "Clothes", item: "Hat", assignee: "Sam", is_packed: false },
    ],
    pro_tips: [
      { family_id: A, trip_id: "trip-a1", title: "Book the snorkel boat", body: "It sells out.", status: "active", act_by: "2027-03-11", for_date: TODAY },
      { family_id: A, trip_id: "trip-a1", title: "Old tip", body: "x", status: "cleared" },
      { family_id: B, trip_id: "trip-b1", title: "OTHER-HOUSEHOLD", body: "x", status: "active" },
    ],
    minors: new Set(["u-kid"]),
  };
}

// Just enough of supabase-js: select, eq, in, order and await.
function fakeAdmin(db, calls = []) {
  return {
    rpc: async (fn, args) => {
      calls.push(`rpc:${fn}`);
      if (fn !== "account_is_minor") return { data: null, error: { message: "no" } };
      return { data: db.minors.has(args.account_id), error: null };
    },
    from(table) {
      calls.push(`from:${table}`);
      let rows = [...(db[table] || [])];
      let cols = null;
      const q = {
        select(c) { cols = c.split(",").map((s) => s.trim()); return q; },
        eq(k, v) { rows = rows.filter((r) => r[k] === v); return q; },
        in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return q; },
        order(k) { rows.sort((a, b) => String(a[k]).localeCompare(String(b[k]))); return q; },
        insert() { throw new Error("write attempted"); },
        update(patch) {
          // The one write the tools may make: a patch to rows matched by eq(),
          // recorded so a test can see exactly what changed.
          const where = [];
          const u = {
            eq(k, v) { where.push([k, v]); return u; },
            select() {
              const hit = (db[table] || []).filter((r) => where.every(([k, v]) => r[k] === v));
              for (const r of hit) Object.assign(r, patch);
              calls.push(`update:${table}:${hit.length}`);
              return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            },
          };
          return u;
        },
        delete() { throw new Error("write attempted"); },
        upsert() { throw new Error("write attempted"); },
        maybeSingle() { return Promise.resolve({ data: pick(rows)[0] || null, error: null }); },
        then(ok, bad) { return Promise.resolve({ data: pick(rows), error: null }).then(ok, bad); },
      };
      const pick = (rs) => (cols ? rs.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : rs);
      return q;
    },
  };
}

async function asUser(userId, db = world()) {
  const admin = fakeAdmin(db);
  const scope = await readerScope(admin, userId, TODAY);
  return { admin, scope, call: (name, args) => callTool(admin, scope, name, args) };
}

test("every tool is titled; only the check-off writes, and nothing destroys", () => {
  assert.equal(TOOLS.length, 23);
  for (const t of TOOLS) {
    assert.ok(t.title && t.description, t.name);
    assert.equal(t.annotations.readOnlyHint, t.name !== "check_off_packing_item", t.name);
    assert.equal(t.annotations.destructiveHint, false, t.name);
  }
});

test("the key works only when set, long enough, and off production", () => {
  const key = "k".repeat(40);
  assert.deepEqual(devKeyConfig({ MCP_DEV_KEY: key, MCP_DEV_USER_ID: "u" }), { key, userId: "u" });
  assert.equal(devKeyConfig({}), null);
  assert.equal(devKeyConfig({ MCP_DEV_KEY: "short", MCP_DEV_USER_ID: "u" }), null);
  assert.equal(devKeyConfig({ MCP_DEV_KEY: key }), null);
  assert.equal(devKeyConfig({ MCP_DEV_KEY: key, MCP_DEV_USER_ID: "u", VERCEL_ENV: "production" }), null);
  assert.equal(keyMatches(key, key), true);
  assert.equal(keyMatches(key + "x", key), false);
  assert.equal(keyMatches("", key), false);
});

test("refusals: no consent, a minor account, no household", async () => {
  const db = world();
  db.beta_consents = db.beta_consents.filter((c) => c.user_id !== "u-bob");
  assert.equal((await asUser("u-bob", db)).scope.refused, "consent");
  const stale = world();
  stale.beta_consents.find((c) => c.user_id === "u-bob").agreement_version = "2020-01-01";
  assert.equal((await asUser("u-bob", stale)).scope.refused, "consent");
  assert.equal((await asUser("u-kid")).scope.refused, "minor");
  const lonely = world();
  lonely.beta_consents.push(consent("u-none"));
  assert.equal((await asUser("u-none", lonely)).scope.refused, "no-household");
});

test("trips stay inside the household, same names and all", async () => {
  const { call } = await asUser("u-ann");
  const all = await call("list_trips", { when: "all" });
  assert.deepEqual(all.trips.map((t) => t.id).sort(), ["trip-a0", "trip-a1", "trip-a2"]);
  const up = await call("list_trips", {});
  assert.deepEqual(up.trips.map((t) => t.id), ["trip-a1", "trip-a2"]);
  const b = await (await asUser("u-bob")).call("list_trips", { when: "all" });
  assert.deepEqual(b.trips.map((t) => t.id), ["trip-b1"]);
});

test("a secondary traveler sees only non-draft trips they are on, and only their own packing", async () => {
  const { call } = await asUser("u-sam");
  const all = await call("list_trips", { when: "all" });
  assert.deepEqual(all.trips.map((t) => t.id), ["trip-a1"]);
  await assert.rejects(call("get_trip", { trip: "Secret draft" }), /No trip matches/);
  const packing = await call("get_packing_status", {});
  assert.equal(packing.total, 2, "Sam's snorkel and hat");
  assert.deepEqual(Object.keys(packing.unpacked_by_category).sort(), ["Clothes", "Gear"]);
});

test("the day is one day, in time order, with no notes, codes or costs", async () => {
  const { call } = await asUser("u-ann");
  const day = await call("get_itinerary_day", { trip: "curacao" });
  assert.deepEqual(day.items.map((i) => i.title), ["Breakfast", "Snorkel tour", "Hotel stay"]);
  assert.equal(day.items[2].continues_from, "2027-03-09");
  const text = JSON.stringify(day);
  for (const secret of ["SECRET-NOTE", "SECRET-CONF", "999", "OTHER-HOUSEHOLD"]) assert.ok(!text.includes(secret), secret);
  assert.match(day.summary, /08:30 Breakfast/);
  await assert.rejects(call("get_itinerary_day", { date: "tomorrow" }), /YYYY-MM-DD/);
});

test("a parent sees a child's packing, not the child as a traveler; health lines stay out", async () => {
  const { call } = await asUser("u-ann");
  const people = await call("get_travelers", { trip: "Curacao spring" });
  assert.deepEqual(people.travelers.map((p) => p.name), ["Ann", "Sam"]);
  assert.ok(!JSON.stringify(people).includes("SECRET-HEALTH"));
  const packing = await call("get_packing_status", {});
  assert.equal(packing.total, 5, "the stashed line and the inhaler left out, Kit's goggles kept");
  assert.ok(JSON.stringify(packing).includes("Kit's goggles"));
  assert.ok(!JSON.stringify(packing).includes("Inhaler"));
  const ann = await call("get_packing_status", { traveler: "ann" });
  assert.equal(ann.packed, 1);
  assert.equal(ann.total, 2);
  assert.equal((await call("get_packing_status", { traveler: "Kit" })).total, 1);
});

test("a secondary traveler never sees a child's packing", async () => {
  const { call } = await asUser("u-sam");
  const packing = await call("get_packing_status", {});
  assert.ok(!JSON.stringify(packing).includes("Kit"));
  await assert.rejects(call("check_off_packing_item", { item: "goggles" }), /No packing item/);
});

test("checking off: one line, the reader's own, ambiguity refused, idempotent", async () => {
  const db = world();
  const calls = [];
  const admin = fakeAdmin(db, calls);
  const ann = await readerScope(admin, "u-ann", TODAY);
  const run = (scope, a) => callTool(admin, scope, "check_off_packing_item", a);
  await assert.rejects(run(ann, { item: "Hat" }), /More than one item matches[\s\S]*Nothing was changed/);
  const done = await run(ann, { item: "hat", traveler: "Sam" });
  assert.equal(done.changed, true);
  assert.equal(db.packing_items.find((r) => r.id === "p8").is_packed, true);
  assert.equal(db.packing_items.find((r) => r.id === "p8").packed_by, "u-ann");
  assert.equal(db.packing_items.find((r) => r.id === "p2").is_packed, false, "Ann's hat untouched");
  // Only Ann's hat is still unpacked, so the same words now pick it.
  assert.equal((await run(ann, { item: "Hat" })).for, "Ann");
  assert.equal((await run(ann, { item: "Hat", traveler: "Ann" })).changed, false);
  assert.equal((await run(ann, { item: "goggles" })).for, "Kit", "a parent checks off a child's line");
  await assert.rejects(run(ann, { item: "Inhaler" }), /No packing item/);
  await assert.rejects(run(ann, { item: "OTHER-HOUSEHOLD" }), /No packing item/);
  await assert.rejects(run(ann, { item: "Stashed" }), /No packing item/);
  const undo = await run(ann, { item: "Swimsuit", packed: "no" });
  assert.equal(undo.packed, false);
  assert.equal(db.packing_items.find((r) => r.id === "p1").packed_at, null);
  await assert.rejects(run(ann, { item: "Swimsuit", packed: "maybe" }), /yes" or "no/);
  const sam = await readerScope(admin, "u-sam", TODAY);
  await assert.rejects(run(sam, { item: "Swimsuit" }), /No packing item/, "a secondary cannot reach Ann's line");
  assert.equal((await run(sam, { item: "Snorkel" })).changed, true);
  assert.ok(calls.filter((c) => c.startsWith("update:")).every((c) => c === "update:packing_items:1"));
});

test("tips are open ones for this household only", async () => {
  const { call } = await asUser("u-ann");
  const tips = await call("get_pro_tips", {});
  assert.deepEqual(tips.tips.map((t) => t.title), ["Book the snorkel boat"]);
  assert.equal((await call("get_pro_tips", { date: "2027-03-12" })).tips.length, 0);
});

test("reviews come from this household's trips only", async () => {
  const { call } = await asUser("u-ann");
  const maui = await call("get_prior_reviews", { place: "maui" });
  assert.deepEqual(maui.reviews.map((r) => r.place), ["Mama's Fish House"]);
  const lagun = await call("get_prior_reviews", { place: "Playa Lagun" });
  assert.equal(lagun.reviews.length, 0);
});

test("bad arguments are refused rather than guessed at", async () => {
  const { call } = await asUser("u-ann");
  await assert.rejects(call("get_trip", { trip: "zzz" }), /No trip matches/);
  await assert.rejects(call("get_trip", { trip: 5 }), /must be text/);
  await assert.rejects(call("list_trips", { family_id: B }), /Unexpected argument/);
  await assert.rejects(call("drop_everything", {}), /Unknown tool/);
});

test("no tool but the check-off ever writes", async () => {
  const db = world();
  const calls = [];
  const admin = fakeAdmin(db, calls);
  const scope = await readerScope(admin, "u-ann", TODAY);
  const args = { get_prior_reviews: { place: "maui" } };
  for (const t of TOOLS.filter((x) => x.annotations.readOnlyHint)) await callTool(admin, scope, t.name, args[t.name] || {});
  assert.ok(!calls.some((c) => c.startsWith("update:")));
});

test("the protocol: list without the database, call through the scope, headers checked", async () => {
  let scoped = 0;
  const db = world();
  const admin = fakeAdmin(db);
  const getScope = async () => { scoped++; return readerScope(admin, "u-ann", TODAY); };
  const list = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { client: admin, getScope });
  assert.equal(list.body.result.tools.length, 23);
  assert.equal(scoped, 0);
  const call = await handleMessage(
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_trip", arguments: {} } },
    { client: admin, getScope, headers: { "mcp-method": "tools/call", "mcp-name": "get_trip", "mcp-protocol-version": "2026-07-28" } },
  );
  assert.equal(call.body.result.structuredContent.trip.id, "trip-a1");
  assert.equal(call.body.result.content[0].type, "text");
  const mismatch = await handleMessage(
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_trip" } },
    { client: admin, getScope, headers: { "mcp-name": "list_trips" } },
  );
  assert.equal(mismatch.status, 400);
  const version = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }, { client: admin, getScope, headers: { "mcp-protocol-version": "1999-01-01" } });
  assert.equal(version.status, 400);
  const note = await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, { client: admin, getScope });
  assert.equal(note.status, 202);
  const init = await handleMessage({ jsonrpc: "2.0", id: 5, method: "initialize", params: { protocolVersion: "2025-06-18" } }, { client: admin, getScope });
  assert.equal(init.body.result.protocolVersion, "2025-06-18");
  const refused = await handleMessage(
    { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "list_trips" } },
    { client: admin, getScope: async () => ({ refused: "consent", message: "no" }) },
  );
  assert.equal(refused.body.result.isError, true);
  const broken = await handleMessage(
    { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "list_trips" } },
    { admin: { from() { throw new Error("db down SECRET"); } }, getScope: async () => ({ families: [{ familyId: A }], travelers: [], today: TODAY }) },
  );
  assert.equal(broken.body.result.isError, true);
  assert.ok(!JSON.stringify(broken.body).includes("SECRET"));
});

test("initialize names the icon an assistant may show", async () => {
  const { handleMessage: hm, SERVER_ICON } = jiti("../lib/mcp/protocol.js");
  const { body } = await hm({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }, { getScope: async () => ({}) });
  const icon = body.result.serverInfo.icons[0];
  assert.equal(icon.src, SERVER_ICON);
  assert.match(icon.src, /^https:\/\//);
  assert.equal(icon.mimeType, "image/png");
});
