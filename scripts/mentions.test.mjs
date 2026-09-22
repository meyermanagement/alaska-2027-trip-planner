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
const { alertMonths, fareChoices, fittingMentions, namedSomeday } = await jiti.import("../lib/deals/mentions.js");

const someday = [
  { id: "norway", place: "Norway", status: "open", watch: true },
  { id: "copenhagen", place: "Copenhagen, Denmark", status: "open", watch: true },
  { id: "markets", place: "European Christmas Markets", status: "open", watch: true },
  { id: "switzerland", place: "Switzerland", status: "open", watch: true },
  { id: "savannah", place: "Savannah GA", status: "open", watch: true },
  { id: "shut", place: "Iceland", status: "booked", watch: true },
];

const northernEurope = `Northern Europe from 47k points

Flying Finnair in biz class

Departure Cities

(All fares one-way, *nonstop to HEL)

Pricing is in Finnair

Avios

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

// The same alert, with the season line it really carries, and months on the
// wishes so a place-and-date match can be worked out without a price.
const dated = northernEurope.replace(
  "(Availability varies)",
  "(Full availability: Aug - Sep — Varies by city & miles used to book)",
);
const withMonths = someday.map((row) => ({
  ...row,
  months: { norway: [6, 7, 8], copenhagen: [5, 6, 7, 8], markets: [12] }[row.id] || null,
}));

test("reads the season off the alert's own availability line", () => {
  assert.deepEqual(alertMonths(dated), [8, 9]);
  assert.deepEqual(alertMonths(northernEurope), []);
});

test("a no-price alert matches on place and month", () => {
  const match = fittingMentions(dated, withMonths);
  assert.deepEqual(match.places.map((row) => row.id).sort(), ["copenhagen", "norway"]);
  assert.deepEqual(match.months, [8, 9]);
  assert.equal(match.monthsSaid, "Aug, Sep");
});

test("a place whose months the alert misses is not a match", () => {
  const winter = fittingMentions(
    dated,
    [{ id: "markets", place: "Copenhagen", status: "open", watch: true, months: [12] }],
  );
  assert.equal(winter, null);
});

test("a place with no months saved takes any season", () => {
  const match = fittingMentions(
    dated,
    [{ id: "open", place: "Copenhagen", status: "open", watch: true, months: null }],
  );
  assert.deepEqual(match.places.map((row) => row.id), ["open"]);
});

test("an alert that names no season is not a date match", () => {
  assert.equal(fittingMentions(northernEurope, withMonths), null);
  assert.equal(fittingMentions(dated, []), null);
});

test("an alert with no destinations list is not a place match on the fares list", () => {
  // A cash alert for one city lists its departure airports and nothing else. The
  // history line may report a mention; a fares card may not, or a Switzerland
  // offer ends up claiming to be about Montreal.
  const departuresOnly = `Ireland under $578\n\nDeparture Cities\n\nSan Francisco (SFO) - $578\nToronto (YYZ) - $604\n\n(Full availability: Aug - Sep)\n`;
  const rows = [{ id: "sf", place: "San Francisco, California", status: "open", watch: true, months: [8] }];
  assert.equal(fittingMentions(departuresOnly, rows), null);
  assert.ok(namedSomeday(departuresOnly, rows).length);
});

test("the choices an alert leaves open are its priced airports and its listed cities", () => {
  const choices = fareChoices(dated, [{ code: "DFW" }, { code: "STL" }]);
  assert.deepEqual(choices.departures.map((row) => row.code), ["DFW"]);
  assert.equal(choices.departures[0].points, 63000);
  assert.equal(choices.program, "Finnair Avios");
  assert.equal(choices.unit, "avios");
  assert.equal(choices.airline, "Finnair");
  assert.equal(choices.cabin, "business");
  assert.equal(choices.nonstop, "HEL");
  assert.ok(choices.destinations.some((city) => city.code === "OSL"));
  assert.deepEqual(choices.others, ["JFK"]);
});

test("an airport the family does not fly from is not a fare they can take", () => {
  assert.equal(fareChoices(dated, [{ code: "STL" }]), null);
  assert.equal(fareChoices(dated, []), null);
});

test("no departure list and no destinations list means nothing to pair", () => {
  assert.equal(fareChoices("Northern Europe from 47k points\n", [{ code: "DFW" }]), null);
});

test("a matched alert carries the choices onto the card", () => {
  const match = fittingMentions(dated, withMonths, { airports: [{ code: "DFW" }] });
  assert.equal(match.fare.departures[0].code, "DFW");
  assert.equal(fittingMentions(dated, withMonths, { airports: [{ code: "STL" }] }).fare, null);
  assert.equal(fittingMentions(dated, withMonths).fare, null);
});
