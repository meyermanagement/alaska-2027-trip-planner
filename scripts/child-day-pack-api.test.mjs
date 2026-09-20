import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti=createJiti(import.meta.url,{alias:{"@":fileURLToPath(new URL("..",import.meta.url))}});
const {validPacking}=jiti("../lib/childView/interactions.js");
const source=readFileSync(new URL("../app/api/child/day-pack/route.js",import.meta.url),"utf8")
  .replace(/^import .*;\n/gm,"").replace("export async function POST","async function POST");
const id="20000000-0000-0000-0000-000000000702";
function setup({origin=true,view=true,error=null,throws=false}={}) {
  const calls=[];
  const route=new Function("NextResponse","readView","requestOrigin","privateHeaders","validPacking",`${source}\nreturn POST;`)(
    {json:(body,options)=>new Response(JSON.stringify(body),options)},
    async()=>view?{hash:"server-view-hash",admin:{rpc:async(...args)=>{
      calls.push(args); if(throws) throw Error("unavailable");
      return {data:{id,is_packed:args[1].packed},error};
    }}}:null,
    ()=>{if(!origin) throw Error("wrong origin");},
    {"Cache-Control":"private, no-store"},validPacking);
  return {calls,send:body=>route(new Request("https://www.alyeska.app/api/child/day-pack",{
    method:"POST",headers:{"Content-Type":"application/json"},body:typeof body==="string"?body:JSON.stringify(body),
  }))};
}
test("day-pack route accepts only explicit checkmarks and server-owned identity",async()=>{
  for(const packed of [true,false]) {
    const {calls,send}=setup();
    const result=await send({itemId:id,packed});
    assert.equal(result.status,200);
    assert.deepEqual(await result.json(),{id,is_packed:packed});
    assert.deepEqual(calls,[["set_child_day_pack",{view_hash:"server-view-hash",item_id:id,packed}]]);
    assert.equal(result.headers.get("Cache-Control"),"private, no-store");
  }
});
test("day-pack route rejects bad payloads and forged identity before any write",async()=>{
  for(const body of ["{",null,{},[],{itemId:id,packed:"true"},{itemId:id,packed:true,travelerId:id},{itemId:id,packed:true,view_hash:"forged"}]) {
    const {calls,send}=setup(); assert.equal((await send(body)).status,400); assert.deepEqual(calls,[]);
  }
});
test("day-pack route fails closed on origin, expired view, authorization and database failure",async()=>{
  for(const [options,status,writes] of [
    [{origin:false},403,0],[{view:false},403,0],
    [{error:{code:"42501"}},403,1],[{error:{code:"internal"}},503,1],[{throws:true},503,1],
  ]) {
    const {calls,send}=setup(options);
    assert.equal((await send({itemId:id,packed:true})).status,status);
    assert.equal(calls.length,writes);
  }
});
