import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti=createJiti(import.meta.url,{alias:{"@":fileURLToPath(new URL("..",import.meta.url))}});
const { validPacking, validTheme, coverPath, publicChildData }=jiti("../lib/childView/interactions.js");
const { childViewRouteAllowed, CHILD_VIEW_NOTICE }=jiti("../lib/childView/constants.js");
const { MINOR_REVIEW_NOTICE_VERSION, validateMinorReview }=jiti("../lib/beta/minorReview.js");
const { tripDays, itemsOnDay }=jiti("../lib/childView/days.js");
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
