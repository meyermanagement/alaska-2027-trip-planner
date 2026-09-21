import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const {
  AHEAD_DAYS,
  AHEAD_MAX,
  aheadDates,
  countdownSaid,
  nextAhead,
  seasonAhead,
} = jiti("../lib/now/ahead.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const today = "2026-09-21";
const trip = (over = {}) => ({
  id: "one",
  name: "Alaska",
  status: "planning",
  start_date: "2026-11-24",
  end_date: "2026-12-01",
  ...over,
});

test("the trip weeks out is the one the screen leads with", () => {
  const found = nextAhead([trip()], today);
  assert.equal(found.trip.id, "one");
  assert.equal(found.days, 64);
});

test("the nearest of several is chosen", () => {
  const found = nextAhead(
    [trip(), trip({ id: "two", start_date: "2026-10-30" })],
    today,
  );
  assert.equal(found.trip.id, "two");
});

test("a trip inside the near window hands the screen back", () => {
  assert.equal(
    nextAhead([trip(), trip({ id: "soon", start_date: "2026-09-28" })], today),
    null,
  );
});

test("a trip being lived hands the screen back", () => {
  assert.equal(
    nextAhead(
      [
        trip(),
        trip({ id: "now", start_date: "2026-09-19", end_date: "2026-09-24" }),
      ],
      today,
    ),
    null,
  );
});

test("drafts, archives, cancellations and past trips are left out", () => {
  assert.equal(nextAhead([trip({ status: "draft" })], today), null);
  assert.equal(nextAhead([trip({ status: "archived" })], today), null);
  assert.equal(nextAhead([trip({ archived_at: "2026-09-01" })], today), null);
  assert.equal(nextAhead([trip({ status: "cancelled" })], today), null);
  assert.equal(
    nextAhead(
      [trip({ start_date: "2026-08-01", end_date: "2026-08-08" })],
      today,
    ),
    null,
  );
});

test("an undated trip cannot be counted down to", () => {
  assert.equal(nextAhead([trip({ start_date: null })], today), null);
});

test("the countdown is said the way a family says it", () => {
  assert.equal(countdownSaid(0), "Today");
  assert.equal(countdownSaid(1), "Tomorrow");
  assert.equal(countdownSaid(9), "In 9 days");
  assert.equal(countdownSaid(64), "In 64 days · about 9 weeks");
  assert.equal(countdownSaid(null), "");
});

test("dates land in order, soonest first", () => {
  const rows = aheadDates(
    [
      { id: "b", on: "2026-10-04", title: "Cruise balance" },
      { id: "a", on: "2026-09-30", title: "Book by" },
    ],
    today,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b"],
  );
  assert.equal(rows[0].days, 9);
});

test("a band about dates carries nothing undated, past or out of range", () => {
  const rows = aheadDates(
    [
      { id: "no-date", title: "Someday" },
      { id: "gone", on: "2026-09-01", title: "Already went" },
      { id: "far", on: "2027-03-01", title: "Next spring" },
      { id: "keep", on: "2026-10-01", title: "Deposit" },
    ],
    today,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["keep"],
  );
});

test("today is close enough to print", () => {
  const rows = aheadDates([{ id: "x", on: today, title: "Pay it" }], today);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].days, 0);
});

test("the same row twice is one line", () => {
  const rows = aheadDates(
    [
      { id: "x", on: "2026-10-01", title: "Deposit" },
      { id: "x", on: "2026-10-01", title: "Deposit" },
    ],
    today,
  );
  assert.equal(rows.length, 1);
});

test("the band stops being a list", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `row-${i}`,
    on: `2026-10-${String(i + 1).padStart(2, "0")}`,
    title: `Thing ${i}`,
  }));
  assert.equal(aheadDates(many, today).length, AHEAD_MAX);
});

test("the horizon is two months", () => {
  assert.equal(AHEAD_DAYS, 60);
  assert.equal(aheadDates([{ id: "edge", on: "2026-11-20", title: "Edge" }], today).length, 1);
  assert.equal(aheadDates([{ id: "past", on: "2026-11-21", title: "Past" }], today).length, 0);
});

const place = (over = {}) => ({
  id: "p1",
  place: "Yellowstone",
  months: [9, 10],
  status: "open",
  ...over,
});

test("the season that comes round soonest is first", () => {
  const found = seasonAhead(
    [place(), place({ id: "p2", place: "Iceland", months: [2] })],
    today,
  );
  assert.equal(found[0].place.id, "p1");
  assert.equal(found[0].monthName, "September");
  assert.equal(found[0].inMonths, 0);
  assert.equal(found[1].place.id, "p2");
});

test("a place with no months said is not given one", () => {
  assert.deepEqual(seasonAhead([place({ months: [] })], today), []);
  assert.deepEqual(seasonAhead([place({ months: null })], today), []);
});

test("any month is not a season", () => {
  assert.deepEqual(
    seasonAhead([place({ months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })], today),
    [],
  );
});

test("places already done or dropped are left out", () => {
  assert.deepEqual(seasonAhead([place({ status: "done" })], today), []);
  assert.deepEqual(seasonAhead([place({ status: "dropped" })], today), []);
});

test("a season past the horizon is not mentioned", () => {
  assert.deepEqual(seasonAhead([place({ months: [5] })], today), []);
});

test("the season wraps the year end", () => {
  const found = seasonAhead([place({ months: [1] })], today);
  assert.equal(found[0].month, 1);
  assert.equal(found[0].inMonths, 4);
});

test("the far screen leaves out what it cannot honestly say", () => {
  const src = read("app/now/NowAhead.js");
  assert.ok(!src.includes("card.packing"));
  assert.ok(!src.includes("card.plan"));
  assert.ok(!src.includes("packingHref"));
  assert.ok(src.includes("Dates that will not wait"));
  assert.ok(src.includes("Open the trip"));
});

test("the empty screen asks for a week, not a destination", () => {
  const src = read("app/now/NowEmpty.js");
  assert.ok(src.includes("a week you could get away"));
  assert.ok(src.includes("/trips/new"));
  assert.ok(src.includes("/someday"));
});

test("the page shows each long-range state only at its own range", () => {
  const src = read("app/now/page.js");
  assert.ok(src.includes("nextAhead(visible, today)"));
  assert.ok(src.includes("const emptyHanded = !current.length && !soon.length && !ahead"));
  assert.ok(src.includes("{ahead && ("));
  assert.ok(src.includes("{emptyHanded && ("));
});
