// The assistant write tools beyond the packing check-off: day pack and
// reminder ticks, and adding packing items, reminders and bucket-list places.
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
          return {
            select() {
              const saved = { id: `new-${(db[table] || []).length + 1}`, ...row };
              (db[table] ||= []).push(saved);
              calls.push({ op: "insert", table, row });
              return Promise.resolve({ data: [{ id: saved.id }], error: null });
            },
          };
        },
        update(patch) {
          const where = [];
          const u = {
            eq(k, v) { where.push([k, v]); return u; },
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

test("day pack: a parent ticks a child's line; the ambiguous name changes nothing", async () => {
  const { db, calls, call } = await asUser("u-ann");
  await assert.rejects(call("check_off_day_pack_item", { item: "Towel" }), /More than one[\s\S]*Towel \(Sam\); Towel \(Ann\)[\s\S]*Nothing was changed/);
  assert.equal(calls.length, 0);
  const kid = await call("check_off_day_pack_item", { item: "goggles" });
  assert.equal(kid.changed, true);
  assert.equal(row(db, "day_pack_items", "d3").is_packed, true);
  assert.equal(row(db, "day_pack_items", "d3").packed_by, "u-ann");
  const mine = await call("check_off_day_pack_item", { item: "Towel", traveler: "Ann" });
  assert.deepEqual(calls.at(-1).ids, ["d2"]);
  assert.equal(mine.for, "Ann");
  assert.equal(row(db, "day_pack_items", "db").is_packed, false, "the other household's towel");
  const again = await call("check_off_day_pack_item", { item: "Towel", traveler: "Ann" });
  assert.equal(again.changed, false);
  await call("check_off_day_pack_item", { item: "Towel", traveler: "Ann", packed: "no" });
  assert.equal(row(db, "day_pack_items", "d2").packed_at, null);
});

test("day pack: health lines are invisible, and a secondary reaches only their own and Shared", async () => {
  const ann = await asUser("u-ann");
  await assert.rejects(ann.call("check_off_day_pack_item", { item: "Inhaler" }), /No day pack line/);
  const sam = await asUser("u-sam");
  await assert.rejects(sam.call("check_off_day_pack_item", { item: "goggles" }), /No day pack line/);
  const towel = await sam.call("check_off_day_pack_item", { item: "Towel" });
  assert.deepEqual(sam.calls.at(-1).ids, ["d1"], "Sam's towel, today, not Ann's and not tomorrow's");
  assert.equal(towel.for, "Sam");
  await sam.call("check_off_day_pack_item", { item: "Sunscreen" });
  assert.deepEqual(sam.calls.at(-1).ids, ["d5"]);
  await sam.call("check_off_day_pack_item", { item: "Towel", date: "2027-03-11" });
  assert.deepEqual(sam.calls.at(-1).ids, ["d6"]);
  await assert.rejects(sam.call("check_off_day_pack_item", { item: "Towel", date: "March 11" }), /YYYY-MM-DD/);
});

test("reminders: marked done by name, health and child reminders out of reach", async () => {
  const { db, calls, call } = await asUser("u-ann");
  const done = await call("complete_reminder", { reminder: "boarding passes" });
  assert.equal(done.changed, true);
  assert.equal(row(db, "predeparture_tasks", "r1").is_done, true);
  assert.equal(row(db, "predeparture_tasks", "r1").done_by, "u-ann");
  assert.equal(row(db, "predeparture_tasks", "rb").is_done, false, "the other household's copy");
  await assert.rejects(call("complete_reminder", { reminder: "prescription" }), /No reminder/);
  await assert.rejects(call("complete_reminder", { reminder: "tablet" }), /No reminder/);
  await assert.rejects(call("complete_reminder", { reminder: "Check in online" }), /More than one/);
  await call("complete_reminder", { reminder: "Check in online", traveler: "Sam" });
  assert.deepEqual(calls.at(-1).ids, ["r5"]);
  await call("complete_reminder", { reminder: "boarding passes", done: "no" });
  assert.equal(row(db, "predeparture_tasks", "r1").done_at, null);
  await assert.rejects(call("complete_reminder", { reminder: "boarding passes", done: "maybe" }), /yes" or "no/);
});

test("reminders: a secondary ticks only their own, not Shared", async () => {
  const { calls, call } = await asUser("u-sam");
  await call("complete_reminder", { reminder: "Check in online" });
  assert.deepEqual(calls.at(-1).ids, ["r5"]);
  await assert.rejects(call("complete_reminder", { reminder: "Hold the mail" }), /No reminder/);
  await assert.rejects(call("complete_reminder", { reminder: "boarding passes" }), /No reminder/);
});

test("add packing item: for a child, for Shared, never twice, never health", async () => {
  const { db, calls, call } = await asUser("u-ann");
  const kid = await call("add_packing_item", { item: "Swim goggles", traveler: "kit", category: "Gear" });
  assert.equal(kid.changed, true);
  assert.deepEqual(calls.at(-1).row, { trip_id: "trip-a1", item: "Swim goggles", assignee: "Kit", quantity: null, category: "Gear", sort_order: 0, last_minute: false });
  const shared = await call("add_packing_item", { item: "Sunscreen", quantity: "2" });
  assert.equal(shared.for, "Shared");
  assert.equal(calls.at(-1).row.category, "General", "the column is NOT NULL");
  await call("add_packing_item", { item: "Snorkel", category: "gear" });
  assert.equal(calls.at(-1).row.sort_order, -1, "above the goggles under the same heading");
  const dup = await call("add_packing_item", { item: "hat", traveler: "Ann" });
  assert.equal(dup.changed, false);
  const stashedIsNew = await call("add_packing_item", { item: "Old towel", traveler: "Ann" });
  assert.equal(stashedIsNew.changed, true, "a stashed line is off the list");
  const before = calls.length;
  await assert.rejects(call("add_packing_item", { item: "Inhaler", traveler: "Ann" }), /Health items/);
  await assert.rejects(call("add_packing_item", { item: "Hat", traveler: "Bob" }), /not going on this trip/);
  assert.equal(calls.length, before);
  assert.ok(!db.packing_items.some((r) => r.trip_id === "trip-b1" && r.id.startsWith("new")));
});

test("adding is for primaries: a secondary is refused before anything is written", async () => {
  const { calls, call } = await asUser("u-sam");
  await assert.rejects(call("add_packing_item", { item: "Snorkel" }), /primary travelers/);
  await assert.rejects(call("add_reminder", { reminder: "Buy snorkel" }), /primary travelers/);
  await assert.rejects(call("add_bucket_list_place", { place: "Japan" }), /primary travelers/);
  assert.equal(calls.length, 0);
});

test("add reminder: due date, priority, duplicates and health", async () => {
  const { calls, call } = await asUser("u-ann");
  const added = await call("add_reminder", { reminder: "Buy reef shoes", due: "2027-03-08", traveler: "Kit", priority: "high" });
  assert.equal(added.changed, true);
  assert.deepEqual(calls.at(-1).row, { trip_id: "trip-a1", title: "Buy reef shoes", detail: null, assignee: "Kit", due_date: "2027-03-08", priority: "high" });
  const dup = await call("add_reminder", { reminder: "print boarding passes" });
  assert.equal(dup.changed, false);
  const n = calls.length;
  await assert.rejects(call("add_reminder", { reminder: "Call the doctor" }), /Health reminders/);
  await assert.rejects(call("add_reminder", { reminder: "Pack", due: "next week" }), /YYYY-MM-DD/);
  await assert.rejects(call("add_reminder", { reminder: "Pack", priority: "urgent" }), /priority/);
  assert.equal(calls.length, n);
});

test("add bucket-list place: this household only, months read, no duplicates", async () => {
  const { db, calls, call } = await asUser("u-ann");
  const added = await call("add_bucket_list_place", { place: "Kyoto", why: "Temples in autumn", months: "Oct, Nov", nights: "7" });
  assert.equal(added.changed, true, "Kyoto is on the other household's list, not this one");
  assert.deepEqual(calls.at(-1).row, { family_id: A, place: "Kyoto", why: "Temples in autumn", nights: 7, created_by: "u-ann", updated_by: "u-ann", months: [10, 11] });
  assert.equal((await call("add_bucket_list_place", { place: "iceland" })).changed, false);
  assert.equal((await call("add_bucket_list_place", { place: "Peru" })).changed, true, "a retired place can come back");
  await assert.rejects(call("add_bucket_list_place", { place: "Bali", months: "someday" }), /not months/);
  await assert.rejects(call("add_bucket_list_place", { place: "Bali", nights: "400" }), /nights/);
  assert.equal(db.someday_places.filter((p) => p.family_id === B).length, 1);
});
