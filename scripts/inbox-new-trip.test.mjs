// A forwarded booking for a week none of the family's trips covers. These
// tests pin the two judgements the feature rests on -- "does this message need
// a trip?" and "what trip would we make?" -- because both are used in three
// places (the inbox card, the header banner, the file route) and the whole
// point of putting them in one pure module is that those three can never
// disagree about a message.

import test from "node:test";
import assert from "node:assert/strict";

import {
  datedSpan,
  tripCovers,
  needsTrip,
  messagesNeedingTrip,
  tripFromItems,
} from "../lib/inbox/newTrip.js";

const CRUISE = [
  { category: "cruise", title: "Wonder of the Seas", location: "Miami", item_date: "2027-02-14", end_date: "2027-02-21" },
  { category: "excursion", title: "Snorkel at Coco Cay", location: "Coco Cay", item_date: "2027-02-16", end_date: null },
];

test("datedSpan spans the earliest and latest date in the parse", () => {
  assert.deepEqual(datedSpan(CRUISE), { start: "2027-02-14", end: "2027-02-21" });
});

test("datedSpan ignores rows the parser could not date", () => {
  assert.deepEqual(
    datedSpan([{ item_date: null, end_date: "" }, { item_date: "2027-02-14" }]),
    { start: "2027-02-14", end: "2027-02-14" },
  );
});

test("datedSpan is null when nothing is dated", () => {
  assert.equal(datedSpan([{ title: "Dinner", item_date: null }]), null);
  assert.equal(datedSpan([]), null);
  assert.equal(datedSpan(null), null);
});

test("datedSpan rejects dates that are not plain ISO days", () => {
  assert.equal(datedSpan([{ item_date: "Feb 14 2027" }]), null);
});

test("tripCovers wants the whole span inside one trip", () => {
  const span = { start: "2027-02-14", end: "2027-02-21" };
  assert.equal(tripCovers([{ start_date: "2027-02-01", end_date: "2027-02-28" }], span), true);
  // Overlapping is not covering: a trip that ends mid-cruise is a different trip.
  assert.equal(tripCovers([{ start_date: "2027-02-01", end_date: "2027-02-16" }], span), false);
  // Two trips that together span it still do not cover it.
  assert.equal(
    tripCovers(
      [
        { start_date: "2027-02-01", end_date: "2027-02-16" },
        { start_date: "2027-02-17", end_date: "2027-02-28" },
      ],
      span,
    ),
    false,
  );
  // A trip with no dates cannot cover anything.
  assert.equal(tripCovers([{ start_date: null, end_date: null }], span), false);
});

test("needsTrip offers the span when no trip covers it", () => {
  assert.deepEqual(
    needsTrip({ items: CRUISE, trips: [{ start_date: "2026-11-20", end_date: "2026-11-28" }], todayISO: "2026-09-22" }),
    { start: "2027-02-14", end: "2027-02-21" },
  );
});

test("needsTrip refuses a message whose dates are already covered", () => {
  assert.equal(
    needsTrip({ items: CRUISE, trips: [{ start_date: "2027-02-10", end_date: "2027-02-25" }], todayISO: "2026-09-22" }),
    null,
  );
});

test("needsTrip refuses a stale forward of a trip already taken", () => {
  assert.equal(needsTrip({ items: CRUISE, trips: [], todayISO: "2027-03-01" }), null);
  // Still offered on the last day of the span, which is a trip in progress.
  assert.deepEqual(needsTrip({ items: CRUISE, trips: [], todayISO: "2027-02-21" }), {
    start: "2027-02-14",
    end: "2027-02-21",
  });
});

test("needsTrip refuses a message with no dates at all", () => {
  assert.equal(needsTrip({ items: [{ title: "Your statement" }], trips: [], todayISO: "2026-09-22" }), null);
});

test("messagesNeedingTrip keys the spans by message", () => {
  const items = [
    { message_id: "m1", category: "cruise", item_date: "2027-02-14", end_date: "2027-02-21" },
    { message_id: "m2", category: "lodging", item_date: "2026-11-22", end_date: "2026-11-24" },
    { message_id: "m3", category: "other", item_date: null, end_date: null },
  ];
  const out = messagesNeedingTrip({
    messages: [{ id: "m1" }, { id: "m2" }, { id: "m3" }, { id: "m4" }],
    items,
    // m2 lands inside Thanksgiving, so only m1 needs a trip. m3 is undated and
    // m4 has no parsed rows at all.
    trips: [{ start_date: "2026-11-20", end_date: "2026-11-28" }],
    todayISO: "2026-09-22",
  });
  assert.deepEqual([...out.keys()], ["m1"]);
  assert.deepEqual(out.get("m1"), { start: "2027-02-14", end: "2027-02-21" });
});

test("tripFromItems names the trip after the most trip-shaped row", () => {
  const span = { start: "2027-02-14", end: "2027-02-21" };
  assert.deepEqual(tripFromItems({ items: CRUISE, span }), {
    name: "Wonder of the Seas, February 2027",
    destination: "Miami",
    start_date: "2027-02-14",
    end_date: "2027-02-21",
    status: "planning",
  });
});

test("tripFromItems prefers a cruise or a hotel over a flight", () => {
  const span = { start: "2027-02-14", end: "2027-02-21" };
  const items = [
    { category: "flight", title: "MCI to MIA" },
    { category: "lodging", title: "Hyatt Miami", location: "Miami" },
  ];
  assert.equal(tripFromItems({ items, span }).name, "Hyatt Miami, February 2027");
});

test("tripFromItems falls back to a plain name and no destination", () => {
  const span = { start: "2027-02-14", end: "2027-02-21" };
  const made = tripFromItems({ items: [{ category: "other" }], span });
  assert.equal(made.name, "Trip, February 2027");
  assert.equal(made.destination, null);
  // The trip is decided, not still being turned over, so it is not a draft.
  assert.equal(made.status, "planning");
});

test("tripFromItems keeps the name inside the column", () => {
  const made = tripFromItems({
    items: [{ category: "cruise", title: "x".repeat(400) }],
    span: { start: "2027-02-14", end: "2027-02-21" },
  });
  assert.equal(made.name.length, 120);
});

test("tripFromItems refuses without a span", () => {
  assert.equal(tripFromItems({ items: CRUISE, span: null }), null);
});
