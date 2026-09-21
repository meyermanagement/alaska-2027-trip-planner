import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const {
  SOON_DAYS,
  OPEN_WITHIN_DAYS,
  daysBetween,
  homeTrips,
  opensByDefault,
  greetingFor,
  departureSaid,
  todaysPlan,
  progressOf,
} = jiti("../lib/now/home.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trip = (over = {}) => ({
  id: "one",
  name: "Alaska",
  status: "planning",
  start_date: "2026-09-25",
  end_date: "2026-09-30",
  ...over,
});

test("days between dates counts by the calendar across DST and year ends", () => {
  assert.equal(daysBetween("2026-09-21", "2026-09-21"), 0);
  assert.equal(daysBetween("2026-09-21", "2026-09-22"), 1);
  assert.equal(daysBetween("2026-09-22", "2026-09-21"), -1);
  // Spring forward and fall back: 24-hour arithmetic gets these wrong.
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  for (const bad of [null, undefined, "", "not a date"])
    assert.equal(daysBetween(bad, "2026-09-21"), null);
  assert.equal(daysBetween("2026-09-21", "nonsense"), null);
});

test("current trips lead, departures inside two weeks follow, soonest first", () => {
  const today = "2026-09-21";
  const rows = [
    trip({ id: "far", start_date: "2026-11-01", end_date: "2026-11-05" }),
    trip({ id: "edge", start_date: "2026-10-05", end_date: "2026-10-07" }),
    trip({ id: "soon", start_date: "2026-09-23", end_date: "2026-09-24" }),
    trip({ id: "living", start_date: "2026-09-19", end_date: "2026-09-24" }),
  ];
  const before = structuredClone(rows);
  const { current, soon } = homeTrips(rows, today);
  assert.deepEqual(
    current.map((one) => one.id),
    ["living"],
  );
  // 14 days out is in; 14 days and one more is not.
  assert.deepEqual(
    soon.map((one) => [one.trip.id, one.days]),
    [
      ["soon", 2],
      ["edge", 14],
    ],
  );
  assert.equal(SOON_DAYS, 14);
  assert.deepEqual(rows, before, "the caller's array is never reordered");
});

test("drafts, cancelled, archived, past and undated trips never lead the screen", () => {
  const today = "2026-09-21";
  const soonish = { start_date: "2026-09-23", end_date: "2026-09-24" };
  for (const over of [
    { status: "draft" },
    { status: "cancelled" },
    { status: "canceled" },
    { archived_at: "2026-09-01" },
  ]) {
    const { current, soon } = homeTrips([trip({ ...soonish, ...over })], today);
    assert.deepEqual([...current, ...soon], [], JSON.stringify(over));
  }
  // Over, leaving today, and with no dates at all: none of them is a departure
  // still ahead of us.
  for (const over of [
    { start_date: "2026-09-01", end_date: "2026-09-05" },
    { start_date: null, end_date: null },
  ]) {
    const { soon } = homeTrips([trip(over)], today);
    assert.deepEqual(soon, []);
  }
  assert.deepEqual(homeTrips([null, undefined], today), { current: [], soon: [] });
  assert.deepEqual(homeTrips(), { current: [], soon: [] });
});

test("a trip leaving within two days is opened for you, and the rest stay shut", () => {
  assert.equal(OPEN_WITHIN_DAYS, 2);
  for (const days of [0, 1, 2]) assert.equal(opensByDefault(days), true);
  for (const days of [3, 14, null, undefined, "2"])
    assert.equal(opensByDefault(days), false);
});

test("the greeting follows the clock and never says good night", () => {
  for (const [hour, said] of [
    [0, "Good morning"],
    [8, "Good morning"],
    [11, "Good morning"],
    [12, "Good afternoon"],
    [16, "Good afternoon"],
    [17, "Good evening"],
    [23, "Good evening"],
  ])
    assert.equal(greetingFor(hour), said);
  for (const bad of [null, undefined, NaN, "morning"])
    assert.equal(greetingFor(bad), "Hello");
});

test("a departure is said in sleeps", () => {
  assert.equal(departureSaid(0), "Leaves today");
  assert.equal(departureSaid(-2), "Leaves today");
  assert.equal(departureSaid(1), "Leaves tomorrow");
  assert.equal(departureSaid(6), "Leaves in 6 days");
  assert.equal(departureSaid(null), "");
  assert.equal(departureSaid(undefined), "");
});

test("today's plan keeps what spans the day and orders it by the clock", () => {
  const today = "2026-09-21";
  const items = [
    { id: "hotel", item_date: "2026-09-19", end_date: "2026-09-23" },
    { id: "dinner", item_date: today, start_time: "19:30:00" },
    { id: "gone", item_date: today, start_time: "09:00:00", status: "cancelled" },
    { id: "done", item_date: today, start_time: "08:00:00", is_done: true },
    { id: "yesterday", item_date: "2026-09-20", end_date: "2026-09-20" },
    { id: "tomorrow", item_date: "2026-09-22" },
    { id: "second", item_date: today, sort_order: 2 },
    { id: "first", item_date: today, sort_order: 1 },
  ];
  assert.deepEqual(
    todaysPlan(items, today).map((one) => one.id),
    ["done", "dinner", "hotel", "first", "second"],
  );
  assert.deepEqual(todaysPlan(items, null), []);
  assert.deepEqual(todaysPlan(undefined, today), []);
});

test("progress is counted per trip from rows fetched for every trip at once", () => {
  const rows = [
    { trip_id: "a", is_packed: true },
    { trip_id: "a", is_packed: false },
    { trip_id: "a", is_packed: true },
    { trip_id: "b", is_packed: false },
  ];
  assert.deepEqual(progressOf(rows, "a"), { done: 2, total: 3 });
  assert.deepEqual(progressOf(rows, "b"), { done: 0, total: 1 });
  // No list yet reads as zero of zero, which the screen says its own way.
  assert.deepEqual(progressOf(rows, "c"), { done: 0, total: 0 });
  assert.deepEqual(progressOf([], "a"), { done: 0, total: 0 });
  assert.deepEqual(
    progressOf([{ trip_id: "a", is_done: true }], "a", "is_done"),
    { done: 1, total: 1 },
  );
});

test("Now is the app's home screen: it leads the menu and sign-in lands on it", () => {
  const nav = read("components/NavTabs.js");
  assert.match(nav, /const GROUPS = \[NOW_ROW, GROUPS_BASE\[0\]/);
  assert.match(nav, /label: "Now"/);
  // The row is emphasized rather than renamed.
  assert.match(nav, /lead: true/);
  assert.doesNotMatch(nav, /label: "Home"/);
  assert.match(read("app/globals.css"), /\.arc-pill\.lead:not\(\.on\)/);
  assert.match(read("app/page.js"), /redirect\("\/now"\)/);
});

test("the screen mounts the greeting, the trips and one location prompt", () => {
  const page = read("app/now/page.js");
  assert.match(page, /<NowGreeting/);
  assert.match(page, /<NowTrips current=\{currentCards\} soon=\{soonCards\}/);
  // One prompt, on the trip being lived: a question about where you are has no
  // answer if two trips ask it at once.
  assert.match(page, /currentCards\[0\] && \(\s*<LocationProTips/);
  assert.doesNotMatch(page, /SCREEN_INTROS/);
  const trips = read("app/now/NowTrips.js");
  assert.match(trips, /opensByDefault/);
});
