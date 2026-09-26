// The planning tools: itinerary items, trips, the Wallet, packing templates,
// and putting a packing-list line in a day pack.
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
    house_tasks: [],
    minors: new Set(),
  };
}

// supabase-js reads plus the two writes these tools make, recorded in calls.
function fakeAdmin(db, calls = []) {
  return {
    rpc: async (fn, args) => ({ data: fn === "account_is_minor" ? db.minors.has(args.account_id) : null, error: fn === "account_is_minor" ? null : { message: "no" } }),
    from(table) {
      let rows = [...(db[table] || [])];
      let cols = null;
      const q = {
        select(c) { cols = c.split(",").map((s) => s.trim()); return q; },
        eq(k, v) { rows = rows.filter((r) => r[k] === v); return q; },
        in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return q; },
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
              const p = Promise.resolve({ data: ids.map((id) => ({ id })), error: null });
              p.single = () => Promise.resolve({ data: { id: ids[0], slug: row.slug, public_id: "pub" }, error: null });
              return p;
            },
            then(ok, bad) { save(); return Promise.resolve({ data: null, error: null }).then(ok, bad); },
          };
        },
        update(patch) {
          const where = [];
          const u = {
            eq(k, v) { where.push([k, v]); return u; },
            then(ok, bad) { return u.select().then(() => ({ error: null })).then(ok, bad); },
            select() {
              const hit = (db[table] || []).filter((r) => where.every(([k, v]) => r[k] === v));
              for (const r of hit) Object.assign(r, patch);
              calls.push({ op: "update", table, ids: hit.map((r) => r.id), patch });
              return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            },
          };
          return u;
        },
        delete() { throw new Error("delete attempted"); },
        upsert() { throw new Error("upsert attempted"); },
        maybeSingle() { return Promise.resolve({ data: pick(rows)[0] || null, error: null }); },
        then(ok, bad) { return Promise.resolve({ data: pick(rows), error: null }).then(ok, bad); },
      };
      const pick = (rs) => (cols ? rs.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : rs);
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

test("itinerary: add one, refuse a duplicate, health and a bad span, and a secondary", async () => {
  const { db, calls, call } = await asUser("u-ann");
  const out = await call("add_itinerary_item", { title: "Flight home", date: "2027-03-15", time: "7:05", category: "flight" });
  assert.equal(out.changed, true);
  const saved = inserts(calls, "itinerary_items")[0].row;
  assert.equal(saved.trip_id, "trip-a1");
  assert.equal(saved.start_time, "07:05");
  assert.equal(saved.status, "planned");
  assert.equal(saved.created_by, "u-ann");
  const dupe = await call("add_itinerary_item", { title: "dinner at kome", date: "2027-03-10" });
  assert.equal(dupe.changed, false);
  await assert.rejects(call("add_itinerary_item", { title: "Physical therapy", date: "2027-03-12" }), /health/);
  await assert.rejects(call("add_itinerary_item", { title: "Beach", date: "2027-03-12", end_date: "2027-03-13" }), /lodging or cruise/);
  await assert.rejects(call("add_itinerary_item", { title: "Villa", date: "2027-03-12", end_date: "2027-03-12", category: "lodging" }), /after date/);
  await assert.rejects(call("add_itinerary_item", { title: "Beach", date: "2027-03-12", time: "25:00" }), /HH:MM/);
  assert.equal(db.itinerary_items.filter((i) => i.trip_id === "trip-b1").length, 1, "the other household untouched");
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("add_itinerary_item", { title: "Beach", date: "2027-03-12" }), /primary/);
  assert.equal(sam.calls.length, 0);
});

