// A fare email that never writes one of the family's airports, or never names
// a place they want, is not sent to Gemini: nothing in it could be kept.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const { mentionsHousehold } = await jiti.import("../lib/deals/prefilter.js");

const TODAY = "2026-09-22";
const world = {
  airports: [{ code: "STL" }, { code: "ORD" }],
  someday: [
    { place: "Kauai, Hawaii", status: "open", watch: true },
    { place: "Norway", status: "open", watch: true },
    { place: "Egypt", status: "taken", watch: true },
    { place: "Madrid, Spain", status: "open", watch: false },
  ],
  trips: [
    { name: "Curaçao 2027", destination: "Willemstad, Curaçao", status: "planning", start_date: "2027-03-14", end_date: "2027-03-21" },
    { name: "Europe 2026", destination: "Munich & Salzburg", status: "complete", start_date: "2026-07-31", end_date: "2026-08-12" },
  ],
};
const ok = (text, w = world) => mentionsHousehold(text, w, TODAY).ok;

test("a home airport and a bucket-list place: sent", () => {
  assert.equal(ok("Subject: Kauai under $393\nSt. Louis (STL) - Lihue (LIH) $393"), true);
});

test("no home airport anywhere: not sent, and says why", () => {
  const r = mentionsHousehold("Subject: Kauai from $299\nDenver (DEN) - Lihue (LIH) $299", world, TODAY);
  assert.equal(r.ok, false);
  assert.match(r.why, /airports you fly from/);
});

test("home airport codes count in any letter case and as whole words only", () => {
  assert.equal(ok("from stl to Kauai $400"), true);
  assert.equal(ok("CASTLE tours in Kauai from DEN $400"), false);
});

test("no place the family wants: not sent, and says why", () => {
  const r = mentionsHousehold("Subject: Boise from $199\nSTL - Boise (BOI) $199", world, TODAY);
  assert.equal(r.ok, false);
  assert.match(r.why, /bucket list or in your trips/);
});

test("a city inside a country on the bucket list counts through its airport code", () => {
  assert.equal(ok("Subject: Oslo in winter\nChicago (ORD) - Oslo (OSL) $512"), true);
});

test("a trip that can still take a fare counts, a finished one does not", () => {
  assert.equal(ok("STL - Curacao (CUR) $410, Willemstad"), true);
  assert.equal(ok("STL - Munich (MUC) $610"), false);
});

test("taken and unwatched bucket-list places do not open the gate", () => {
  assert.equal(ok("STL - Cairo (CAI) $780, Egypt"), false);
  assert.equal(ok("STL - Madrid (MAD) $540, Spain"), false);
});

test("a family with no home airports is not gated on the origin", () => {
  assert.equal(ok("Denver (DEN) - Lihue (LIH) $299 Kauai", { ...world, airports: [] }), true);
});
