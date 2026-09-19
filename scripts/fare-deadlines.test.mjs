import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { fareDeadlinePassed, fareHasExpired, fareForToday, fareListsForToday, fareMatchesTrip, retireFares } = jiti("../lib/deals/deadline.js");
const { deadlinesInView } = jiti("../lib/watch/deadlines.js");
const { judged } = jiti("../lib/deals/world.js");
const today = "2026-09-19";
const expired = { id: "past", status: "open", book_by: "2026-09-18", trip_id: "trip", someday_id: "place" };

test("stated deadlines expire after the complete household day, not on that day", () => {
  assert.equal(fareHasExpired(expired, today), true);
  assert.equal(fareHasExpired(expired, "2026-09-18"), false);
  assert.equal(fareHasExpired(expired, "2026-09-17"), false);
  for (const book_by of [null, "", "invalid", "2026-02-30", "2026-9-01"])
    assert.equal(fareHasExpired({ book_by }, today), false);
});

test("estimated deadlines warn but do not auto-dismiss; unknown dates remain active", () => {
  const inferred = { ...expired, book_by_inferred: true };
  assert.equal(fareDeadlinePassed(inferred, today), true);
  assert.equal(fareHasExpired(inferred, today), false);
  assert.equal(fareForToday(inferred, today).status, "open");
  assert.equal(fareForToday({ status: "open" }, today).status, "open");
});

test("automatic history clears attachments without deleting fares or personal refusal reasons", () => {
  const result = fareForToday(expired, today);
  assert.equal(result.status, "dismissed");
  assert.equal(result.dismissed_reason, "Deadline passed");
  assert.equal(result.trip_id, null);
  assert.equal(result.someday_id, null);
  assert.equal(expired.status, "open");
  for (const status of ["taken", "dismissed"]) {
    const row = { ...expired, status, dismissed_reason: "Wrong week" };
    assert.deepEqual(fareForToday(row, today), row);
    assert.equal(fareDeadlinePassed(row, today), true);
  }
  assert.equal(fareForToday({ status: "expired" }, today).status, "dismissed");
});

test("server judgments and deadline watch agree, and alerts link to the fare tab", () => {
  const rows = [expired, { ...expired, id: "guess", book_by_inferred: true },
    { ...expired, id: "saved", status: "taken" }, { ...expired, id: "today", book_by: today }];
  assert.equal(judged(rows, {}, today)[0].status, "dismissed");
  const view = deadlinesInView({ deals: rows, today });
  assert.deepEqual(view.expired, ["past"]);
  assert.equal(view.alerts[0].path, "/someday#fares");
});

test("detached history no longer appears on the trip, while saved fares stay assigned", () => {
  const verdict = { trip: { id: "trip" } };
  assert.equal(fareMatchesTrip({ status: "dismissed", verdict }, "trip"), false);
  assert.equal(fareMatchesTrip({ status: "open", verdict }, "trip"), true);
  assert.equal(fareMatchesTrip({ status: "taken", verdict, trip_id: "chosen" }, "trip"), false);
  assert.equal(fareMatchesTrip({ status: "taken", trip_id: "chosen" }, "chosen"), true);
});

test("watch retirement is scoped and guards against a concurrent save or deadline extension", async () => {
  const calls = [];
  const q = Object.fromEntries(["update", "eq", "in", "lt", "or", "select"].map((method) =>
    [method, (...args) => { calls.push([method, ...args]); return q; }]));
  q.then = (resolve) => resolve({ data: [{ id: "past" }], error: null });
  const db = { from: (table) => { calls.push(["from", table]); return q; } };
  await retireFares(db, "family", ["past"], today);
  assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "family_id" && c[2] === "family"));
  assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "status" && c[2] === "open"));
  assert.ok(calls.some((c) => c[0] === "lt" && c[1] === "book_by" && c[2] === today));
  assert.ok(calls.some((c) => c[0] === "or" && c[1].includes("book_by_inferred.eq.false")));
  assert.equal(calls.find((c) => c[0] === "update")[1].status, "dismissed");
  calls.length = 0;
  await retireFares(db, null, ["past"], today);
  await retireFares(db, "family", [], today);
  assert.equal(calls.length, 0);
});

test("history separates still-valid refusals from auto-expired, declined-expired and legacy fares", () => {
  const rows = [
    { ...expired, id: "active-expired" },
    { ...expired, id: "declined-expired", status: "dismissed", dismissed_reason: "Wrong week" },
    { id: "legacy", status: "expired" },
    { id: "valid", status: "dismissed", book_by: today },
    { id: "undated", status: "dismissed" },
    { ...expired, id: "estimate", status: "dismissed", book_by_inferred: true },
    { ...expired, id: "saved", status: "taken" },
    { id: "open", status: "open" },
  ];
  const lists = fareListsForToday(rows, today);
  assert.deepEqual(lists.expired.map(d => d.id), ["active-expired", "declined-expired", "legacy"]);
  assert.deepEqual(lists.refused.map(d => d.id), ["valid", "undated", "estimate"]);
  assert.deepEqual(lists.taken.map(d => d.id), ["saved"]);
  assert.deepEqual(lists.open.map(d => d.id), ["open"]);
  assert.equal(lists.expired[1].dismissed_reason, "Wrong week");
  assert.equal(rows[0].status, "open");
});

test("a previously refused fare moves into expired history after the whole deadline day", () => {
  const rows = [{ id: "refused", status: "dismissed", book_by: "2026-09-19" }];
  assert.equal(fareListsForToday(rows, "2026-09-19").refused.length, 1);
  assert.equal(fareListsForToday(rows, "2026-09-20").expired.length, 1);
});
