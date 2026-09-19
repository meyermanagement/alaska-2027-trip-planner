import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { tripMenuCounts } = jiti("../lib/trips/menuCounts.js");
const today = "2026-09-19";

test("menu totals match draft, planned and non-archived trip log tabs", () => {
  assert.deepEqual(tripMenuCounts([
    { status: "draft", end_date: "2020-01-01" },
    { status: "draft" },
    { status: "planning", start_date: "2027-01-01" },
    { status: "planning" },
    { status: "active", start_date: today, end_date: "2026-09-20" },
    { status: "planning", start_date: "2026-09-18" },
    { status: "complete", start_date: "2027-01-01" },
    { status: "archived" },
  ], today), { drafts: 2, planned: 2, logged: 2 });
});

test("counts follow household date boundaries and manual status changes", () => {
  const trip = { status: "planning", start_date: today, end_date: today };
  assert.deepEqual(tripMenuCounts([trip], "2026-09-18"), { drafts: 0, planned: 1, logged: 0 });
  assert.deepEqual(tripMenuCounts([trip], today), { drafts: 0, planned: 0, logged: 0 });
  assert.deepEqual(tripMenuCounts([trip], "2026-09-20"), { drafts: 0, planned: 0, logged: 1 });
  assert.deepEqual(tripMenuCounts([{ ...trip, status: "draft" }], "2026-09-20"), { drafts: 1, planned: 0, logged: 0 });
  assert.deepEqual(tripMenuCounts([], today), { drafts: 0, planned: 0, logged: 0 });
});
