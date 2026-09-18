import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { newsletterFares, fareReadInput } = jiti("../lib/deals/newsletter.js");
const { matchHousehold, manyBrief, faresFrom } = jiti("../lib/deals/forwarded.js");
const { checkCandidate, hardParse } = jiti("../lib/deals/parse.js");
const { somedayFor, monthCheck, dealVerdict } = jiti("../lib/deals/verdict.js");
const { buildPromptText } = jiti("../lib/inbox/parser.js");

// Redacted route facts from the reported newsletter; no account/tracking URLs.
const destinations = [
  ["Amsterdam", "AMS", 497], ["Bergen", "BGO", 496],
  ["Brussels", "BRU", 401], ["Copenhagen", "CPH", 496],
  ["Gdansk", "GDN", 488], ["Gothenburg", "GOT", 495],
  ["Helsinki", "HEL", 497], ["London", "LHR", 499],
  ["Oslo", "OSL", 496], ["Paris", "CDG", 497],
  ["Stavanger", "SVG", 496], ["Stockholm", "ARN", 496],
  ["Tallinn", "TLL", 489], ["Vilnius", "VNO", 486],
  ["Warsaw", "WAW", 497], ["Zurich", "ZRH", 496],
];
function routes(city, code, priceOverride) {
  return `*${city} (${code}) https://example.com/tracking\n` +
    destinations.map(([name, dest, price]) =>
      `${name} (${dest}) - $${priceOverride || price}${dest === "CPH" ? "*" : ""}`,
    ).join("\n");
}
const email = `Europe from $386
Europe (destinations below)
Flying Scandinavian Airlines (SAS)
Best: November - February
(Full availability: Nov - Apr — Varies by city)
We think this will last less than 24 hours
SAS Economy Go Light fares.
*Departure Cities*
(All fares round-trip, *nonstop)
${routes("Atlanta", "ATL", 450)}
${routes("Boston", "BOS", 396)}
${routes("Chicago", "ORD")}
${routes("Newark", "EWR", 385)}
*How to Book*
Check Google Flights.
These fares are a great way to get to Europe for the Christmas markets in late-November or early-December.
`;
const airports = [{ code: "STL" }, { code: "ORD", drive_minutes: 300 }];
const markets = { id: "markets", place: "European Christmas Markets", region: null, months: [12], status: "open", watch: true };
const world = { airports, someday: [markets], trips: [] };
const source = { name: "Thrifty Traveler", url: null };
const fare = { origin: "ORD", destination: "Brussels", destination_code: "BRU", price: 401, travel_months: [11, 12, 1, 2, 3, 4] };

test("later household origin is read in full, beyond the old ten-fare cutoff", () => {
  const result = newsletterFares(email, airports);
  assert.equal(result.complete, true);
  assert.equal(result.fares.length, 16);
  assert.ok(result.fares.every((r) => r.origin === "ORD"));
  assert.equal(result.fares.find((r) => r.destination_code === "BRU").price, 401);
  assert.equal(result.fares.at(-1).destination_code, "ZRH");
  assert.deepEqual(new Set(result.fares[0].travel_months), new Set([11, 12, 1, 2, 3, 4]));
});

test("all sixteen exact route prices pass validation and match the seasonal bucket item", () => {
  for (const candidate of newsletterFares(email, airports).fares) {
    const checked = checkCandidate(candidate, { text: email, hard: hardParse(email), source, receivedAt: "2026-09-18T13:35:28Z" });
    assert.equal(checked.ok, true, checked.why);
    assert.equal(matchHousehold(checked.row, world).someday_id, "markets", candidate.destination);
    assert.equal(monthCheck(checked.row, markets).verdict, "fits");
  }
});

test("known tables do not call for an unrelated origin when none are ours", () => {
  assert.deepEqual(newsletterFares(email, [{ code: "STL" }]), { complete: true, fares: [] });
  assert.equal(newsletterFares(email, []).fares.length, 64);
  assert.equal(matchHousehold({ ...fare, origin: "ATL" }, world).ok, false);
});

