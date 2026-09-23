import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { toolNamesForRequest } = jiti("../lib/agent/toolset.js");

// Fix 1: the tool list starts the same way whatever was asked on a screen.

test("the screen's tools come first, and the wording's are added after them", () => {
  const plain = toolNamesForRequest({ focus: "itinerary", message: "What is on tomorrow?" });
  const money = toolNamesForRequest({ focus: "itinerary", message: "What will dinner cost, and are we covered by insurance?" });
  assert.deepEqual(money.slice(0, plain.length), plain, "the plain set is a prefix of the widened one");
  const added = money.slice(plain.length);
  for (const name of ["add_trip_cost", "update_trip_cost", "add_policy", "update_policy", "attach_policy"]) {
    if (!plain.includes(name)) assert.ok(added.includes(name), `${name} added after the screen's set`);
  }
  assert.equal(new Set(money).size, money.length, "no tool listed twice");
});

test("a tool the screen already has is not moved by the wording", () => {
  const budget = toolNamesForRequest({ focus: "budget", message: "Hello" });
  const asked = toolNamesForRequest({ focus: "budget", message: "What does the budget look like?" });
  assert.ok(budget.includes("add_trip_cost"));
  assert.deepEqual(asked.slice(0, budget.length), budget);
});

// Fix 3: an empty answer to a plain question goes straight to the finishing turn.

const { retryWhenEmpty, asksForChange } = jiti("../lib/agent/asked.js");
import { readFileSync } from "node:fs";

test("a plain question that came back empty skips the retry", () => {
  for (const said of [
    "Where should we stay in Atlanta?",
    "Tell me more about The Joseph?",
    "How should I pay for the Lowe's?",
    "Is Nashville worth a stop on the way home",
  ]) {
    assert.equal(retryWhenEmpty({ said }), false, said);
  }
});

test("anything that may be asking for a change, an interview turn, or no question keeps it", () => {
  for (const said of [
    "Can you add dinner at 7 on Friday?",
    "Should we move the aquarium to Saturday?",
    "Could you book the Candler?",
    "Take the snorkel off the list and put the rain jacket on it?",
  ]) {
    assert.equal(asksForChange(said), true, said);
    assert.equal(retryWhenEmpty({ said }), true, said);
  }
  assert.equal(retryWhenEmpty({ said: "What do you like to do on vacation?", interviewing: true }), true);
  assert.equal(retryWhenEmpty({ said: "We land Friday at noon." }), true, "no question in it");
});

test("the route guards the retry on retryWhenEmpty, and the finishing turn still handles silence", () => {
  const src = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  const retry = src.indexOf('feature: "chat.retry"');
  const guard = src.lastIndexOf("if (", retry);
  assert.match(src.slice(guard, retry), /retryEmpty &&\s+answeredNothing\(result\)/);
  assert.match(src, /const retryEmpty = retryWhenEmpty\(\{ said, interviewing \}\);/);
  assert.match(src, /const needWords = silent \|\| owesReasons \|\| owesWords;/);
  assert.match(src, /Your last turn came back empty\./);
});

// Fix 4: a place whose last look kept nothing is not asked again until its brief changes.

const empty = jiti("../lib/tips/emptyLooks.js");

const baseBrief = () => ({
  scope: "item",
  today: "2026-09-22",
  trip: { name: "Disney Thanksgiving 2026", destination: "Orlando", start_date: "2026-11-21", end_date: "2026-11-28" },
  item: { id: "i1", title: "Be Our Guest dinner", category: "dining", item_date: "2026-11-23" },
  itinerary: [{ id: "i1", title: "Be Our Guest dinner", category: "dining", item_date: "2026-11-23" }],
  tasks: [],
  packing: [],
  travelers: [{ id: "t1", name: "Mark", is_person: true }],
  preferences: [],
  memberships: [],
  reviews: [],
  already: [],
});

test("the fingerprint ignores the date and nothing else", () => {
  const a = empty.lookKey(baseBrief());
  assert.equal(empty.lookKey({ ...baseBrief(), today: "2026-09-25" }), a, "a new day alone is the same brief");
  assert.notEqual(empty.lookKey({ ...baseBrief(), tasks: [{ title: "Book the dinner" }] }), a);
  assert.notEqual(
    empty.lookKey({ ...baseBrief(), item: { ...baseBrief().item, notes: "Veda's birthday" } }),
    a,
  );
  assert.notEqual(empty.lookKey({ ...baseBrief(), already: ["Arrive early"] }), a);
});

