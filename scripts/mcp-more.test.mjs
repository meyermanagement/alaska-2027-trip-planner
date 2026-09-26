// The third batch of writes (moreTools.js): packing lists and templates, the
// budget, packing lines and reminders, favorite moments, fares, home airports,
// the bucket list, pets on a trip, and travel preferences.
// Two invented households with a shared first name (Ann), a secondary (Sam),
// a child (Kit), health lines and duplicates. Made-up data only.
//
// The fake client applies no row-level security, so these tests prove what
// the tools themselves refuse; RLS and the guard triggers are a second wall.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { readerScope } = jiti("../lib/mcp/scope.js");
const { callTool } = jiti("../lib/mcp/tools.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");

const TODAY = "2027-03-10";
const A = "fam-a", B = "fam-b";
const consent = (user_id) => ({ user_id, agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION, age_confirmed: true, data_acknowledged: true });

function world() {
  return {
    beta_consents: [consent("u-ann"), consent("u-sam"), consent("u-bob")],
    family_members: [{ family_id: A, user_id: "u-ann" }, { family_id: A, user_id: "u-sam" }, { family_id: B, user_id: "u-bob" }],
    travelers: [
      { id: "ta1", family_id: A, name: "Ann", user_id: "u-ann", is_person: true, access_level: "primary", date_of_birth: "1980-01-01" },
      { id: "ta2", family_id: A, name: "Sam", user_id: "u-sam", is_person: true, access_level: "secondary", date_of_birth: "1982-01-01" },
      { id: "ta3", family_id: A, name: "Kit", user_id: null, is_person: true, access_level: "primary", date_of_birth: "2015-06-01" },
      { id: "tb1", family_id: B, name: "Ann", user_id: null, is_person: true, access_level: "primary", date_of_birth: "1970-01-01" },
      { id: "tb2", family_id: B, name: "Bob", user_id: "u-bob", is_person: true, access_level: "primary", date_of_birth: "1971-01-01" },
    ],
    trips: [
      { id: "trip-a1", family_id: A, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-15", status: "planning" },
      { id: "trip-b1", family_id: B, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-12", status: "planning" },
    ],
    trip_travelers: [
      { trip_id: "trip-a1", traveler_id: "ta1" }, { trip_id: "trip-a1", traveler_id: "ta2" }, { trip_id: "trip-a1", traveler_id: "ta3" },
      { trip_id: "trip-b1", traveler_id: "tb1" }, { trip_id: "trip-b1", traveler_id: "tb2" },
    ],
    packing_items: [
      { id: "p1", trip_id: "trip-a1", item: "Hat", assignee: "Ann", is_packed: false },
      { id: "p2", trip_id: "trip-a1", item: "Old towel", assignee: "Ann", is_packed: false, stashed_at: "2027-01-01" },
      { id: "pb", trip_id: "trip-b1", item: "OTHER-HOUSEHOLD", assignee: "Ann", is_packed: false },
      { id: "p3", trip_id: "trip-a1", item: "Binoculars", assignee: "Shared", is_packed: false },
      { id: "p4", trip_id: "trip-a1", item: "Snorkel", assignee: "Kit", is_packed: false },
      { id: "p5", trip_id: "trip-a1", item: "Rain shell", assignee: "Ann", is_packed: false },
      { id: "p6", trip_id: "trip-a1", item: "Rain shell", assignee: "Sam", is_packed: false },
      { id: "p7", trip_id: "trip-a1", item: "EpiPen", assignee: "Ann", is_packed: false },
    ],
    day_pack_items: [
      { id: "d1", trip_id: "trip-a1", item_date: TODAY, item: "Towel", assignee: "Sam", is_packed: false },
      { id: "d2", trip_id: "trip-a1", item_date: TODAY, item: "Towel", assignee: "Ann", is_packed: false },
      { id: "d3", trip_id: "trip-a1", item_date: TODAY, item: "Kit's goggles", assignee: "Kit", is_packed: false },
      { id: "d4", trip_id: "trip-a1", item_date: TODAY, item: "Inhaler", assignee: "Ann", is_packed: false },
      { id: "d5", trip_id: "trip-a1", item_date: TODAY, item: "Sunscreen", assignee: "Shared", is_packed: false },
      { id: "d6", trip_id: "trip-a1", item_date: "2027-03-11", item: "Towel", assignee: "Sam", is_packed: false },
      { id: "db", trip_id: "trip-b1", item_date: TODAY, item: "Towel", assignee: "Ann", is_packed: false },
    ],
    predeparture_tasks: [
      { id: "r1", trip_id: "trip-a1", title: "Print boarding passes", assignee: "Ann", is_done: false },
      { id: "r2", trip_id: "trip-a1", title: "Refill prescription", assignee: "Ann", is_done: false },
      { id: "r3", trip_id: "trip-a1", title: "Charge Kit's tablet", assignee: "Ann", is_done: false },
      { id: "r4", trip_id: "trip-a1", title: "Hold the mail", assignee: "Shared", is_done: false },
      { id: "r5", trip_id: "trip-a1", title: "Check in online", assignee: "Sam", is_done: false },
      { id: "r6", trip_id: "trip-a1", title: "Check in online", assignee: "Ann", is_done: false },
      { id: "rb", trip_id: "trip-b1", title: "Print boarding passes", assignee: "Ann", is_done: false },
    ],
    someday_places: [
      { id: "s1", family_id: A, place: "Iceland", status: "open" },
      { id: "s2", family_id: A, place: "Peru", status: "retired" },
      { id: "sb", family_id: B, place: "Kyoto", status: "open" },
    ],
    itinerary_items: [
      { id: "11111111-1111-4111-8111-111111111111", trip_id: "trip-a1", title: "Dinner at Kome", item_date: "2027-03-10", start_time: "19:00:00", category: "dining", status: "planned", location: "Pietermaai", notes: "SECRET-NOTE", confirmation_number: "CONF-123" },
      { id: "22222222-2222-4222-8222-222222222222", trip_id: "trip-a1", title: "Snorkel tour", item_date: "2027-03-11", category: "excursion", status: "planned" },
      { id: "33333333-3333-4333-8333-333333333333", trip_id: "trip-a1", title: "Snorkel tour", item_date: "2027-03-13", category: "excursion", status: "planned" },
      { id: "44444444-4444-4444-8444-444444444444", trip_id: "trip-a1", title: "Hotel Kura", item_date: "2027-03-09", end_date: "2027-03-15", category: "lodging", status: "confirmed" },
      { id: "55555555-5555-4555-8555-555555555555", trip_id: "trip-b1", title: "Dinner at Kome", item_date: "2027-03-10", category: "dining", status: "planned" },
    ],
    rewards_programs: [
      { id: "w1", family_id: A, traveler_id: "ta1", brand: "Alaska Airlines", program_name: "Mileage Plan", kind: "airline", currency_label: "miles", points_balance: 1000, member_number: "MEMBER-999", notes: "SECRET", is_active: true },
      { id: "w2", family_id: A, traveler_id: "ta2", brand: "Alaska Airlines", program_name: "Mileage Plan", kind: "airline", points_balance: 50, is_active: true },
      { id: "w3", family_id: A, traveler_id: "ta3", brand: "Hilton", program_name: "Honors", kind: "hotel", points_balance: 7, is_active: true },
      { id: "w4", family_id: A, traveler_id: "ta1", brand: "Marriott", kind: "hotel", is_active: false },
      { id: "wb", family_id: B, traveler_id: "tb1", brand: "Alaska Airlines", program_name: "Mileage Plan", kind: "airline", points_balance: 5, is_active: true },
    ],
    packing_templates: [
      { id: "tp1", family_id: A, name: "Everything", is_base: true },
      { id: "tp2", family_id: A, name: "Beach", is_base: false },
      { id: "tp3", family_id: A, name: "Beach weekend", is_base: false },
      { id: "tpb", family_id: B, name: "Everything", is_base: true },
    ],
    packing_template_items: [{ id: "ti1", template_id: "tp1", item: "Passport", assignee: "Ann" }],
    trip_basic_history: [],
    trip_costs: [
      { id: "c1", trip_id: "trip-a1", label: "Rental car", category: "getting_around", cost_estimate: 300, cost_actual: null, sort_order: 1 },
      { id: "cb", trip_id: "trip-b1", label: "Rental car", category: "getting_around", cost_estimate: 999, sort_order: 1 },
    ],
    trip_templates: [{ trip_id: "trip-a1", template_id: "tp2" }],
    favorite_moments: [{ id: "f1", family_id: A, traveler_id: "ta1", body: "Sunrise on the ferry", sort_order: 1 }],
    flight_deals: [
      { id: "fd1", family_id: A, origin: "STL", destination: "Lisbon", price: 512, currency: "USD", status: "open", book_by: "2027-04-01" },
      { id: "fd2", family_id: A, origin: "STL", destination: "Reykjavik", price: 400, currency: "USD", status: "open", book_by: "2027-03-01" },
      { id: "fdb", family_id: B, origin: "ORD", destination: "Lisbon", price: 300, currency: "USD", status: "open" },
    ],
    home_airports: [{ id: "ha1", family_id: A, code: "STL", drive_minutes: 25, is_primary: true }],
    pets: [{ id: "pet1", family_id: A, name: "Rex", species: "dog", travel_style: "car", medications: "SECRET-MEDS" }],
    trip_pets: [],
    travel_preferences: [
      { id: "tp-1", family_id: A, traveler_id: "ta1", traveler_ids: ["ta1"], topic: "flights", topics: ["flights"], body: "Window seats", sort_order: 1 },
      { id: "tp-2", family_id: A, traveler_id: "ta3", traveler_ids: ["ta3"], topic: "food", topics: ["food"], body: "Plain pasta", sort_order: 2 },
      { id: "tp-b", family_id: B, traveler_id: "tb1", traveler_ids: ["tb1"], topic: "flights", topics: ["flights"], body: "Window seats", sort_order: 1 },
    ],
    house_tasks: [],
    minors: new Set(),
  };
}

// supabase-js reads and writes, recorded in calls. Unlike mcp-plan's fake,
// this one supports neq, is, head counts, upsert and a recorded delete.
function fakeAdmin(db, calls = []) {
  return {
    rpc: async (fn, args) => ({ data: fn === "account_is_minor" ? db.minors.has(args.account_id) : null, error: fn === "account_is_minor" ? null : { message: "no" } }),
    from(table) {
      let rows = [...(db[table] || [])];
      let cols = null;
      let head = false;
      const q = {
        select(c, opts) { cols = c.split(",").map((s) => s.trim()).filter((s) => !s.includes("(")); head = !!opts?.head; return q; },
        eq(k, v) { rows = rows.filter((r) => r[k] === v); return q; },
        neq(k, v) { rows = rows.filter((r) => r[k] !== v); return q; },
        is(k, v) { rows = rows.filter((r) => (r[k] ?? null) === v); return q; },
        in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return q; },
        gt(k, v) { rows = rows.filter((r) => r[k] != null && r[k] > v); return q; },
        gte(k, v) { rows = rows.filter((r) => r[k] != null && r[k] >= v); return q; },
        lt(k, v) { rows = rows.filter((r) => r[k] != null && r[k] < v); return q; },
        limit(n) { rows = rows.slice(0, n); return q; },
        order() { return q; },
        insert(row) {
          const save = () => {
            const list = Array.isArray(row) ? row : [row];
            const ids = list.map((r) => {
              const saved = { id: `new-${(db[table] || []).length + 1}`, ...r };
              (db[table] ||= []).push(saved);
              return saved.id;
            });
            calls.push({ op: "insert", table, row });
            return ids;
          };
          return {
            select() {
              const ids = save();
              const p = Promise.resolve({ data: ids.map((id) => ({ id, trip_id: "x", pet_id: "x" })), error: null });
              p.single = () => Promise.resolve({ data: { id: ids[0], slug: row.slug, public_id: "pub" }, error: null });
              return p;
            },
            then(ok, bad) { save(); return Promise.resolve({ data: null, error: null }).then(ok, bad); },
          };
        },
        upsert(row, opts) {
          const keys = String(opts?.onConflict || "id").split(",");
          const hit = (db[table] ||= []).find((r) => keys.every((k) => r[k] === row[k]));
          if (hit) Object.assign(hit, row); else db[table].push({ ...row });
          calls.push({ op: "upsert", table, row });
          return { select: () => Promise.resolve({ data: [{ pet_id: row.pet_id }], error: null }) };
        },
        update(patch) {
          const where = [];
          const u = {
            eq(k, v) { where.push((r) => r[k] === v); return u; },
            neq(k, v) { where.push((r) => r[k] !== v); return u; },
            in(k, vs) { where.push((r) => vs.includes(r[k])); return u; },
            then(ok, bad) { return u.select().then(() => ({ error: null })).then(ok, bad); },
            select() {
              const hit = (db[table] || []).filter((r) => where.every((w) => w(r)));
              for (const r of hit) Object.assign(r, patch);
              calls.push({ op: "update", table, ids: hit.map((r) => r.id), patch });
              return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            },
          };
          return u;
        },
        delete() {
          const where = [];
          const d = {
            eq(k, v) { where.push((r) => r[k] === v); return d; },
            in(k, vs) { where.push((r) => vs.includes(r[k])); return d; },
            then(ok, bad) {
              const gone = (db[table] || []).filter((r) => where.every((w) => w(r)));
              db[table] = db[table].filter((r) => !gone.includes(r));
              calls.push({ op: "delete", table, rows: gone });
              return Promise.resolve({ error: null }).then(ok, bad);
            },
          };
          return d;
        },
        maybeSingle() { return Promise.resolve({ data: pick(rows)[0] || null, error: null }); },
        then(ok, bad) { return Promise.resolve(head ? { count: rows.length, data: null, error: null } : { data: pick(rows), error: null }).then(ok, bad); },
      };
      const pick = (rs) => (cols && !cols.includes("*") ? rs.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : rs);
      return q;
    },
  };
}

async function asUser(userId) {
  const db = world();
  const calls = [];
  const admin = fakeAdmin(db, calls);
  const scope = await readerScope(admin, userId, TODAY);
  return { db, calls, call: (name, args) => callTool(admin, scope, name, args) };
}
const row = (db, table, id) => db[table].find((r) => r.id === id);


const inserts = (calls, table) => calls.filter((c) => c.op === "insert" && c.table === table);
const noSecrets = (out) => {
  const s = JSON.stringify(out);
  for (const bad of ["SECRET", "CONF-123", "MEMBER-999", "OTHER-HOUSEHOLD"]) assert.ok(!s.includes(bad), bad);
};

const WRITES = ["start_packing_list", "set_trip_templates", "add_trip_cost", "update_trip_cost", "update_packing_item", "update_reminder", "add_favorite_moment", "put_fare_on_trip", "dismiss_fare", "save_home_airport", "retire_bucket_list_place", "set_pet_plan", "add_preference", "update_preference"];
const SAMPLE = {
  start_packing_list: {}, set_trip_templates: { templates: "Beach" }, add_trip_cost: { label: "Tour" },
  update_trip_cost: { cost: "Rental car", estimate: "1" }, update_packing_item: { item: "Hat", quantity: "2" },
  update_reminder: { reminder: "Print boarding passes", priority: "high" }, add_favorite_moment: { whose: "Ann", moment: "A hike" },
  put_fare_on_trip: { fare: "Lisbon", trip: "Curacao spring" }, dismiss_fare: { fare: "Lisbon" }, save_home_airport: { code: "MCI" },
  retire_bucket_list_place: { place: "Iceland" }, set_pet_plan: { pet: "Rex", arrangement: "sitter" },
  add_preference: { preference: "Aisle seats" }, update_preference: { preference: "Window", new_wording: "Window seats, left side" },
};

test("a secondary is refused every one of the fourteen, and nothing is written", async () => {
  const sam = await asUser("u-sam");
  for (const name of WRITES) {
    await assert.rejects(sam.call(name, SAMPLE[name]), /primary/, name);
  }
  assert.equal(sam.calls.filter((c) => c.op !== "select").length, 0);
});

test("start_packing_list: fills an empty list, refuses a started one and a draft", async () => {
  const { db, calls, call } = await asUser("u-ann");
  await assert.rejects(call("start_packing_list", {}), /already has a packing list/);
  db.packing_items = db.packing_items.filter((i) => i.trip_id !== "trip-a1");
  const out = await call("start_packing_list", {});
  assert.equal(out.changed, true);
  assert.equal(out.added, 1);
  assert.equal(inserts(calls, "packing_items")[0].row[0].trip_id, "trip-a1");
  db.trips[0].status = "draft";
  db.packing_items = db.packing_items.filter((i) => i.trip_id !== "trip-a1");
  await assert.rejects(call("start_packing_list", { trip: "Curacao spring" }), /draft|no current/i);
});

test("set_trip_templates: adds without dropping, removes only what is named, none clears", async () => {
  const { db, calls, call } = await asUser("u-ann");
  const start = db.trip_templates.map((r) => r.template_id);
  assert.deepEqual(start, ["tp2"]);
  const out = await call("set_trip_templates", { templates: "Beach weekend" });
  assert.deepEqual(out.templates.sort(), ["Beach weekend", db.packing_templates.find((t) => t.id === "tp2").name].sort());
  assert.deepEqual(db.trip_templates.map((r) => r.template_id).sort(), ["tp2", "tp3"]);
  assert.equal(calls.filter((c) => c.op === "delete").length, 0, "adding never deletes");
  assert.ok(db.trips[0].templates_chosen_at);
  const again = await call("set_trip_templates", { templates: "beach weekend" });
  assert.equal(again.changed, false);
  await assert.rejects(call("set_trip_templates", { templates: "none" }), /say none in remove/);
  await assert.rejects(call("set_trip_templates", { templates: "Beach weekend", remove: "Beach weekend" }), /both/);
  await call("set_trip_templates", { remove: "Beach weekend" });
  assert.deepEqual(db.trip_templates.map((r) => r.template_id), ["tp2"]);
  await call("set_trip_templates", { remove: "none" });
  assert.equal(db.trip_templates.length, 0);
  assert.equal(db.packing_templates.length, 4, "templates themselves untouched");
  await assert.rejects(call("set_trip_templates", { templates: "Everything" }), /No add-on template/);
  await assert.rejects(call("set_trip_templates", {}), /add or remove/);
});

test("budget: add, refuse a duplicate and health, update one line, other household untouched", async () => {
  const { db, call } = await asUser("u-ann");
  const out = await call("add_trip_cost", { label: "Glacier tour", category: "doing", estimate: "$1,200" });
  assert.equal(out.changed, true);
  assert.equal(db.trip_costs.at(-1).cost_estimate, 1200);
  assert.equal(db.trip_costs.at(-1).created_by, "u-ann");
  assert.equal((await call("add_trip_cost", { label: "rental car" })).changed, false);
  await assert.rejects(call("add_trip_cost", { label: "Physical therapy copay" }), /health/);
  await assert.rejects(call("add_trip_cost", { label: "Kit's camp" }), /child/);
  const up = await call("update_trip_cost", { cost: "Rental car", actual: "280" });
  assert.equal(up.changed, true);
  assert.equal(row(db, "trip_costs", "c1").cost_actual, 280);
  assert.equal(row(db, "trip_costs", "cb").cost_estimate, 999);
  assert.equal(row(db, "trip_costs", "cb").cost_actual, undefined);
});

test("update_packing_item: a child's line for a parent, ambiguity, health hidden, notes never written", async () => {
  const { db, calls, call } = await asUser("u-ann");
  await assert.rejects(call("update_packing_item", { item: "Rain shell", bag: "Carry-on" }), /More than one/);
  const out = await call("update_packing_item", { item: "Rain shell", traveler: "Sam", bag: "Carry-on", last_minute: "yes" });
  assert.equal(out.changed, true);
  assert.equal(row(db, "packing_items", "p6").bag, "Carry-on");
  assert.equal(row(db, "packing_items", "p5").bag, undefined);
  await call("update_packing_item", { item: "Snorkel", quantity: "2" });
  assert.equal(row(db, "packing_items", "p4").quantity, "2");
  await call("update_packing_item", { item: "Hat", assignee: "Kit" });
  assert.equal(row(db, "packing_items", "p1").assignee, "Kit");
  await assert.rejects(call("update_packing_item", { item: "EpiPen", quantity: "2" }), /No packing-list line/);
  await assert.rejects(call("update_packing_item", { item: "Old towel", quantity: "2" }), /No packing-list line/);
  await assert.rejects(call("update_packing_item", { item: "Binoculars", name: "Insulin kit" }), /health/);
  for (const c of calls.filter((c) => c.op === "update")) assert.ok(!("notes" in c.patch));
  assert.equal(row(db, "packing_items", "pb").quantity, undefined);
});

test("update_reminder: hides child and health reminders, refuses a child assignee", async () => {
  const { db, call } = await asUser("u-ann");
  await assert.rejects(call("update_reminder", { reminder: "Check in online", priority: "high" }), /More than one/);
  const out = await call("update_reminder", { reminder: "Check in online", traveler: "Ann", due_date: "2027-03-08", priority: "high" });
  assert.equal(out.changed, true);
  assert.equal(row(db, "predeparture_tasks", "r6").priority, "high");
  await assert.rejects(call("update_reminder", { reminder: "Refill prescription", priority: "low" }), /No reminder/);
  await assert.rejects(call("update_reminder", { reminder: "Kit's tablet", priority: "low" }), /No reminder/);
  await assert.rejects(call("update_reminder", { reminder: "Hold the mail", assignee: "Kit" }), /not in this household/);
  await assert.rejects(call("update_reminder", { reminder: "Hold the mail", due_date: "March 8" }), /YYYY-MM-DD/);
  assert.equal(row(db, "predeparture_tasks", "rb").priority, undefined);
  assert.equal(row(db, "predeparture_tasks", "r6").detail, undefined);
});

test("favorite moments: one adult, never a child or Shared, no duplicates", async () => {
  const { db, call } = await asUser("u-ann");
  const out = await call("add_favorite_moment", { whose: "Sam", moment: "Pancakes in Reykjavik" });
  assert.equal(out.changed, true);
  assert.equal(db.favorite_moments.at(-1).traveler_id, "ta2");
  assert.equal(db.favorite_moments.at(-1).family_id, A);
  await assert.rejects(call("add_favorite_moment", { whose: "Kit", moment: "The zoo" }), /child/);
  await assert.rejects(call("add_favorite_moment", { whose: "Shared", moment: "The zoo" }), /one person/);
  await assert.rejects(call("add_favorite_moment", { whose: "Bob", moment: "The zoo" }), /not in this household/);
  assert.equal((await call("add_favorite_moment", { whose: "Ann", moment: "sunrise on the ferry" })).changed, false);
});

test("fares: put one on a trip or turn it down; expired and other-household fares are out of reach", async () => {
  const { db, call } = await asUser("u-ann");
  await assert.rejects(call("put_fare_on_trip", { fare: "Reykjavik", trip: "Curacao spring" }), /No open fare/);
  const out = await call("put_fare_on_trip", { fare: "Lisbon", trip: "Curacao spring" });
  assert.equal(out.changed, true);
  assert.equal(row(db, "flight_deals", "fd1").status, "taken");
  assert.equal(row(db, "flight_deals", "fd1").trip_id, "trip-a1");
  assert.equal(row(db, "flight_deals", "fdb").status, "open");
  db.flight_deals[0].status = "open";
  await call("dismiss_fare", { fare: "STL to Lisbon", reason: "Wrong month" });
  assert.equal(row(db, "flight_deals", "fd1").status, "dismissed");
  assert.equal(row(db, "flight_deals", "fd1").dismissed_reason, "Wrong month");
  assert.equal(db.flight_deals.length, 3, "nothing deleted");
});

test("home airports: add one, move the main one, refuse an unknown code and a silly drive", async () => {
  const { db, call } = await asUser("u-ann");
  const out = await call("save_home_airport", { code: "mci", drive_time: "3 hr 45 min", primary: "yes" });
  assert.equal(out.changed, true);
  const mci = db.home_airports.find((a) => a.code === "MCI");
  assert.equal(mci.drive_minutes, 225);
  assert.equal(mci.is_primary, true);
  assert.equal(row(db, "home_airports", "ha1").is_primary, false);
  assert.equal((await call("save_home_airport", { code: "STL", drive_time: "25 min" })).changed, false);
  await assert.rejects(call("save_home_airport", { code: "LHR" }), /US or Canadian/);
  await assert.rejects(call("save_home_airport", { code: "ORD", drive_time: "three days" }), /drive_time/);
});

test("bucket list: retire a place; a retired one says so; the other household's stays", async () => {
  const { db, call } = await asUser("u-ann");
  const out = await call("retire_bucket_list_place", { place: "iceland" });
  assert.equal(out.changed, true);
  assert.equal(row(db, "someday_places", "s1").status, "retired");
  assert.equal((await call("retire_bucket_list_place", { place: "Peru" })).changed, false);
  await assert.rejects(call("retire_bucket_list_place", { place: "Kyoto" }), /No place/);
  assert.equal(row(db, "someday_places", "sb").status, "open");
});

test("pets: set an arrangement, never return medications, refuse health notes and off", async () => {
  const { db, call } = await asUser("u-ann");
  const out = await call("set_pet_plan", { pet: "Rex", arrangement: "boarding", notes: "Kennel on Big Bend" });
  assert.equal(out.changed, true);
  noSecrets(out);
  assert.equal(db.trip_pets[0].arrangement, "boarding");
  assert.equal((await call("set_pet_plan", { pet: "Rex", arrangement: "boarding" })).changed, false);
  await assert.rejects(call("set_pet_plan", { pet: "Rex", arrangement: "none" }), /arrangement must be one of/);
  await assert.rejects(call("set_pet_plan", { pet: "Rex", arrangement: "undecided" }), /arrangement must be one of/);
  await assert.rejects(call("set_pet_plan", { pet: "Rex", arrangement: "sitter", notes: "Give his insulin at 8" }), /health/);
});

test("preferences: said, for adults or Shared, never a child or health; update only visible ones", async () => {
  const { db, call } = await asUser("u-ann");
  const out = await call("add_preference", { preference: "We would rather walk than taxi", topics: "getting around, food and drink" });
  assert.equal(out.changed, true);
  const saved = db.travel_preferences.at(-1);
  assert.equal(saved.source, "said");
  assert.equal(saved.family_id, A);
  assert.deepEqual(saved.traveler_ids, []);
  assert.equal(saved.traveler_id, null);
  assert.equal(saved.topics.length, 2);
  await call("add_preference", { preference: "Aisle seats", whose: "Ann and Sam" });
  assert.deepEqual(db.travel_preferences.at(-1).traveler_ids, ["ta1", "ta2"]);
  await assert.rejects(call("add_preference", { preference: "Early dinners", whose: "Kit" }), /child/);
  await assert.rejects(call("add_preference", { preference: "Kit likes early dinners" }), /child/);
  await assert.rejects(call("add_preference", { preference: "Gluten-free restaurants only" }), /health/);
  assert.equal((await call("add_preference", { preference: "window seats" })).changed, false);
  await assert.rejects(call("update_preference", { preference: "Plain pasta", new_wording: "Any pasta" }), /No preference/);
  const up = await call("update_preference", { preference: "Window", new_wording: "Window seats, left side", whose: "Sam" });
  assert.equal(up.changed, true);
  assert.equal(row(db, "travel_preferences", "tp-1").body, "Window seats, left side");
  assert.deepEqual(row(db, "travel_preferences", "tp-1").traveler_ids, ["ta2"]);
  assert.equal(row(db, "travel_preferences", "tp-b").body, "Window seats");
});

test("create_trip names the next steps as suggestions", async () => {
  const { call } = await asUser("u-ann");
  const out = await call("create_trip", { name: "Maui fall", destination: "Maui", start_date: "2027-10-01", end_date: "2027-10-08" });
  assert.ok(out.next_steps.some((s) => /set_trip_templates/.test(s) && /Beach weekend/.test(s)));
  assert.ok(out.next_steps.some((s) => /start_packing_list/.test(s)));
  assert.ok(out.next_steps.some((s) => /Ask before/.test(s)));
});

// ---- Suggested next steps and refusals that point to Alyeska ---------------

test("a draft is told which basic to ask about next", async () => {
  const { call } = await asUser("u-ann");
  const out = await call("create_trip", { name: "Someday Japan", status: "draft" });
  assert.ok(out.next_steps.some((s) => /basics are answered\. Next, ask/.test(s)), JSON.stringify(out.next_steps));
});

test("a new trip says what the departure list added, and what it left out", async () => {
  const { db, call } = await asUser("u-ann");
  db.house_tasks = [
    { id: "h1", family_id: A, title: "Hold the mail", only_when_empty: true, sort_order: 1 },
    { id: "h2", family_id: A, title: "Water the plants", only_when_empty: false, sort_order: 2 },
    { id: "hb", family_id: B, title: "OTHER-HOUSEHOLD", only_when_empty: false, sort_order: 1 },
  ];
  const out = await call("create_trip", { name: "Chicago weekend", start_date: "2027-05-01", end_date: "2027-05-03", travelers: "Ann" });
  const line = out.next_steps.find((s) => /departure/.test(s));
  assert.ok(line, JSON.stringify(out.next_steps));
  assert.match(line, /left out 1/);
  noSecrets(out);
});

test("new dates on a trip abroad name the adult whose passport falls short, never the child", async () => {
  const { db, call } = await asUser("u-ann");
  db.trip_facts = [{ trip_id: "trip-a1", leaves_country: true, countries: ["Curacao"] }];
  db.traveler_documents = [
    { traveler_id: "ta1", doc_type: "passport", expiration_date: "2027-06-01" },
    { traveler_id: "ta2", doc_type: "passport", expiration_date: "2035-01-01" },
    { traveler_id: "ta3", doc_type: "passport", expiration_date: "2027-04-01" },
  ];
  const out = await call("update_trip", { trip: "Curacao spring", end_date: "2027-03-16" });
  const line = (out.next_steps || []).find((s) => /add_reminder/.test(s));
  assert.ok(line, JSON.stringify(out));
  assert.match(line, /Ann/);
  assert.doesNotMatch(line, /Kit/);
});

test("no passport suggestion without trip facts", async () => {
  const { db, call } = await asUser("u-ann");
  db.traveler_documents = [{ traveler_id: "ta1", doc_type: "passport", expiration_date: "2027-06-01" }];
  const out = await call("update_trip", { trip: "Curacao spring", end_date: "2027-03-16" });
  assert.ok(!(out.next_steps || []).some((s) => /passport/i.test(s)));
});

test("a cost that takes the trip over budget says so once", async () => {
  const { db, call } = await asUser("u-ann");
  db.trips[0].budget_target = 500;
  const under = await call("add_trip_cost", { label: "Tour", estimate: "100" });
  assert.equal(under.next_steps, undefined);
  const over = await call("add_trip_cost", { label: "Boat", estimate: "400" });
  assert.ok(over.next_steps.some((s) => /over its \$500 budget/.test(s)), JSON.stringify(over.next_steps));
});

test("a fare put on a trip offers the itinerary and the budget, asking first", async () => {
  const { call } = await asUser("u-ann");
  const out = await call("put_fare_on_trip", { fare: "Lisbon", trip: "Curacao spring" });
  assert.ok(out.next_steps.some((s) => /add_itinerary_item/.test(s)));
  assert.ok(out.next_steps.some((s) => /\$512/.test(s) && /add_trip_cost/.test(s)));
  assert.ok(out.next_steps.some((s) => /Ask before/.test(s)));
});

test("a template change names the upcoming trips it would reach, and links to Packing", async () => {
  const { db, call } = await asUser("u-ann");
  db.trips.push(
    { id: "trip-a2", family_id: A, name: "Maui fall", start_date: "2027-10-01", end_date: "2027-10-08", status: "planning", templates_chosen_at: "2027-01-01" },
    { id: "trip-b2", family_id: B, name: "OTHER-HOUSEHOLD", start_date: "2027-10-01", status: "planning", templates_chosen_at: "2027-01-01" },
  );
  db.trip_templates.push({ trip_id: "trip-a2", template_id: "tp1" }, { trip_id: "trip-b2", template_id: "tpb" });
  const out = await call("add_template_item", { item: "Reef shoes", traveler: "Ann" });
  const line = (out.next_steps || []).find((s) => /Packing page/.test(s));
  assert.ok(line, JSON.stringify(out));
  assert.match(line, /Maui fall/);
  assert.match(line, /https:\/\/www\.alyeska\.app\/packing/);
  noSecrets(out);
});

test("a refusal sends the person to Alyeska, with a link", async () => {
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("add_trip_cost", { label: "Tour" }), (err) => {
    assert.match(err.message, /Ask a primary traveler in your household; they can do it in Alyeska: https:\/\/www\.alyeska\.app/);
    return true;
  });
  await assert.rejects(sam.call("get_budget", {}), /can see it in Alyeska: https:/);
  const ann = await asUser("u-ann");
  await assert.rejects(ann.call("add_packing_item", { item: "Insulin", traveler: "Ann" }), (err) => {
    assert.match(err.message, /added in Alyeska, not through an assistant/);
    assert.match(err.message, /Open Alyeska: https:\/\/www\.alyeska\.app/);
    assert.doesNotMatch(err.message, /in the app/);
    return true;
  });
  await assert.rejects(ann.call("no_such_tool", {}), /^Error: Unknown tool: no_such_tool$|Unknown tool: no_such_tool$/);
});

test("a draft that becomes a trip says what the departure list added", async () => {
  const { db, call } = await asUser("u-ann");
  db.house_tasks = [{ id: "h2", family_id: A, title: "Water the plants", only_when_empty: false, sort_order: 1 }];
  db.trips[0].status = "draft";
  const out = await call("update_trip", { trip: "Curacao spring", status: "planning" });
  assert.ok((out.next_steps || []).some((s) => /departure task/.test(s)), JSON.stringify(out));
});
