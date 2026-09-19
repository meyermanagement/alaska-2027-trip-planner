import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../lib/inbox/parser.js",import.meta.url),"utf8");
// Load the actual parser with external dependencies replaced by controlled
// adapters. No real model calls, private emails or production database writes.
const stripped=source.replace(/^import .* from .*;\n/gm,"");
const adapters=`
const createAdminClient=()=>null;
const householdAiAllowed=async()=>globalThis.inboxTest.consent;
const usageFrom=m=>m||{};
const recordUsage=async(_db,usage)=>{globalThis.inboxTest.usage.push(usage)};
const normalizeCovers=x=>Array.isArray(x)?x:[];
const fareSourceFor=()=>null;
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
test("route requires verified session, primary access and mail consent before starting",()=>{
  const route=readFileSync(new URL("../app/api/inbox/[id]/reprocess/route.js",import.meta.url),"utf8");
  assert.match(route,/supabase\.auth\.getUser/);assert.match(route,/account_session_allowed/);
  assert.match(route,/access\.can\.isSecondary/);assert.match(route,/requestOrigin\(request\)/);
  assert.ok(route.indexOf("if (!consent.allowed)")<route.indexOf('admin.rpc("begin_inbox_reprocess"'));
  assert.match(route,/AbortSignal\.timeout\(90_000\)/);
  assert.match(route,/eq\("message_id", id\)/);
});