test("itinerary: update by title, ambiguity lists both, cancel is a status, hidden fields stay", async () => {
  const { db, calls, call } = await asUser("u-ann");
  await assert.rejects(call("update_itinerary_item", { item: "Snorkel tour", time: "09:00" }), /More than one[\s\S]*2027-03-11[\s\S]*2027-03-13[\s\S]*Nothing was changed/);
  assert.equal(calls.length, 0);
  const moved = await call("update_itinerary_item", { item: "Snorkel tour", on: "2027-03-13", time: "09:00", status: "confirmed" });
  assert.deepEqual(calls.at(-1).ids, ["33333333-3333-4333-8333-333333333333"]);
  assert.equal(moved.item.time, "09:00");
  const kome = await call("update_itinerary_item", { item: "Kome", status: "cancelled" });
  noSecrets(kome);
  const k = db.itinerary_items.find((i) => i.id.startsWith("1111"));
  assert.equal(k.status, "cancelled");
  assert.equal(k.notes, "SECRET-NOTE");
  assert.equal(k.confirmation_number, "CONF-123");
  assert.equal(db.itinerary_items.find((i) => i.id.startsWith("5555")).status, "planned", "other household's Kome");
  await assert.rejects(call("update_itinerary_item", { item: "Hotel Kura", date: "2027-03-16" }), /end_date has to be after date/);
  await assert.rejects(call("update_itinerary_item", { item: "Kome" }), /Say what to change/);
  const same = await call("update_itinerary_item", { item: "Kome", status: "cancelled" });
  assert.equal(same.changed, false);
  assert.ok(!calls.some((c) => c.op === "delete"));
});

test("trips: create with a roster, refuse a duplicate name, update dates within reason", async () => {
  const { db, calls, call } = await asUser("u-ann");
  const made = await call("create_trip", { name: "Iceland 2028", start_date: "2028-06-01", end_date: "2028-06-10", travelers: "Ann, Kit", budget: "$8,000" });
  assert.equal(made.changed, true);
  const trip = inserts(calls, "trips")[0].row;
  assert.equal(trip.family_id, "fam-a");
  assert.equal(trip.status, "planning");
  assert.equal(trip.budget_target, 8000);
  assert.equal(trip.travelers, undefined, "not a column");
  const roster = inserts(calls, "trip_travelers")[0].row.map((r) => r.traveler_id).sort();
  assert.deepEqual(roster, ["ta1", "ta3"]);
  assert.match(made.summary, /packing list in the app/);
  await assert.rejects(call("create_trip", { name: "curacao spring" }), /already a trip/);
  await assert.rejects(call("create_trip", { name: "X", travelers: "Bob" }), /not in this household/);
  await assert.rejects(call("create_trip", { name: "X", start_date: "2028-06-10", end_date: "2028-06-01" }), /end before/);
  const upd = await call("update_trip", { trip: "Curacao spring", end_date: "2027-03-16", budget: "5000" });
  assert.equal(upd.changed, true);
  assert.equal(db.trips.find((t) => t.id === "trip-a1").end_date, "2027-03-16");
  assert.equal(db.trips.find((t) => t.id === "trip-b1").end_date, "2027-03-12", "other household's trip");
  await assert.rejects(call("update_trip", { trip: "Curacao spring", end_date: "2027-03-01" }), /before it starts/);
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("create_trip", { name: "Solo" }), /primary/);
  await assert.rejects(sam.call("update_trip", { trip: "Curacao spring", name: "Mine" }), /primary/);
  assert.equal(sam.calls.length, 0);
});

test("wallet: add for an adult, refuse a child, a duplicate and a member number", async () => {
  const { calls, call } = await asUser("u-ann");
  const out = await call("add_rewards_program", { brand: "Chase", program_name: "Sapphire Preferred", kind: "credit_card", whose: "Ann", balance: "60000", annual_fee: "95" });
  assert.equal(out.changed, true);
  const row = inserts(calls, "rewards_programs")[0].row;
  assert.equal(row.traveler_id, "ta1");
  assert.equal(row.points_checked_on, "2027-03-10");
  assert.equal(row.family_id, "fam-a");
  await assert.rejects(call("add_rewards_program", { brand: "Disney", kind: "other", whose: "Kit" }), /not in this household/);
  const dupe = await call("add_rewards_program", { brand: "alaska airlines", kind: "airline", whose: "Ann" });
  assert.equal(dupe.changed, false);
  await assert.rejects(call("add_rewards_program", { brand: "Delta", program_name: "SkyMiles 9012345678", kind: "airline" }), /Member and card numbers/);
  const shared = await call("add_rewards_program", { brand: "Hertz", kind: "car" });
  assert.equal(shared.program.whose, "Shared");
});

