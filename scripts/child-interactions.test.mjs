import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const jiti=createJiti(import.meta.url,{alias:{"@":fileURLToPath(new URL("..",import.meta.url))}});
const { validPacking, validTheme, coverPath, publicChildData }=jiti("../lib/childView/interactions.js");
const { childViewRouteAllowed, CHILD_VIEW_NOTICE }=jiti("../lib/childView/constants.js");
const { MINOR_REVIEW_NOTICE_VERSION, validateMinorReview }=jiti("../lib/beta/minorReview.js");
const { tripDays, itemsOnDay, groupChildTrips }=jiti("../lib/childView/days.js");
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
