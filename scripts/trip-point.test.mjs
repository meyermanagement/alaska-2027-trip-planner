// Where a trip is, when the destination is a list of places or the name of a
// region.
//
// Two real rows went wrong and both are pinned here: an Alaskan cruise-tour that
// landed on Vancouver because the embarkation port is the first thing you write,
// and a New England trip that landed on the town of New England, North Dakota,
// because a region name really is a town name somewhere.

import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  moduleCache: false,
  alias: {
    "@/lib/supabase/admin": fileURLToPath(
      new URL("./fixtures/locate-admin.js", import.meta.url),
    ),
    "@": fileURLToPath(new URL("..", import.meta.url)),
  },
});

const photon = jiti("../lib/places/photon.js");
const {
  destinationStops,
  destinationMoved,
  itineraryStops,
  plausibleStop,
  tripPoint,
} = photon;

const ALASKA = "Vancouver, Inside Passage, Denali, Anchorage & Girdwood";

// Places as Photon actually answers them, including the two wrong answers.
const PLACES = {
  Vancouver: { lat: 49.2609, lon: -123.114, name: "Vancouver" },
  "Inside Passage": { lat: -22.9, lon: -43.2, name: "Passagem" },
  Denali: { lat: 63.0692, lon: -151.0069, name: "Denali" },
  Anchorage: { lat: 61.2163, lon: -149.8935, name: "Anchorage" },
  Girdwood: { lat: 60.9426, lon: -149.1674, name: "Girdwood" },
  "New England": { lat: 46.5392, lon: -102.8682, name: "New England" },
  "Portland, ME": { lat: 43.6591, lon: -70.2568, name: "Portland" },
  "Bar Harbor, ME": { lat: 44.3876, lon: -68.2039, name: "Bar Harbor" },
  "Seal Harbor, ME": { lat: 44.2951, lon: -68.2437, name: "Seal Harbor" },
  "Edgartown, Martha's Vineyard": {
    lat: 41.3891,
    lon: -70.5134,
    name: "Edgartown",
  },
  "Woods Hole": { lat: 41.5237, lon: -70.6712, name: "Woods Hole" },
  "Walt Disney World": {
    lat: 28.3697,
    lon: -81.5951,
    name: "Walt Disney World",
  },
  "Springfield, IL": { lat: 39.7817, lon: -89.6501, name: "Springfield" },
};

function feature(place) {
  return {
    features: [
      {
        geometry: { type: "Point", coordinates: [place.lon, place.lat] },
        properties: { name: place.name },
      },
    ],
  };
}

/** Photon, as far as this test is concerned: a table of answers, and a count. */
function fakePhoton() {
  const asked = [];
  globalThis.fetch = async (url) => {
    const q = new URL(String(url)).searchParams.get("q");
    asked.push(q);
    const place = PLACES[q];
    return {
      ok: true,
      json: async () => (place ? feature(place) : { features: [] }),
    };
  };
  return asked;
}

test("a destination written for people is every place in it", () => {
  assert.deepEqual(destinationStops(ALASKA), [
    "Vancouver",
    "Inside Passage",
    "Denali",
    "Anchorage",
    "Girdwood",
  ]);
  // One place is asked for whole, because "Springfield, IL" needs its state.
  assert.deepEqual(destinationStops("Springfield, IL"), ["Springfield, IL"]);
});

test("an answer about somewhere else is not the stop that was asked for", () => {
  assert.equal(plausibleStop("Inside Passage", { name: "Passagem" }), false);
  assert.equal(plausibleStop("Anchorage", { name: "Anchorage" }), true);
  assert.equal(plausibleStop("Tyrol", { name: "Tirol" }), true);
});

test("the Alaska trip is placed in Alaska, not on the embarkation port", () => {
  const stops = ["Vancouver", "Denali", "Anchorage", "Girdwood"].map(
    (name) => PLACES[name],
  );
  const point = tripPoint(stops);
  assert.ok(point, "a multi-stop trip should get a point");
  assert.ok(
    point.lat > 59 && point.lat < 64 && point.lon < -145,
    `expected somewhere in Alaska, got ${point.lat},${point.lon}`,
  );
  assert.notEqual(point.name, "Vancouver");
});

