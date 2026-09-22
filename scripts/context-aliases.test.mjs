// The record Aly reads prints ids as short handles and prints trips that are
// not open as counts. These check that the handles go out and come back
// whole, that a collision lengthens rather than confuses, and that the
// trimming keeps the rows the question needs while dropping the rest.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, {
  alias: { "@": root },
  moduleCache: false,
});
const { buildContext, buildSystemPrompt, shortenIds, expandAliases } =
  await jiti.import("../lib/agent/context.js");

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const id = (n, prefix = "12345678") =>
  `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("shortenIds: one handle per uuid, the same everywhere, and back again", () => {
  const a = id(1, "aaaaaaaa");
  const b = id(2, "bbbbbbbb");
  const { texts, byAlias } = shortenIds([
    `- id=${a} | x\n- id=${b} | y\n- id=${a} | again`,
    `TODAY: 2026-09-22 (${b})`,
  ]);
  assert.equal(texts[0].match(UUID), null, "no full uuid left in the record");
  assert.equal(texts[1].match(UUID), null, "none left in the tail either");
  assert.match(texts[0], /id=aaaaaaaa \| x/);
  assert.match(texts[0], /id=aaaaaaaa \| again/);
  assert.match(texts[1], /\(bbbbbbbb\)/);
  assert.equal(byAlias.get("aaaaaaaa"), a);
  assert.equal(byAlias.get("bbbbbbbb"), b);
  assert.equal(byAlias.size, 2);
});

test("shortenIds: two ids sharing the first eight characters get longer handles", () => {
  const a = `deadbeef-1111-4000-8000-000000000001`;
  const b = `deadbeef-2222-4000-8000-000000000002`;
  const { texts, byAlias } = shortenIds([`${a}\n${b}`]);
  assert.equal(byAlias.get("deadbeef"), undefined, "the ambiguous handle is not handed out");
  assert.equal(byAlias.get("deadbeef-1111"), a);
  assert.equal(byAlias.get("deadbeef-2222"), b);
  assert.equal(texts[0], "deadbeef-1111\ndeadbeef-2222");
});

test("expandAliases: handles in nested args become uuids; everything else is left alone", () => {
  const a = id(1, "aaaaaaaa");
  const b = id(2, "bbbbbbbb");
  const byAlias = new Map([
    ["aaaaaaaa", a],
    ["bbbbbbbb", b],
  ]);
  const args = {
    trip_id: "aaaaaaaa",
    item_id: "BBBBBBBB",
    title: "Dinner at aaaaaaaa's",
    already: a,
    rows: [{ id: "bbbbbbbb", note: "keep" }, "aaaaaaaa", 3, null],
  };
  assert.deepEqual(expandAliases(args, byAlias), {
    trip_id: a,
    item_id: b,
    title: "Dinner at aaaaaaaa's",
    already: a,
    rows: [{ id: b, note: "keep" }, a, 3, null],
  });
  assert.equal(expandAliases("plain", new Map()), "plain");
  assert.equal(expandAliases(undefined, byAlias), undefined);
});

function household() {
  const trips = [
    { id: id(1, "a1a1a1a1"), name: "Alaska 2027", status: "planning", start_date: "2027-08-01", end_date: "2027-08-14" },
    { id: id(2, "b2b2b2b2"), name: "Disney Thanksgiving 2026", status: "planning", start_date: "2026-11-22", end_date: "2026-11-28" },
    { id: id(3, "c3c3c3c3"), name: "Curaçao 2027", status: "draft", start_date: "2027-03-14", end_date: "2027-03-21" },
    { id: id(4, "d4d4d4d4"), name: "Maui 2024", status: "complete", start_date: "2024-06-01", end_date: "2024-06-10" },
  ];
  const packing = [];
  const itinerary = [];
  for (const [n, t] of trips.entries()) {
    for (let k = 0; k < 4; k++) {
      packing.push({
        id: id(100 + n * 10 + k, `e${n}${k}e${n}${k}e${n}`),
        trip_id: t.id,
        item: `${t.name} item ${k}`,
        category: k % 2 ? "Clothes" : "Documents",
        assignee: "Shared",
        is_packed: k === 0,
      });
    }
    itinerary.push({
      id: id(200 + n, `f${n}f${n}f${n}f${n}`),
      trip_id: t.id,
      item_date: t.start_date,
      title: `${t.name} arrival`,
      category: "transport",
      status: "confirmed",
    });
  }
  return { trips, packing, itinerary };
}

test("buildContext: the open trip in full, the others as counts, every id short and every row known", () => {
  const { trips, packing, itinerary } = household();
  const ctx = buildContext({
    trips,
    packing,
    itinerary,
    focusTripId: trips[0].id,
    focus: "overview",
    message: "How is the plan looking?",
    userName: "Mark",
  });
  assert.equal(ctx.text.match(UUID), null, "no full uuid in the record");
  assert.equal((ctx.tail || "").match(UUID), null, "no full uuid in the tail");
  assert.match(ctx.tail, /^TODAY: \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(ctx.text, /^TODAY:/m, "the date left the record");
  // The open trip prints its packing rows.
  assert.match(ctx.text, /Alaska 2027 item 1/);
  // The other planned trip prints packing as counts and no rows.
  assert.doesNotMatch(ctx.text, /Disney Thanksgiving 2026 item 1/);
  assert.match(ctx.text, /PACKING \(4 items, 1 packed; by category, packed\/total\): (Documents 1\/2, Clothes 0\/2|Clothes 0\/2, Documents 1\/2)/);
  // Its itinerary still prints in full.
  assert.match(ctx.text, /Disney Thanksgiving 2026 arrival/);
  // The draft and the finished trip are a header and a count line.
  assert.match(ctx.text, /CURAÇAO 2027 \[trip id: c3c3c3c3\] — a draft =====\n1 itinerary item, 0 tasks \(0 done\), 4 packing items\./);
  assert.match(ctx.text, /MAUI 2024 \[trip id: d4d4d4d4\] — already happened =====\n1 itinerary item/);
  assert.doesNotMatch(ctx.text, /Curaçao 2027 arrival/);
  assert.doesNotMatch(ctx.text, /Maui 2024 arrival/);
  // Every row still resolves, printed or not.
  for (const p of packing) assert.equal(ctx.known.packing_items.has(p.id), true, p.item);
  for (const i of itinerary) assert.equal(ctx.known.itinerary_items.has(i.id), true, i.title);
  for (const t of trips) assert.equal(ctx.known.alias.get(t.id.slice(0, 8)), t.id);
  // The system prompt ends with the changing part, after the record.
  const prompt = buildSystemPrompt(ctx.text, "overview", ctx.focusTripName, {
    tail: ctx.tail,
    here: null,
    people: ["Mark"],
  });
  const record = prompt.lastIndexOf("THE FAMILY'S TRIPS:\n");
  const now = prompt.lastIndexOf("\nRIGHT NOW:\n");
  assert.ok(record > 0 && now > record, "RIGHT NOW comes after the record");
  assert.ok(prompt.lastIndexOf("TODAY:") > now, "the date is in the RIGHT NOW block");
  assert.ok(prompt.indexOf("the Itinerary") < record || prompt.indexOf("Overview") < record, "focus sections stay above the record");
});

test("buildContext: naming a trip, or asking about packing, brings its rows back", () => {
  const { trips, packing, itinerary } = household();
  const named = buildContext({
    trips,
    packing,
    itinerary,
    focusTripId: trips[0].id,
    focus: "overview",
    message: "What did we do on the Maui trip, and is Curaçao still an idea?",
  });
  assert.match(named.text, /Maui 2024 arrival/);
  assert.match(named.text, /Curaçao 2027 arrival/);
  assert.doesNotMatch(named.text, /Disney Thanksgiving 2026 item 1/, "unnamed trip's packing stays as counts");

  const packingAsk = buildContext({
    trips,
    packing,
    itinerary,
    focusTripId: trips[0].id,
    focus: "overview",
    message: "What is still to pack across our trips?",
  });
  assert.match(packingAsk.text, /Disney Thanksgiving 2026 item 1/);

  const packingScreen = buildContext({
    trips,
    packing,
    itinerary,
    focusTripId: trips[0].id,
    focus: "packing",
    message: "Anything missing?",
  });
  assert.match(packingScreen.text, /Disney Thanksgiving 2026 item 1/);
});