test("wallet: update a balance by name and whose; a child's and an inactive program are out of reach", async () => {
  const { db, calls, call } = await asUser("u-ann");
  await assert.rejects(call("update_rewards_program", { program: "Alaska Airlines", balance: "2000" }), /More than one[\s\S]*\(Ann\)[\s\S]*\(Sam\)/);
  const out = await call("update_rewards_program", { program: "Mileage Plan", whose: "Ann", balance: "2,000" });
  noSecrets(out);
  assert.deepEqual(calls.at(-1).ids, ["w1"]);
  assert.equal(db.rewards_programs.find((p) => p.id === "w1").points_balance, 2000);
  assert.equal(db.rewards_programs.find((p) => p.id === "w1").member_number, "MEMBER-999");
  assert.equal(db.rewards_programs.find((p) => p.id === "wb").points_balance, 5, "other household's Ann");
  await assert.rejects(call("update_rewards_program", { program: "Hilton", balance: "9" }), /No program/);
  await assert.rejects(call("update_rewards_program", { program: "Marriott", balance: "9" }), /No program/);
  await assert.rejects(call("update_rewards_program", { program: "Mileage Plan", whose: "Ann", balance: "1.5" }), /whole number/);
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("update_rewards_program", { program: "Mileage Plan", balance: "1" }), /primary/);
});

test("templates: base list by default, a named list, ambiguity, a duplicate, health", async () => {
  const { calls, call } = await asUser("u-ann");
  const out = await call("add_template_item", { item: "Phone charger", traveler: "Kit" });
  const row = inserts(calls, "packing_template_items")[0].row;
  assert.equal(row.template_id, "tp1");
  assert.equal(row.assignee, "Kit");
  assert.equal(row.category, "General");
  assert.match(out.summary, /existing trips are unchanged/);
  await assert.rejects(call("add_template_item", { item: "Towel", list: "Bea" }), /More than one[\s\S]*Beach; Beach weekend/);
  await call("add_template_item", { item: "Towel", list: "Beach" });
  assert.equal(calls.at(-1).row.template_id, "tp2");
  const dupe = await call("add_template_item", { item: "passport", traveler: "Ann" });
  assert.equal(dupe.changed, false);
  await assert.rejects(call("add_template_item", { item: "Insulin pens" }), /health/);
  await assert.rejects(call("add_template_item", { item: "Hat", list: "Ski" }), /No packing template/);
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("add_template_item", { item: "Hat" }), /primary/);
});

test("day pack from the packing list: links the line, a child's for a parent, not health, not twice", async () => {
  const { calls, call } = await asUser("u-ann");
  const out = await call("add_day_pack_item", { item: "binoculars", date: "2027-03-12", why: "For the flamingos" });
  assert.equal(out.changed, true);
  const row = inserts(calls, "day_pack_items")[0].row;
  assert.equal(row.from_packing_id, "p3");
  assert.equal(row.item, "Binoculars");
  assert.equal(row.assignee, "Shared");
  const kid = await call("add_day_pack_item", { item: "Snorkel", date: "2027-03-11" });
  assert.equal(kid.for, "Kit");
  await assert.rejects(call("add_day_pack_item", { item: "Rain shell", date: "2027-03-11" }), /More than one[\s\S]*Nothing was changed/);
  await call("add_day_pack_item", { item: "Rain shells", traveler: "Sam" });
  assert.equal(calls.at(-1).row.from_packing_id, "p6");
  assert.equal(calls.at(-1).row.item_date, null, "every day");
  await assert.rejects(call("add_day_pack_item", { item: "EpiPen", date: "2027-03-11" }), /No packing-list line/);
  await assert.rejects(call("add_day_pack_item", { item: "Old towel", date: "2027-03-11" }), /No packing-list line/);
  await assert.rejects(call("add_day_pack_item", { item: "Kayak", date: "2027-03-11" }), /add_packing_item first/);
  await assert.rejects(call("add_day_pack_item", { item: "Binoculars", date: "2027-04-01" }), /not a day of/);
  const dupe = await call("add_day_pack_item", { item: "Binoculars", date: "2027-03-12" });
  assert.equal(dupe.changed, false);
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("add_day_pack_item", { item: "Rain shell", date: "2027-03-11" }), /primary/);
});
