import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { tripOpeningTab, homeOpeningTrip, homeOpeningPath, openingTabForLink } = jiti("../lib/trips/opening.js");
const trip = { id: "one", slug: "alaska", public_id: "2345ab", status: "planning", start_date: "2026-09-19", end_date: "2026-09-23" };
test("regular trip opens Packing on departure eve, Itinerary through the last day, Overview otherwise", () => {
  for (const [date, expected] of [["2026-09-17","overview"], ["2026-09-18","packing"], ["2026-09-19","itinerary"], ["2026-09-21","itinerary"], ["2026-09-23","itinerary"], ["2026-09-24","overview"]])
    assert.equal(tripOpeningTab(trip, date), expected);
});
test("inactive, missing, undated and one-day trips have safe opening rules", () => {
  for (const status of ["draft","complete","archived","cancelled","canceled"])
    assert.equal(tripOpeningTab({...trip,status}, "2026-09-19"), "overview");
  assert.equal(tripOpeningTab({...trip,archived_at:"yesterday"}, "2026-09-18"), "overview");
  for (const invalid of [null, {}, {...trip,start_date:null,end_date:null}])
    assert.equal(tripOpeningTab(invalid, "2026-09-19"), "overview");
  assert.equal(tripOpeningTab({...trip,end_date:null}, "2026-09-19"), "itinerary");
  assert.equal(tripOpeningTab({...trip,end_date:null}, "2026-09-20"), "overview");
});
test("explicit authorized tabs take priority but inaccessible tabs cannot open", () => {
  const allowed = ["overview","packing","itinerary","tasks"];
  assert.equal(openingTabForLink(trip,"2026-09-19","tasks",allowed),"tasks");
  assert.equal(openingTabForLink(trip,"2026-09-18","itinerary",allowed),"itinerary");
  assert.equal(openingTabForLink(trip,"2026-09-19","budget",allowed),"itinerary");
});
test("home selection prioritizes current over tomorrow and is stable without mutation", () => {
  const rows = [{...trip,id:"tomorrow",start_date:"2026-09-20"}, {...trip,id:"older",start_date:"2026-09-17"}, trip];
  const before = structuredClone(rows);
  assert.equal(homeOpeningTrip(rows,"2026-09-19").id,"one");
  assert.deepEqual(rows,before);
  assert.equal(homeOpeningTrip(rows,"2026-09-25"),null);
});
test("automatic home route preserves list navigation, filters and date rollover", () => {
  const params = value => new URLSearchParams(value);
  assert.equal(homeOpeningPath([trip],"2026-09-18",params("arrival=1")),"/trips/alaska-2345ab?tab=packing");
  assert.equal(homeOpeningPath([trip],"2026-09-21",params("arrival=1")),"/trips/alaska-2345ab?tab=itinerary");
  for (const query of ["","view=upcoming","arrival=1&view=past","arrival=1&view=drafts"])
    assert.equal(homeOpeningPath([trip],"2026-09-21",params(query)),null);
  assert.equal(homeOpeningPath([],"2026-09-21",params("arrival=1")),null);
  assert.equal(homeOpeningPath([{...trip,slug:null,public_id:null}],"2026-09-21",params("arrival=1")),null);
});
test("date arithmetic covers leap day, New Year and daylight saving boundaries", () => {
  for (const [start, eve] of [["2028-03-01","2028-02-29"],["2027-01-01","2026-12-31"],["2026-03-09","2026-03-08"],["2026-11-02","2026-11-01"]])
    assert.equal(tripOpeningTab({...trip,start_date:start,end_date:start},eve),"packing");
});
test("integration retains authorization and roster filtering before home selection", () => {
  const read = path => readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
  const server = read("app/trips/page.js");
  assert.match(server,/canSeeTrip\(\{ \.\.\.trip, family_id: familyId \}, access, allowedTripIds\)/);
  assert.match(server,/arrivalTrips=\{all.filter/);
  assert.match(server,/row.trip_id === trip.id && row.traveler_id === travelerId/);
  // Signing in lands on Now, the home screen. The automatic jump into a trip
  // that ?arrival=1 used to trigger is retired with it: nothing in the app sends
  // that parameter any more, and Now answers the question it was guessing at.
  assert.match(read("app/page.js"),/redirect\("\/now"\)/);
  for (const path of ["app/page.js","app/auth/land/route.js","app/auth/callback/route.js"])
    assert.doesNotMatch(read(path),/"\/trips\?arrival=1"/);
  const view = read("components/TripView.js");
  assert.match(view,/openedTripRef.current === key/);
  assert.match(view,/openingTabForLink\(trip, localToday\(\), wanted, tabs.map/);
  assert.match(read("components/Itinerary.js"),/livedDay\(today, localToday\(\), dayKeys\)/);
});
test("child current-trip banner stays inside the restricted view and clears with access", () => {
  const ui = readFileSync(new URL("../app/child/MinorReview.js",import.meta.url),"utf8");
  const banner = readFileSync(new URL("../app/child/ChildCurrentTripBanner.js",import.meta.url),"utf8");
  assert.match(ui,/data\?\.enabled && currentTrip && <ChildCurrentTripBanner/);
  assert.match(ui,/filter\(row => isCurrentTrip\(row, today\)\)/);
  assert.match(ui,/setTripId\(currentTrip.id\); setTripGroup\("upcoming"\); setSelectedDay\(null\); setTab\("itinerary"\)/);
  assert.doesNotMatch(banner,/href=|fetch\(|next\/|AskAly/);
  assert.match(banner,/sticky top-0/);
});
