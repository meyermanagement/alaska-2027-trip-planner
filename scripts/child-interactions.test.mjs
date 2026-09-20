import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const jiti=createJiti(import.meta.url,{alias:{"@":fileURLToPath(new URL("..",import.meta.url))}});
const { validPacking, validTheme, coverPath, publicChildData }=jiti("../lib/childView/interactions.js");
const { childViewRouteAllowed, CHILD_VIEW_NOTICE }=jiti("../lib/childView/constants.js");
const { MINOR_REVIEW_NOTICE_VERSION, validateMinorReview }=jiti("../lib/beta/minorReview.js");
const { tripDays, itemsOnDay, dayPackOnDay, groupChildTrips, childOpeningTab, childHomeTrip, childItineraryDay }=jiti("../lib/childView/days.js");
test("child day pack follows selected date and includes everyday items, not unscheduled",()=>{
  const trip={day_pack:[
    {id:"every",item_date:null},{id:"first",item_date:"2027-08-12"},
    {id:"next",item_date:"2027-08-13"},
  ]};
  assert.deepEqual(dayPackOnDay(trip,"2027-08-12").map(x=>x.id),["every","first"]);
  assert.deepEqual(dayPackOnDay(trip,"2027-08-13").map(x=>x.id),["every","next"]);
  assert.deepEqual(dayPackOnDay(trip,"2027-08-14").map(x=>x.id),["every"]);
  assert.deepEqual(dayPackOnDay(trip,"Unscheduled"),[]);
  assert.deepEqual(dayPackOnDay(trip,null),[]);
  assert.deepEqual(dayPackOnDay({},"2027-08-12"),[]);
});
const id="20000000-0000-0000-0000-000000000031";
test("only exact own-item and theme payloads are accepted",()=>{
  assert.equal(validPacking({itemId:id,packed:true}),true);
  assert.equal(validPacking({itemId:id,packed:false}),true);
  for(const body of [null,[],{}, {itemId:id,packed:"true"},{itemId:id,packed:true,assignee:"Other"},{itemId:"../bad",packed:true}]) assert.equal(validPacking(body),false);
  for(const skin of ["aurora","daybreak","journal","frost","sodium"]) assert.equal(validTheme({skin}),true);
  for(const body of [{skin:"other"},{skin:"frost",travelerId:id},{skin:null},[]]) assert.equal(validTheme(body),false);
});
test("child lock only opens the exact new routes and methods",()=>{
  for(const path of ["/api/child/packing","/api/child/theme","/api/child/return"]) {
    assert.equal(childViewRouteAllowed(path,"POST"),true);
    for(const method of ["GET","DELETE","PATCH"]) assert.equal(childViewRouteAllowed(path,method),false);
  }
  assert.equal(childViewRouteAllowed("/api/child/cover","GET"),true);
  assert.equal(childViewRouteAllowed("/api/child/cover","POST"),false);
  for(const path of ["/api/child/theme/extra","/api/chat","/api/tips","/api/skin","/trips","/family","/settings","/api/child/../chat"]) assert.equal(childViewRouteAllowed(path,"POST"),false);
});
test("cover proxy rejects arbitrary URLs and never returns storage URLs to browser",()=>{
  const base="https://project.supabase.co";
  const url=`${base}/storage/v1/object/public/trip-covers/family/${id}-123.png`;
  assert.equal(coverPath(url,base,"family",id),`family/${id}-123.png`);
  for(const bad of [url.replace("project","evil"),url+"?x=1",url+"#a",url.replace("family","other"),url.replace(".png",".svg"),url.replace("-123","-../123"),url.replace("https://","https://user@")]) assert.equal(coverPath(bad,base,"family",id),null);
  const data=publicChildData({enabled:true,trips:[{id,cover_image_url:url}]});
  assert.equal(data.trips[0].cover_image_url,`/api/child/cover?tripId=${id}`);
  assert.deepEqual(publicChildData({enabled:false,trips:[{id}]}),{enabled:false,trips:[]});
});
test("parent must review the new permissions, including stale clients",()=>{
  assert.equal(CHILD_VIEW_NOTICE,MINOR_REVIEW_NOTICE_VERSION);
  assert.ok(validateMinorReview({guardian:true,collection:true,noticeVersion:"2026-09-19-parent-view-1"}));
  assert.equal(validateMinorReview({guardian:true,collection:true,noticeVersion:CHILD_VIEW_NOTICE}),null);
});
test("day navigation includes empty days, ongoing stays, and undated items",()=>{
  const trip={start_date:"2027-08-12",end_date:"2027-08-14",itinerary:[
    {id:"stay",item_date:"2027-08-12",end_date:"2027-08-14"},
    {id:"later",item_date:"2027-08-14"},{id:"undated"}]};
  assert.deepEqual(tripDays(trip),["2027-08-12","2027-08-13","2027-08-14","Unscheduled"]);
  assert.deepEqual(itemsOnDay(trip,"2027-08-13").map(row=>row.id),["stay"]);
  assert.deepEqual(itemsOnDay(trip,"Unscheduled").map(row=>row.id),["undated"]);
});
test("child trips use regular past/upcoming rules with drafts excluded",()=>{
  const row=(name,start,end,status="planning")=>({name,start_date:start,end_date:end,status});
  const input=[
    row("Future","2027-01-01","2027-01-02"), row("Now","2026-09-18","2026-09-19"),
    row("Recent","2026-09-01","2026-09-02"), row("Older","2025-01-01",null),
    row("Complete","2027-02-01","2027-02-02","complete"),
    row("Archive",null,null,"archived"), row("Undated",null,null),
    row("Draft","2026-01-01","2026-01-02","draft"),
  ];
  const before=structuredClone(input);
  const groups=groupChildTrips(input,"2026-09-19");
  assert.deepEqual(groups.upcoming.map(t=>t.name),["Now","Future","Undated"]);
  assert.deepEqual(groups.past.map(t=>t.name),["Complete","Recent","Older","Archive"]);
  assert.deepEqual(input,before);
});
test("a trip stays upcoming through its last day and moves the next day",()=>{
  const trip={name:"One day",start_date:"2026-09-19",end_date:null};
  assert.equal(groupChildTrips([trip],"2026-09-19").upcoming.length,1);
  assert.equal(groupChildTrips([trip],"2026-09-20").past.length,1);
  assert.deepEqual(groupChildTrips([],"2026-09-19"),{upcoming:[],past:[]});
});
test("normal-looking child navigation never mounts adult services or routes",()=>{
  const nav=readFileSync(new URL("../app/child/ChildNavigation.js",import.meta.url),"utf8");
  assert.match(nav,/className="child-menu-dial"/);
  assert.match(nav,/arc-pill group/);
  assert.match(nav,/Upcoming trips/);
  assert.match(nav,/Past trips/);
  assert.match(nav,/navigate\("settings"\)/);
  assert.doesNotMatch(nav,/from.*NavTabs|fetch\(|href=|AskAlyTrigger|useRouter/);
  const ui=readFileSync(new URL("../app/child/MinorReview.js",import.meta.url),"utf8");
  assert.match(ui,/aria-label="Settings"/);
  assert.match(ui,/setTripGroup\(destination\)/);
  assert.match(ui,/tripGroup === "past" \? "Past trips" : "Upcoming trips"/);
});
test("trip tabs use the regular style with packing first and date-aware defaults",()=>{
  const ui=readFileSync(new URL("../app/child/MinorReview.js",import.meta.url),"utf8");
  assert.match(ui,/const CHILD_TRIP_TABS = \[\s*\{ id: "packing", label: "Packing" \},\s*\{ id: "itinerary", label: "Itinerary" \}/);
  assert.match(ui,/setTab\(childOpeningTab\(row, date\)\)/);
  assert.doesNotMatch(ui,/id: "live"|tab === "live"/);
  assert.match(ui,/homeOpenedRef.current/);
  assert.match(ui,/setTab\(childOpeningTab\(openingTrip, date\)\)/);
  assert.match(ui,/childHomeTrip\(data.trips \|\| \[\], date\)/);
  assert.match(ui,/childItineraryDay\(trip, today, selectedDay\)/);
  assert.match(ui,/className="tabbar mt-4 no-print" role="tablist"/);
  assert.match(ui,/onKeyDown=\{tabKeyDown\}/);
  assert.match(ui,/role="tabpanel" id="child-trip-panel"/);
  assert.match(ui,/: "trip-working-header"/);
});
test("opening tab follows departure eve, every trip day, and other dates",()=>{
  const trip={start_date:"2027-03-12",end_date:"2027-03-16",status:"planning"};
  for (const [day,tab] of [["2027-03-10","itinerary"],["2027-03-11","packing"],["2027-03-12","itinerary"],["2027-03-14","itinerary"],["2027-03-16","itinerary"],["2027-03-17","itinerary"]])
    assert.equal(childOpeningTab(trip,day),tab,day);
  assert.equal(childOpeningTab({...trip,end_date:null},"2027-03-12"),"itinerary");
  assert.equal(childOpeningTab({...trip,end_date:null},"2027-03-13"),"itinerary");
});
test("home opens only a current or tomorrow roster trip, preferring current",()=>{
  const row=(id,start_date,end_date,status="planning")=>({id,start_date,end_date,status});
  const current=row("current","2027-03-12","2027-03-16");
  const tomorrow=row("tomorrow","2027-03-15","2027-03-19");
  const trips=[tomorrow,row("future","2027-05-01","2027-05-03"),current];
  const before=structuredClone(trips);
  assert.equal(childHomeTrip(trips,"2027-03-14").id,"current");
  assert.equal(childHomeTrip([tomorrow],"2027-03-14").id,"tomorrow");
  assert.equal(childHomeTrip([current],"2027-03-16").id,"current");
  assert.equal(childHomeTrip([current],"2027-03-17"),null);
  assert.equal(childHomeTrip([current],"2027-03-10"),null);
  assert.equal(childHomeTrip([],"2027-03-14"),null);
  assert.deepEqual(trips,before);
});
test("home ignores inactive trips and has deterministic overlap handling",()=>{
  const trip={id:"b",start_date:"2027-03-12",end_date:"2027-03-16"};
  for(const status of ["draft","complete","archived","cancelled","canceled"])
    assert.equal(childHomeTrip([{...trip,status}],"2027-03-14"),null);
  assert.equal(childHomeTrip([{...trip,archived_at:"yes"},{id:"undated"}],"2027-03-14"),null);
  const a={...trip,id:"a"};
  assert.equal(childHomeTrip([trip,a],"2027-03-14").id,"a");
  assert.equal(childHomeTrip([a,trip],"2027-03-14").id,"a");
  assert.equal(childHomeTrip([trip,{...a,start_date:"2027-03-13"}],"2027-03-14").id,"a");
});
test("itinerary opens today or departure day, respecting an explicit day choice",()=>{
  const trip={start_date:"2027-03-12",end_date:"2027-03-16",itinerary:[{item_date:"2027-03-10"},{item_date:null}]};
  assert.equal(childItineraryDay(trip,"2027-03-11"),"2027-03-12");
  assert.equal(childItineraryDay(trip,"2027-03-14"),"2027-03-14");
  assert.equal(childItineraryDay(trip,"2027-03-14","2027-03-15"),"2027-03-15");
  assert.equal(childItineraryDay(trip,"2027-03-14","Unscheduled"),"Unscheduled");
  assert.equal(childItineraryDay(trip,"2027-03-14","invalid"),"2027-03-14");
});
test("opening tab handles calendar boundaries and inactive or undated trips",()=>{
  for(const [start,previous] of [["2027-01-01","2026-12-31"],["2028-03-01","2028-02-29"],["2027-03-15","2027-03-14"],["2027-11-08","2027-11-07"]])
    assert.equal(childOpeningTab({start_date:start},previous),"packing");
  for(const trip of [null,{}, {start_date:"bad"}, {start_date:"2027-03-12",archived_at:"yes"}, ...["draft","complete","archived","cancelled","canceled"].map(status=>({start_date:"2027-03-12",status}))])
    for(const day of ["2027-03-11","2027-03-12"]) assert.equal(childOpeningTab(trip,day),"itinerary");
});