test("an unchanged empty place is skipped for a week, then asked again", () => {
  const key = empty.lookKey(baseBrief());
  const place = empty.lookPlace("item", "i1");
  assert.equal(place, "item:i1");
  const looks = { [place]: empty.emptyLookEntry({ kept: 0, key, today: "2026-09-22" }) };
  const skip = (today, extra = {}) =>
    empty.skipLook({ looks, place, key, today, tripStart: "2026-11-21", ...extra });
  assert.equal(skip("2026-09-22"), true);
  assert.equal(skip("2026-09-28"), true, "six days later");
  assert.equal(skip("2026-09-29"), false, "a week later it is asked again");
  assert.equal(skip("2026-09-21"), false, "a clock that went backwards asks");
  assert.equal(skip("2026-09-23", { key: "different" }), false, "a changed brief asks");
  assert.equal(skip("2026-09-23", { place: "item:i2" }), false, "another place asks");
  assert.equal(empty.skipLook({ looks: undefined, place, key, today: "2026-09-22" }), false, "no column yet: asks");
});

test("close to the trip, an empty answer stands for the same day only", () => {
  const key = "k";
  const place = "packing";
  const looks = { packing: { key, on: "2026-11-10" } };
  assert.equal(empty.skipLook({ looks, place, key, today: "2026-11-10", tripStart: "2026-11-21" }), true);
  assert.equal(empty.skipLook({ looks, place, key, today: "2026-11-11", tripStart: "2026-11-21" }), false);
});

test("a look that kept something clears the place instead of remembering it", () => {
  assert.equal(empty.emptyLookEntry({ kept: 2, key: "k", today: "2026-09-22" }), null);
  assert.deepEqual(empty.emptyLookEntry({ kept: 0, key: "k", today: "2026-09-22" }), { key: "k", on: "2026-09-22" });
});

test("the route skips the model on an unchanged empty place and notes new empty answers", () => {
  const src = readFileSync(new URL("../app/api/tips/refresh/route.js", import.meta.url), "utf8");
  assert.match(src, /produced = skipped\s+\?\s+\{ tips: \[\], dropped: \[\], model: null, searched: false, skipped: true \}\s+: await tipsForPlace\(/);
  assert.match(src, /const key = lookKey\(brief\);/);
  assert.match(src, /\.\.\.brief,\n\s+\}\);/, "the model is sent the same brief that was fingerprinted");
  assert.match(src, /supabase\.rpc\("note_empty_look", \{\s+p_trip_id: tripId,\s+p_place: place,\s+p_value: entry,/);
  const sql = readFileSync(new URL("../supabase/migrations/20261016_tip_empty_looks.sql", import.meta.url), "utf8");
  assert.match(sql, /security invoker/);
  assert.match(sql, /where trip_id = p_trip_id/);
  assert.doesNotMatch(sql, /security definer/);
});

test("note_empty_look adds and removes one place without touching the others", async (t) => {
  const mod = process.env.PGLITE_MODULE;
  if (!mod) return t.skip("PGLITE_MODULE not set");
  const { PGlite } = await import(mod);
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table public.trip_facts (trip_id uuid primary key, family_id uuid);
    insert into public.trip_facts values ('00000000-0000-0000-0000-000000000001', null);
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261016_tip_empty_looks.sql", import.meta.url), "utf8"));
  const trip = "00000000-0000-0000-0000-000000000001";
  const note = (place, value) =>
    db.query("select public.note_empty_look($1, $2, $3::jsonb)", [trip, place, value == null ? null : JSON.stringify(value)]);
  await note("trip", { key: "a", on: "2026-09-22" });
  await note("item:i1", { key: "b", on: "2026-09-22" });
  let { rows } = await db.query("select empty_looks from public.trip_facts");
  assert.deepEqual(rows[0].empty_looks, { trip: { key: "a", on: "2026-09-22" }, "item:i1": { key: "b", on: "2026-09-22" } });
  await note("trip", null);
  ({ rows } = await db.query("select empty_looks from public.trip_facts"));
  assert.deepEqual(rows[0].empty_looks, { "item:i1": { key: "b", on: "2026-09-22" } });
  await db.close();
});
