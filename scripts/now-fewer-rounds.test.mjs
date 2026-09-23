import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { resolveAccess } = jiti("../lib/travelers/access.js");
const { loadNow, heroTasksFrom } = jiti("../lib/now/load.js");
const { loadMenu } = jiti("../lib/menu/load.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Every query waits the same fixed time, so reads that start together land in
// the same round and a read that waited for another lands a round later.
const LAG = 30;

function fakeDb(tables = {}) {
  const calls = [];
  const t0 = Date.now();
  const from = (table) => {
    const call = { table, filters: [], round: null };
    const builder = {
      select(cols, opts) { call.cols = cols; call.opts = opts; return builder; },
      eq(col, val) { call.filters.push(["eq", col, val]); return builder; },
      in(col, val) { call.filters.push(["in", col, val]); return builder; },
      is(col, val) { call.filters.push(["is", col, val]); return builder; },
      or(expr) { call.filters.push(["or", expr]); return builder; },
      lt(col, val) { call.filters.push(["lt", col, val]); return builder; },
      order() { return builder; },
      limit() { return builder; },
      update() { call.write = true; return builder; },
      maybeSingle() { call.single = true; return builder; },
      then(resolve, reject) {
        if (call.round === null) {
          call.round = Math.round((Date.now() - t0) / LAG);
          calls.push(call);
        }
        const source = tables[table];
        let rows = typeof source === "function" ? source(call) : source || [];
        for (const [op, col, val] of call.filters) {
          if (op === "eq") rows = rows.filter((r) => !(col in r) || r[col] === val);
          if (op === "in") rows = rows.filter((r) => !(col in r) || val.includes(r[col]));
        }
        const out = call.opts?.head
          ? { data: null, count: rows.length }
          : { data: call.single ? rows[0] || null : rows, error: null };
        return new Promise((ok) => setTimeout(() => ok(out), LAG)).then(resolve, reject);
      },
    };
    return builder;
  };
  const auth = {
    getUser: async () => { throw new Error("the sign-in server was asked"); },
  };
  return { from, auth, calls, rounds: () => new Set(calls.map((c) => c.round)).size };
}

const FAM = "fam-a";
const OTHER = "fam-b";
const user = { id: "u1", email: "mark@example.com" };
const today = "2026-09-22";

test("the access check is one round and picks the seat in the chosen household", async () => {
  const db = fakeDb({
    family_members: [{ family_id: FAM, user_id: "u1" }, { family_id: OTHER, user_id: "u1" }],
    travelers: [
      { id: "t-other", name: "Mark (club)", access_level: "secondary", is_person: true, family_id: OTHER, user_id: "u1" },
      { id: "t-home", name: "Mark", access_level: "primary", is_person: true, family_id: FAM, user_id: "u1" },
    ],
  });
  const access = await resolveAccess(db, user);
  assert.equal(db.rounds(), 1);
  assert.equal(access.familyId, FAM);
  assert.equal(access.travelerId, "t-home");
  assert.equal(access.level, "primary");
  assert.deepEqual(access.familyIds, [FAM, OTHER]);
});

test("a household member with no seat of their own is still primary, and no household is null", async () => {
  const seatless = await resolveAccess(
    fakeDb({ family_members: [{ family_id: FAM, user_id: "u1" }], travelers: [] }),
    user,
  );
  assert.equal(seatless.travelerId, null);
  assert.equal(seatless.level, "primary");
  assert.equal(await resolveAccess(fakeDb({ family_members: [] }), user), null);
  assert.equal(await resolveAccess(fakeDb(), null), null);
});

test("a secondary seat in the chosen household reads as secondary", async () => {
  const access = await resolveAccess(
    fakeDb({
      family_members: [{ family_id: FAM, user_id: "u1" }],
      travelers: [{ id: "t1", name: "Veda", access_level: "secondary", is_person: true, family_id: FAM, user_id: "u1" }],
    }),
    user,
  );
  assert.equal(access.level, "secondary");
  assert.equal(access.can.isSecondary, true);
});

const primary = {
  familyId: FAM,
  familyIds: [FAM],
  travelerId: "t-home",
  travelerName: "Mark",
  level: "primary",
  can: { isSecondary: false },
};

const soonTrip = {
  id: "trip-soon", name: "Disney", family_id: FAM, status: "booked",
  start_date: "2026-09-28", end_date: "2026-10-02",
};
const farTrip = {
  id: "trip-far", name: "Alaska", family_id: FAM, status: "booked",
  start_date: "2027-08-01", end_date: "2027-08-14",
};

function nowTables(trips) {
  return {
    predeparture_tasks: [
      { id: "k1", title: "Undated first in the list", due_date: null, trip_id: "trip-soon", is_done: false, trips: soonTrip },
      { id: "k2", title: "Due later", due_date: "2026-09-26", trip_id: "trip-soon", is_done: false, trips: soonTrip },
      { id: "k3", title: "Due sooner", due_date: "2026-09-24", trip_id: "trip-soon", is_done: false, trips: soonTrip },
      { id: "k4", title: "Alaska passport", due_date: "2027-05-01", trip_id: "trip-far", is_done: false, trips: farTrip },
    ],
    travelers: [{ id: "t-home", name: "Mark", is_person: true, family_id: FAM }],
    trips,
    trip_travelers: [{ trip_id: "trip-soon", traveler_id: "t-home" }, { trip_id: "trip-far", traveler_id: "t-home" }],
    reminder_runs: [],
    inbox_messages: [{ id: "m1", family_id: FAM, status: "pending" }],
    flight_deals: [],
    flight_deal_reads: [],
    packing_items: [{ trip_id: "trip-soon", is_packed: true }],
    itinerary_items: [],
    pets: [],
    trip_pets: [],
    someday_places: [],
    card_offers: [],
  };
}

test("the Now screen reads in two rounds after the access check", async () => {
  const db = fakeDb(nowTables([soonTrip, farTrip]));
  const out = await loadNow(db, { user, access: primary, today });
  assert.equal(db.rounds(), 2);
  // Nothing read twice: the open tasks feed both the list and the cards, and one
  // roster read covers both.
  const count = (table) => db.calls.filter((c) => c.table === table).length;
  assert.equal(count("predeparture_tasks"), 1);
  assert.equal(count("trip_travelers"), 1);
  assert.equal(count("itinerary_items"), 1);
  assert.equal(count("family_members"), 0);
  // A family leaving next week does not pay for a query about next spring.
  assert.equal(count("someday_places"), 0);
  assert.equal(count("card_offers"), 0);
  assert.equal(out.soon[0].trip.id, "trip-soon");
  assert.equal(out.waiting, 1);
  assert.deepEqual(out.heroTasks.map((t) => t.id), ["k3", "k2", "k1"]);
});

test("the long-range reads join the second round only at that range", async () => {
  const db = fakeDb(nowTables([farTrip]));
  const out = await loadNow(db, { user, access: primary, today });
  assert.equal(db.rounds(), 2);
  assert.ok(out.ahead);
  const second = db.calls.filter((c) => c.round === Math.max(...db.calls.map((x) => x.round)));
  for (const table of ["someday_places", "flight_deals", "card_offers"]) {
    assert.ok(second.some((c) => c.table === table), `${table} in the second round`);
  }
});

test("a secondary traveler's screen reads none of the household's queue", async () => {
  const secondary = { ...primary, travelerId: "t-veda", level: "secondary", can: { isSecondary: true } };
  const db = fakeDb({
    ...nowTables([soonTrip, farTrip]),
    trip_travelers: [{ trip_id: "trip-soon", traveler_id: "t-veda" }],
  });
  const out = await loadNow(db, { user, access: secondary, today });
  for (const table of ["reminder_runs", "inbox_messages", "flight_deals", "someday_places", "card_offers"]) {
    assert.ok(!db.calls.some((c) => c.table === table), `${table} not read`);
  }
  assert.deepEqual(out.visible.map((t) => t.id), ["trip-soon"]);
  assert.equal(out.waiting, 0);
  assert.deepEqual(out.fareRows, []);
  assert.deepEqual(out.runs, []);
});

test("hero tasks come dated and soonest first, then in list order", () => {
  const rows = [
    { id: "a", trip_id: "x", due_date: null },
    { id: "b", trip_id: "x", due_date: "2026-10-01" },
    { id: "c", trip_id: "y", due_date: "2026-09-01" },
    { id: "d", trip_id: "x", due_date: "2026-09-25" },
    { id: "e", trip_id: "x", due_date: "2026-09-25" },
    { id: "f", trip_id: "x", due_date: null },
  ];
  assert.deepEqual(heroTasksFrom(rows, ["x"]).map((t) => t.id), ["d", "e", "b", "a", "f"]);
  assert.deepEqual(heroTasksFrom(rows, []), []);
});

test("the menu reads in two rounds and never asks the sign-in server", async () => {
  const db = fakeDb({
    predeparture_tasks: [],
    // A trip with somebody on it, so the passport read has to follow the trips.
    trips: [{ ...farTrip, trip_travelers: [{ travelers: { id: "t-home", name: "Mark", is_person: true } }] }],
    traveler_documents: [],
    pro_tips: [],
    inbox_messages: [{ id: "m1", status: "pending" }],
    inbox_parsed_items: [],
    families: [{ id: FAM, setup_done_at: "2026-09-01" }],
    flight_deals: [],
    flight_deal_reads: [],
  });
  // Handed the access check still pending: the first round does not wait for it.
  const access = new Promise((ok) => setTimeout(() => ok(primary), LAG));
  const menu = await loadMenu(db, { who: user, access, today });
  assert.equal(db.rounds(), 2);
  assert.equal(menu.inboxCount, 1);
  assert.ok(db.calls.some((c) => c.table === "inbox_parsed_items"));
  assert.ok(db.calls.some((c) => c.table === "traveler_documents"));
  // The tips do not wait behind the trips.
  assert.equal(db.calls.find((c) => c.table === "pro_tips").round, 0);
});

test("the menu skips the parsed mail when nothing is waiting", async () => {
  const db = fakeDb({ inbox_messages: [], families: [{ id: FAM, setup_done_at: "x" }] });
  await loadMenu(db, { who: user, access: Promise.resolve(primary), today });
  assert.ok(!db.calls.some((c) => c.table === "inbox_parsed_items"));
});

test("the screen starts the menu early, and both share one access check", () => {
  const page = read("app/now/page.js");
  assert.match(page, /preloadMenu\(\)/);
  assert.match(page, /await loadNow\(/);
  assert.doesNotMatch(page, /from\("family_members"\)/);
  assert.doesNotMatch(page, /resolveAccess\(/);
  const bar = read("components/TopBar.js");
  assert.doesNotMatch(bar, /auth\.getUser/);
  assert.match(bar, /await requestMenu\(\)/);
  const shared = read("lib/request/shared.js");
  assert.match(shared, /import \{ cache \} from "react"/);
  for (const name of ["requestClient", "requestWho", "requestAccess", "requestUnreadFares", "requestMenu"]) {
    assert.match(shared, new RegExp(`export const ${name} = cache\\(`));
  }
});

test("the server runs in Portland, next to the database, and the crons stay", () => {
  const config = JSON.parse(read("vercel.json"));
  assert.deepEqual(config.regions, ["pdx1"]);
  assert.deepEqual(config.crons.map((c) => c.path), ["/api/tasks/remind", "/api/tasks/watch"]);
});
