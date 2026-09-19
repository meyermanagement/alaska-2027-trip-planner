import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const dataModule=code=>`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const periodCode=readFileSync(new URL("../lib/history/periods.js",import.meta.url),"utf8");
const {historyDay,historyPeriod,groupHistory,newestHistoryDate}=await import(dataModule(periodCode));
const cursorCode=readFileSync(new URL("../lib/history/inboxCursor.js",import.meta.url),"utf8");
const {encodeInboxCursor,decodeInboxCursor,inboxCursorFilter}=await import(dataModule(cursorCode));
const browseCode=readFileSync(new URL("../lib/reviews/browse.js",import.meta.url),"utf8")
  .replace('"../history/periods"',JSON.stringify(dataModule(periodCode)));
const {browsePlaces,defaultGroupBy}=await import(dataModule(browseCode));
const today="2026-09-19";

test("history uses calendar month and year labels without exact-date headings",()=>{
  assert.deepEqual(["2026-09-18","2026-08-01","2026-01-15","2025-12-20","2024-05-02","2023-02-12"]
    .map(day=>historyPeriod(day,today).label),
    ["This month","Last month","Earlier this year","Last year","2 years ago","3 years ago"]);
});
test("January previous month takes precedence over previous year",()=>{
  assert.equal(historyPeriod("2025-12-31","2026-01-01").label,"Last month");
  assert.equal(historyPeriod("2025-11-30","2026-01-01").label,"Last year");
  assert.equal(historyPeriod("2024-02-29","2026-01-01").label,"2 years ago");
});
test("date-only values stay on their calendar day while timestamps use household time",()=>{
  assert.equal(historyDay("2026-09-01"),"2026-09-01");
  assert.equal(historyDay("2026-09-01T03:00:00Z"),"2026-08-31");
  assert.equal(historyDay("2026-09-01T05:00:00Z"),"2026-09-01");
  assert.equal(historyDay("2026-02-30"),null);
});
test("unknown dates remain visible last; future dates are not mislabeled as history",()=>{
  const items=[{date:"bad"},{date:"2024-01-01"},{date:"2026-09-21"}];
  assert.deepEqual(groupHistory(items,i=>i.date,today).map(i=>i.label),["Upcoming","2 years ago","Date unknown"]);
  assert.equal(groupHistory(items,i=>i.date,today).flatMap(i=>i.items).length,items.length);
});
test("grouping is newest first, stable, and leaves input untouched",()=>{
  const items=[{id:1,date:"2025-03-01"},{id:2,date:"2026-09-02"},{id:3,date:"2026-09-10"}];
  const before=JSON.stringify(items);
  assert.deepEqual(groupHistory(items,i=>i.date,today).flatMap(g=>g.items).map(i=>i.id),[3,2,1]);
  assert.equal(JSON.stringify(items),before);
  assert.equal(newestHistoryDate(["2026-08-31","2026-09-05",null]),"2026-09-05");
});
test("review date grouping is default, retains filters/search and chosen inner sort",()=>{
  assert.equal(defaultGroupBy(2),"date");assert.equal(defaultGroupBy(20),"date");
  const items=[
    {id:"a",title:"Zebra Hotel",item_date:"2026-09-15",trip_id:"t",rating:5},
    {id:"b",title:"Alpha Hotel",item_date:"2026-09-10",trip_id:"t",rating:4},
    {id:"c",title:"Old Hotel",item_date:"2025-03-10",trip_id:"old",rating:3},
  ];
  const view=browsePlaces({items,by:"date",today,sort:"name"});
  assert.deepEqual(view.sections[0].items.map(i=>i.id),["b","a"]);
  assert.deepEqual(view.open,[view.sections[0].key]);
  const searched=browsePlaces({items,by:"date",today,query:"hotel"});
  assert.equal(searched.open.length,2);
  assert.equal(browsePlaces({items,by:"date",today,tripId:"old"}).shown,1);
});
test("inbox cursor preserves timestamp/id ties and null-date tail",()=>{
  const row={id:"11111111-1111-4111-8111-111111111111",received_at:"2026-09-19T12:34:56.123456+00:00"};
  const decoded=decodeInboxCursor(encodeInboxCursor(row));
  assert.deepEqual(decoded,{at:row.received_at,id:row.id});
  assert.match(inboxCursorFilter(decoded),/id.lt.11111111/);
  assert.match(inboxCursorFilter(decoded),/received_at.is.null$/);
  const undated=decodeInboxCursor(encodeInboxCursor({...row,received_at:null}));
  assert.equal(inboxCursorFilter(undated),`and(received_at.is.null,id.lt.${row.id})`);
});
test("cursor rejects malformed and injected filter values",()=>{
  for(const payload of [
    {at:"2026-09-19T00:00:00Z),id.neq.foo",id:"11111111-1111-4111-8111-111111111111"},
    {at:"2026-09-19T00:00:00Z",id:"not-a-uuid"},
    {at:"invalid",id:"11111111-1111-4111-8111-111111111111"},
  ]) assert.throws(()=>decodeInboxCursor(Buffer.from(JSON.stringify(payload)).toString("base64url")));
  assert.throws(()=>decodeInboxCursor("x".repeat(501)));
});
test("grouped histories retain the whole email group; cleared tips are not changed",()=>{
  const deals=readFileSync(new URL("../components/Deals.js",import.meta.url),"utf8");
  assert.match(deals,/<HistoryGroups items=\{groupFareAlerts\(rows\)\}/);
  const inbox=readFileSync(new URL("../app/api/inbox/cleared/route.js",import.meta.url),"utf8");
  assert.match(inbox,/\.eq\("family_id", familyId\)/);
  assert.match(inbox,/\.limit\(61\)/);
  assert.match(inbox,/nextCursor:/);
  const tips=readFileSync(new URL("../components/ClearedTips.js",import.meta.url),"utf8");
  assert.doesNotMatch(tips,/HistoryGroups/);
});