test("fallback keeps later origin and seasonal context but removes tracking URLs", () => {
  const input = fareReadInput(email, airports);
  assert.ok(input.includes("Chicago (ORD)"));
  assert.ok(!input.includes("Atlanta (ATL)"));
  assert.ok(!input.includes("Newark (EWR)"));
  assert.ok(!input.includes("https://"));
  assert.ok(input.includes("Christmas markets"));
  assert.ok(manyBrief(email, hardParse(email), source, airports).includes("Filter origins BEFORE applying the limit"));
  assert.equal(faresFrom(JSON.stringify({ fares: Array.from({ length: 16 }, () => fare) })).length, 16);
});

test("tracking links cannot consume the inbox budget ahead of a later origin", () => {
  const body = email.replace("*Departure Cities*", `https://example.com/${"x".repeat(35000)}\n*Departure Cities*`);
  const input = buildPromptText({ from_email: "jared@deals.thriftytraveler.com", text_body: body });
  assert.equal(newsletterFares(input, airports).fares.length, 16);
  assert.ok(input.includes("Christmas markets"));
});

test("forwarded provider Markdown retains headings, airline and all route rows", () => {
  const forwarded = email.replaceAll("*Departure Cities*", "****Departure Cities****")
    .replaceAll("*How to Book*", "****How to Book****")
    .replaceAll("*Chicago", "****Chicago")
    .replace("Flying Scandinavian Airlines (SAS)", "**Flying Scandinavian Airlines (SAS)**")
    .replace("(Full availability: Nov - Apr — Varies by city)", "**(Full availability: Nov - Apr — Varies by city)**");
  const result = newsletterFares(forwarded, airports);
  assert.equal(result.complete, true);
  assert.equal(result.fares.length, 16);
  assert.equal(result.fares[0].airline, "Scandinavian Airlines");
});

test("unrecognized, mixed-currency and non-table messages use the fallback", () => {
  assert.equal(newsletterFares("Flights to Europe from $400", airports).complete, false);
  assert.equal(newsletterFares(email.replace("Brussels (BRU) - $401", "Brussels (BRU) - CAD $401"), airports).complete, false);
  assert.equal(newsletterFares(email.replace("Brussels (BRU) - $401", "Brussels (BRU) from $401 on select dates"), airports).complete, false);
});

test("a European gateway does not match Japan, German-only markets or summer-only Christmas travel", () => {
  assert.equal(somedayFor(fare, [{ ...markets, place: "Japan", region: "Asia" }]), null);
  assert.equal(somedayFor(fare, [{ ...markets, place: "German Christmas Markets", region: "Europe" }]), null);
  assert.equal(somedayFor({ ...fare, travel_months: [6, 7] }, [markets]), null);
  assert.equal(somedayFor({ ...fare, travel_months: [6, 7] }, [{ ...markets, months: [] }]), null);
  assert.equal(somedayFor({ ...fare, destination: "Tokyo", destination_code: "HND" }, [markets]), null);
  assert.equal(somedayFor({ ...fare, destination: "Europe", travel_months: [6, 7] }, [markets]), null);
});

test("country relationships work beyond the reported Europe wording", () => {
  assert.equal(somedayFor({ ...fare, destination: "Tokyo", destination_code: "HND", travel_months: [4] },
    [{ ...markets, place: "Japan in spring", months: [4] }])?.id, "markets");
});

test("specific city wins over continent; closed targets stay excluded", () => {
  const city = { ...markets, id: "city", place: "Brussels" };
  assert.equal(somedayFor(fare, [markets, city]).id, "city");
  assert.equal(somedayFor(fare, [{ ...markets, status: "done" }]), null);
  assert.equal(somedayFor({ ...fare, travel_months: [] }, [markets])?.id, "markets");
  assert.equal(matchHousehold(fare, { ...world, someday: [{ ...markets, watch: false }] }).ok, false);
});

test("the right season outranks a more specific city wanted in another season", () => {
  const copenhagen = { ...fare, destination: "Copenhagen", destination_code: "CPH" };
  const summer = { ...markets, id: "summer", place: "Copenhagen, Denmark", months: [5, 6, 7, 8] };
  assert.equal(somedayFor(copenhagen, [summer, markets]).id, "markets");
  assert.equal(somedayFor({ ...copenhagen, travel_months: [6] }, [summer, markets]).id, "summer");
});

test("regional matches explain gateway relevance without guaranteeing event dates", () => {
  const result = dealVerdict(fare, { ...world, today: new Date("2026-09-18T12:00:00Z") });
  assert.ok(JSON.stringify(result).includes("possible gateway"));
  assert.ok(JSON.stringify(result).includes("local event dates"));
});
