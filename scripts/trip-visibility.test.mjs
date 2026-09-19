import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { readFileSync } from "node:fs";
const jiti = createJiti(import.meta.url);
const { canSeeTrip, visibleTripIds } = jiti("../lib/trips/visibility.js");
const primary = { familyId: "home", can: { isSecondary: false } };
const secondary = { ...primary, travelerId: "me", can: { isSecondary: true } };
const trip = { id: "included", family_id: "home", status: "planning" };
test("secondary trip visibility requires a roster and excludes every draft", () => {
  assert.equal(canSeeTrip(trip, secondary, ["included"]), true);
  assert.equal(canSeeTrip(trip, secondary, []), false);
  assert.equal(canSeeTrip({ ...trip, status: "draft" }, secondary, ["included"]), false);
  assert.equal(canSeeTrip(trip, { ...secondary, travelerId: null }, ["included"]), false);
  for (const status of ["active", "complete", "archived"]) {
    assert.equal(canSeeTrip({ ...trip, status }, secondary, ["included"]), true);
  }
});
test("primary access remains household scoped, including drafts", () => {
  assert.equal(canSeeTrip({ ...trip, status: "draft" }, primary), true);
  assert.equal(canSeeTrip({ ...trip, family_id: "other" }, primary), false);
  assert.equal(canSeeTrip(trip, null), false);
  assert.equal(canSeeTrip(null, primary), false);
});
test("roster query errors fail closed", async () => {
  const client = { from: () => ({ select: () => ({
    eq: async () => ({ data: [{ trip_id: "included" }], error: new Error("offline") }),
  }) }) };
  assert.deepEqual(await visibleTripIds(client, secondary), []);
  assert.deepEqual(await visibleTripIds(client, primary), []);
});
test("secondary drafts are hidden and direct URLs checked before redirect", () => {
  const board = readFileSync(new URL("../app/trips/TripBoard.js", import.meta.url), "utf8");
  const detail = readFileSync(new URL("../app/trips/[ref]/page.js", import.meta.url), "utf8");
  assert.match(board, /\{!secondary && <Section\s+id="drafts"/);
  assert.match(board, /canArchive=\{!secondary\}/);
  assert.ok(detail.indexOf("if (!canSeeTrip") < detail.indexOf("if (needsCanonical"));
});
