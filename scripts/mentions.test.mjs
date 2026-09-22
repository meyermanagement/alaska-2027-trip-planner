// Bucket-list places an alert names when no fare came out of it.
//
// The Northern Europe Finnair alert is the case this exists for: it prices only
// the hub, so the reader saves nothing, and the history card would otherwise say
// "none were kept" about an email that names two places the family is watching.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": new URL("..", import.meta.url).pathname.replace(/\/$/, "") },
});
const { namedSomeday } = await jiti.import("../lib/deals/mentions.js");

const someday = [
  { id: "norway", place: "Norway", status: "open", watch: true },
  { id: "copenhagen", place: "Copenhagen, Denmark", status: "open", watch: true },
  { id: "markets", place: "European Christmas Markets", status: "open", watch: true },
  { id: "switzerland", place: "Switzerland", status: "open", watch: true },
  { id: "savannah", place: "Savannah GA", status: "open", watch: true },
  { id: "shut", place: "Iceland", status: "booked", watch: true },
];

const northernEurope = `Northern Europe from 47k points

Departure Cities

Dallas (DFW) - 63k*
New York (JFK) - 63k*

Thrifty Tip #2: Fly to other cities in Europe like Berlin (BER) or Zurich (ZRH).

Destinations

(Availability varies)

Copenhagen (CPH)
Helsinki (HEL)
Oslo (OSL)
Stockholm (ARN)
`;

test("names the bucket-list places an unpriced destination list mentions", () => {
  const found = namedSomeday(northernEurope, someday);
  assert.deepEqual(
    found.map((row) => row.id).sort(),
    ["copenhagen", "norway"],
  );
  // The city is said when it is not the wish's own word, so a country match does
  // not look like a guess.
  assert.equal(found.find((row) => row.id === "norway").said, "Norway — Oslo");
  assert.equal(
    found.find((row) => row.id === "copenhagen").said,
    "Copenhagen, Denmark",
  );
});

test("a continent in the title is not a place the alert named", () => {
  assert.ok(!namedSomeday(northernEurope, someday).some((row) => row.id === "markets"));
});

test("departure cities and tip cities are not places the alert was about", () => {
  // Zurich rides in a Thrifty Tip above the Destinations list; Switzerland is on
  // the bucket list and must not be reported as named by this offer.
  const found = namedSomeday(northernEurope, someday).map((row) => row.id);
  assert.ok(!found.includes("switzerland"));
  assert.ok(!found.includes("savannah"));
});

test("places no longer open, or not watched, are left out", () => {
  const rows = namedSomeday("Destinations\n\nReykjavik (KEF)\n", [
    ...someday,
    { id: "watchless", place: "Reykjavik", status: "open", watch: false },
  ]);
  assert.deepEqual(rows, []);
});

test("an email with no destination codes names nothing", () => {
  assert.deepEqual(namedSomeday("A newsletter with no airports in it.", someday), []);
  assert.deepEqual(namedSomeday("", someday), []);
  assert.deepEqual(namedSomeday(northernEurope, []), []);
});
