import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { tripReturnTarget } = jiti("../lib/trips/return.js");
const today = "2026-09-19";

test("trip return names and selects the matching board filter", () => {
  for (const [trip, view, label] of [
    [{ status: "draft", end_date: "2020-01-01" }, "drafts", "Drafts"],
    [{ status: "planning", start_date: "2027-01-01" }, "upcoming", "Planned"],
    [{ status: "active", start_date: today, end_date: "2026-09-20" }, "upcoming", "Planned"],
    [{ status: "planning" }, "upcoming", "Planned"],
    [{ status: "planning", end_date: "2026-09-18" }, "past", "Trip log"],
    [{ status: "complete", start_date: "2027-01-01" }, "past", "Trip log"],
    [{ status: "archived" }, "past", "Trip log"],
  ]) {
    assert.deepEqual(tripReturnTarget(trip, today), { href: `/trips?view=${view}`, label: `Back to ${label}` });
  }
});

test("return follows status changes and keeps the last trip day out of history", () => {
  assert.equal(tripReturnTarget({ status: "planning", end_date: today }, today).label, "Back to Planned");
  const trip = { status: "draft" };
  assert.equal(tripReturnTarget(trip, today).href, "/trips?view=drafts");
  trip.status = "planning";
  assert.equal(tripReturnTarget(trip, today).href, "/trips?view=upcoming");
  trip.status = "complete";
  assert.equal(tripReturnTarget(trip, today).href, "/trips?view=past");
});
