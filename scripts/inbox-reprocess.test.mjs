import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../lib/inbox/parser.js",import.meta.url),"utf8");
// Load the actual parser with external dependencies replaced by controlled
// adapters. No real model calls, private emails or production database writes.
const stripped=source.replace(/^import .* from .*;\n/gm,"");
const adapters=`
const fareSourceFor=e=>globalThis.inboxTest.fareSender?"Thrifty Traveler":null;
const createAdminClient=()=>null;
const householdAiAllowed=async()=>globalThis.inboxTest.consent;
const usageFrom=m=>m||{};
const recordUsage=async(_db,usage)=>{globalThis.inboxTest.usage.push(usage)};
const normalizeCovers=x=>Array.isArray(x)?x:[];
const readableFareText=x=>x;
`;
const { extractInboxReview }=await import(`data:text/javascript;base64,${Buffer.from(adapters+stripped).toString("base64")}`);
const oldFetch=global.fetch, oldKey=process.env.GEMINI_API_KEY;
const message={id:"message",family_id:"family",text_body:"Outbound flight at noon",subject:"Travel confirmation",status:"filed"};
let calls=[];
const fakeDb=(files=[])=>({
  from(table){assert.equal(table,"inbox_attachments"); return {select(){return this},eq(){return Promise.resolve({data:files})}}},
  storage:{from(bucket){assert.equal(bucket,"documents");return {download:async()=>({data:new Blob(["fictional PDF"],{type:"application/pdf"})})}}},
});
test.beforeEach(()=>{
  globalThis.inboxTest={consent:{allowed:true,userIds:["user"]},usage:[]}; calls=[];
  process.env.GEMINI_API_KEY="test-only";
  global.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    return new Response(JSON.stringify({usageMetadata:{input:12},candidates:[{content:{parts:[{text:JSON.stringify({
      kind:"booking",items:[{title:"Return flight",category:"flight",item_date:"2027-03-22",confidence:"high"}],
    })}]}}]}));
  };
});
test.after(()=>{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=oldKey;delete globalThis.inboxTest;});
test("reread passes bounded reviewer guidance and normalized proposals without database writes",async()=>{
  const result=await extractInboxReview({supabase:fakeDb(),message,comment:"Find the missing return flight."});
  assert.equal(result.result.items[0].title,"Return flight");
  const parts=calls[0].body.contents[0].parts;
  assert.match(parts[2].text,/Find the missing return flight/);
  assert.match(parts[1].text,/not evidence/);
  assert.equal(globalThis.inboxTest.usage.length,1);
});
test("disabled mail consent blocks provider and attachment access",async()=>{
  globalThis.inboxTest.consent={allowed:false};
  await assert.rejects(extractInboxReview({supabase:{from(){throw new Error("must not download")}},message,comment:"Check dates"}),/Reading forwarded mail is off/);
  assert.equal(calls.length,0);
});
test("PDF-only insurance emails can be reread and unsupported files are explicitly disclosed",async()=>{
  const result=await extractInboxReview({supabase:fakeDb([
    {storage_path:"family/inbox/message/policy.pdf",mime_type:"application/pdf",size_bytes:20},
    {storage_path:"family/inbox/message/file.zip",mime_type:"application/zip",original_filename:"file.zip",size_bytes:20},
  ]),message:{...message,text_body:null},comment:"Read the certificate."});
  assert.equal(calls[0].body.contents[0].parts[3].inlineData.mimeType,"application/pdf");
  assert.match(result.result.warnings[0],/file.zip/);
});
test("missing source and foreign attachments fail without a provider call",async()=>{
  await assert.rejects(extractInboxReview({supabase:fakeDb(),message:{...message,text_body:null},comment:""}),/no retained email/);
  await assert.rejects(extractInboxReview({supabase:fakeDb([{storage_path:"foreign/policy.pdf",mime_type:"application/pdf"}]),message,comment:""}),/could not be verified/);
  assert.equal(calls.length,0);
});
test("a fare alert is reread by the fare reader instead of the booking schema",async()=>{
  // A known fare newsletter never reaches the booking read at all.
  globalThis.inboxTest.fareSender=true;
  const seen=[];
  const readFares=async args=>{seen.push(args);return {saved:2,why:""}};
  const fare={...message,from_email:"deals@thriftytraveler.com",from_name:"Thrifty Traveler",
    text_body:"STL to LHR from 30,000 points",received_at:"2026-09-16T12:00:00Z"};
  const known=await extractInboxReview({supabase:fakeDb(),message:fare,comment:"Find the London fare.",readFares});
  assert.equal(known.result.kind,"fare_alert");
  assert.equal(known.result.saved,2);
  assert.deepEqual(known.result.items,[]);
  assert.equal(known.result.policy,null);
  assert.equal(calls.length,0);
  // The comment is never folded into the text a fare is verified against.
  assert.match(seen[0].text,/STL to LHR from 30,000 points/);
  assert.doesNotMatch(seen[0].text,/Find the London fare/);
  assert.equal(seen[0].messageId,"message");
  assert.equal(seen[0].familyId,"family");
  assert.equal(seen[0].receivedAt,"2026-09-16T12:00:00Z");
  assert.equal(seen[0].consentFor,"user");
  // An unknown sender the model recognizes as a fare alert takes the same door,
  // rather than failing with "No booking or insurance details were found".
  globalThis.inboxTest.fareSender=false;
  global.fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({
    kind:"fare_alert",items:[],passenger_names:[],
  })}]}}]}));
  const guessed=await extractInboxReview({supabase:fakeDb(),message:fare,comment:"",
    readFares:async()=>({saved:0,why:"it leaves from LHR, which is not an airport you fly from"})});
  assert.equal(guessed.result.kind,"fare_alert");
  assert.match(guessed.result.why,/not an airport you fly from/);
});
test("a fare alert with no retained text says so rather than reading nothing",async()=>{
  globalThis.inboxTest.fareSender=true;
  await assert.rejects(extractInboxReview({supabase:fakeDb([
    {storage_path:"family/inbox/message/deal.pdf",mime_type:"application/pdf",size_bytes:20},
  ]),message:{...message,text_body:null,subject:null},comment:"",
    readFares:async()=>{throw new Error("must not read fares without text")}}),/no retained email text to read fares/);
});
test("route requires verified session, primary access and mail consent before starting",()=>{
  const route=readFileSync(new URL("../app/api/inbox/[id]/reprocess/route.js",import.meta.url),"utf8");
  assert.match(route,/supabase\.auth\.getUser/);assert.match(route,/account_session_allowed/);
  assert.match(route,/access\.can\.isSecondary/);assert.match(route,/requestOrigin\(request\)/);
  assert.ok(route.indexOf("if (!consent.allowed)")<route.indexOf('admin.rpc("begin_inbox_reprocess"'));
  assert.match(route,/AbortSignal\.timeout\(90_000\)/);
  assert.match(route,/eq\("message_id", id\)/);
});
