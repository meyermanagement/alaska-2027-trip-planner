import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const client=await import("data:text/javascript;base64,"+Buffer.from(source("lib/childView/client.js")).toString("base64"));
const route=source("app/api/family/child-access/route.js");
test("saved approval is server-owned, not a caller-supplied boolean",()=>{
  assert.match(route,/freshly_verified: !savedEntry/);
  assert.match(route,/if \(!savedEntry\) \{[\s\S]*consumeChallenge[\s\S]*verifyParentKey/);
  assert.match(route,/const relyingParty = requestOrigin\(request\)/);
  assert.match(route,/const ctx = await parentContext\(\)/);
  assert.match(route,/body.action === "open-saved"/);
  assert.doesNotMatch(route,/freshly_verified: body/);
});
test("return still requires a verified passkey and fresh adult login",()=>{
  const text=source("app/api/child/return/route.js");
  assert.match(text,/await verifyParentKey/);
  assert.match(text,/next: "\/login\?next=%2Ffamily"/);
  assert.doesNotMatch(text,/canOpenDirectly|open-saved/);
});
test("client entry, fallback, cleanup, and failure behavior",async t=>{
  const original={};
  for(const key of ["window","localStorage","sessionStorage","navigator","caches","fetch"])
    original[key]=Object.getOwnPropertyDescriptor(globalThis,key);
  let events=[],state,postError;
  const put=(key,value)=>Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const reset=()=>{
    events=[];postError=null;state={passkeyReady:true,children:[{id:"child",canOpenDirectly:true}]};
    put("window",{location:{assign:url=>events.push(["setup",url]),replace:url=>events.push(["child",url])}});
    put("localStorage",{adult:"private",removeItem:key=>events.push(["remove",key]),setItem:()=>events.push(["broadcast"])});
    put("sessionStorage",{clear:()=>events.push(["clear-session"])});
    put("navigator",{serviceWorker:{getRegistrations:async()=>[{
      pushManager:{getSubscription:async()=>({unsubscribe:async()=>events.push(["unsubscribe"])})},
      unregister:async()=>events.push(["unregister"]),
    }]}});
    put("caches",{keys:async()=>["adult"],delete:async()=>events.push(["delete-cache"])});
    window.caches=globalThis.caches;
    put("fetch",async(url,opts={})=>{
      events.push([opts.method==="POST"?"post":"get",opts.body?JSON.parse(opts.body):null]);
      if(opts.method==="POST") {
        if(postError) return new Response(JSON.stringify(postError),{status:409});
        return new Response(JSON.stringify({next:"/child"}));
      }
      return new Response(JSON.stringify(state));
    });
  };
  try {
    await t.test("approved click clears adult state then opens directly",async()=>{
      reset();await client.openSavedChildView("child");
      const names=events.map(e=>e[0]);
      assert.equal(names[0],"get");
      assert.ok(names.indexOf("delete-cache")<names.indexOf("post"));
      assert.ok(names.indexOf("unsubscribe")<names.indexOf("post"));
      assert.ok(names.indexOf("post")<names.indexOf("broadcast"));
      assert.equal(names.at(-1),"child");
      assert.deepEqual(events.find(e=>e[0]==="post")[1],{action:"open-saved",travelerId:"child"});
    });
    for(const kind of ["approval","passkey"]) await t.test(`missing ${kind} goes to setup without handoff`,async()=>{
      reset();if(kind==="approval")state.children[0].canOpenDirectly=false;else state.passkeyReady=false;
      await client.openSavedChildView("child");
      assert.deepEqual(events.map(e=>e[0]),["get","setup"]);
    });
    await t.test("revoked between check and click redirects to setup",async()=>{
      reset();postError={error:"Setup required",setupRequired:true};
      await client.openSavedChildView("child");
      assert.equal(events.at(-1)[0],"setup");
      assert.equal(events.some(e=>e[0]==="broadcast"),false);
    });
    await t.test("missing child and network failure do not hand off",async()=>{
      reset();await assert.rejects(client.openSavedChildView("other"),/not available/);
      assert.deepEqual(events.map(e=>e[0]),["get"]);
      reset();put("fetch",async()=>{throw new Error("Network unavailable");});
      await assert.rejects(client.openSavedChildView("child"),/Network/);
      assert.equal(events.length,0);
    });
    await t.test("failed open never broadcasts or navigates to child",async()=>{
      reset();postError={error:"Session no longer valid"};
      await assert.rejects(client.openSavedChildView("child"),/Session/);
      assert.equal(events.some(e=>["child","broadcast"].includes(e[0])),false);
    });
  } finally {
    for(const [key,desc] of Object.entries(original)) {
      if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];
    }
  }
});
