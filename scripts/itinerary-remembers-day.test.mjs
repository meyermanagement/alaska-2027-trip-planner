import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { CHOSEN, chosenDay, rememberDay, linkSeen } = jiti("../lib/day/chosen.js");

const DAYS = ["2027-08-01", "2027-08-02", "2027-08-03"];

test("a day chosen on a trip comes back after the list remounts", () => {
  CHOSEN.clear();
  assert.equal(chosenDay("t1", DAYS, "2027-08-01"), null);
  rememberDay("t1", "2027-08-03", "2027-08-01");
  assert.equal(chosenDay("t1", DAYS, "2027-08-01"), "2027-08-03");
  assert.equal(chosenDay("t2", DAYS, "2027-08-01"), null, "per trip");
});

test("forgotten when the day moves on or the day no longer exists", () => {
  CHOSEN.clear();
  rememberDay("t1", "2027-08-03", "2027-08-01");
  assert.equal(chosenDay("t1", DAYS, "2027-08-02"), null);
  assert.equal(chosenDay("t1", DAYS.slice(0, 2), "2027-08-01"), null);
});

test("remembering keeps the link the visit arrived with", () => {
  CHOSEN.clear();
  linkSeen("t1", "2027-08-02");
  rememberDay("t1", "2027-08-03", "2027-08-01");
  assert.equal(CHOSEN.get("t1").link, "2027-08-02");
});

test("the itinerary opens on the remembered day and saves choices", () => {
  const src = readFileSync(new URL("../components/Itinerary.js", import.meta.url), "utf8");
  assert.match(src, /remembered \?\? openingDay\(dayKeys, today\)/);
  assert.match(src, /rememberDay\(tripId, selected\)/);
});