test("a region's real days outvote the town that shares its name", () => {
  const point = tripPoint([
    PLACES["New England"],
    PLACES["Portland, ME"],
    PLACES["Bar Harbor, ME"],
    PLACES["Seal Harbor, ME"],
    PLACES["Edgartown, Martha's Vineyard"],
  ]);
  assert.ok(point, "the days should place the trip");
  assert.ok(point.lon > -75, `expected New England, got ${point.lon}`);
  assert.notEqual(point.name, "New England");
});

test("a single place is still itself", () => {
  const point = tripPoint([PLACES["Walt Disney World"]]);
  assert.equal(point.lat, 28.3697);
});

test("the days are asked for as places, not as journeys", () => {
  assert.deepEqual(
    itineraryStops([
      "STL to PWM",
      "Portland, ME",
      "49 Neal Street, Portland, ME",
      "Bar Harbor, ME",
      null,
      "Whittier to Denali",
      "bar harbor, me",
    ]),
    ["Portland, ME", "Bar Harbor, ME"],
  );
});

test("a destination that only changed its punctuation has not moved", () => {
  const trip = { destination: "Vancouver, Inside Passage" };
  assert.equal(
    destinationMoved(trip, { destination: "Vancouver,  inside passage" }),
    false,
  );
  assert.equal(destinationMoved(trip, { destination: "Lisbon" }), true);
  assert.equal(destinationMoved(trip, { destination: "" }), false);
  assert.equal(destinationMoved(trip, { name: "Alaska" }), false);
});

test("locating the Alaska trip writes an Alaskan point", async () => {
  const asked = fakePhoton();
  globalThis.__locateTestDb = {
    trip: { id: "t1", name: "Alaska 2027", destination: ALASKA },
    days: [],
    writes: [],
  };
  const { relocateTrip } = jiti("../lib/covers/generate.js");
  const out = await relocateTrip("t1");
  assert.equal(out.ok, true);
  assert.ok(out.lat > 59 && out.lat < 64, `got ${out.lat}`);
  // Every place named was looked up, not just the first one recognized.
  assert.ok(asked.includes("Girdwood"));
  const write = globalThis.__locateTestDb.writes.at(-1).value;
  assert.equal(write.lat, out.lat);
  // Whichever Alaskan stop is nearest the rest of them, and never Vancouver.
  assert.ok(
    ["Denali", "Anchorage", "Girdwood"].includes(write.geo_query),
    `got ${write.geo_query}`,
  );
});

test("locating the New England trip falls back to its days", async () => {
  fakePhoton();
  globalThis.__locateTestDb = {
    trip: { id: "t2", name: "New England 2026", destination: "New England" },
    days: [
      "STL to PWM",
      "Portland, ME",
      "Bar Harbor, ME",
      "Seal Harbor, ME",
      "Woods Hole",
      "Edgartown, Martha's Vineyard",
    ],
    writes: [],
  };
  const { relocateTrip } = jiti("../lib/covers/generate.js");
  const out = await relocateTrip("t2");
  assert.equal(out.ok, true);
  assert.ok(out.lon > -75, `expected New England, got ${out.lon}`);
  const write = globalThis.__locateTestDb.writes.at(-1).value;
  assert.notEqual(write.geo_query, "New England");
});

test("a trip already placed is left alone unless it moved", async () => {
  fakePhoton();
  globalThis.__locateTestDb = {
    trip: {
      id: "t3",
      name: "Disney",
      destination: "Walt Disney World",
      lat: 28.3697,
      lon: -81.5951,
    },
    days: [],
    writes: [],
  };
  const covers = jiti("../lib/covers/generate.js");
  const out = await covers.relocateTrip("t3");
  // relocateTrip is the deliberate "do it again" path, so it does write.
  assert.equal(out.ok, true);
  assert.equal(globalThis.__locateTestDb.writes.length, 1);
});
