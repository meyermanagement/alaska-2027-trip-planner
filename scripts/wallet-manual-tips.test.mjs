import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { walletLookDue, claimWalletLook, heldProgramForTip, WALLET_DAY_MS } = jiti("../lib/tips/walletAuto.js");
const { runLook } = jiti("../lib/tips/run.js");

test("Wallet separates owned-program tips from manually requested offers", () => {
  const page = readFileSync(new URL("../app/wallet/page.js", import.meta.url), "utf8");
  const panels = page.split("<ProTips").slice(1);
  assert.equal(panels.length, 2);
  assert.match(panels[0], /tip.scope === "wallet"/);
  assert.match(panels[0], /autoLook=\{hasHeldPrograms && !programsError\}/);
  assert.match(panels[0], /lastLookedAt=\{family\?\.wallet_looked_at\}/);
  assert.match(panels[1], /tip.scope === "offers"/);
  assert.match(panels[1], /autoLook=\{false\}/);
  assert.match(panels[1], /lookLabel="See offers"/);
  assert.doesNotMatch(page, /chain=/);
});

test("daily gate uses the same rolling day across time zones and handles missing stamps", () => {
  const now = Date.parse("2026-09-20T15:00:00Z");
  for (const stamp of [null, "", "invalid", new Date(now-WALLET_DAY_MS).toISOString()]) {
    assert.equal(walletLookDue(stamp, now), true);
  }
  for (const stamp of [now, now-1000, now-WALLET_DAY_MS+1, now+1000]) {
    assert.equal(walletLookDue(new Date(stamp).toISOString(), now), false);
  }
});

test("automatic claim is an atomic family-scoped conditional update and fails closed", async () => {
  const now = Date.parse("2026-09-20T15:00:00Z");
  let stamp = null;
  const calls = [];
  const db = { from(table) {
    const q = {
      update(value) { calls.push(["update", table, value]); return q; },
      eq(field,value) { calls.push(["eq",field,value]); return q; },
      or(filter) { calls.push(["or",filter]); return q; },
      async select() {
        const claimed = walletLookDue(stamp, now);
        if (claimed) stamp = new Date(now).toISOString();
        return { data: claimed ? [{id:"family-a"}] : [] };
      },
    };
    return q;
  }};
  assert.deepEqual(await Promise.all([claimWalletLook(db,"family-a",now),claimWalletLook(db,"family-a",now)]),[true,false]);
  assert.ok(calls.some(c=>c[0]==="eq" && c[1]==="id" && c[2]==="family-a"));
  assert.ok(calls.some(c=>c[0]==="or" && c[1]==="wallet_looked_at.is.null,wallet_looked_at.lte.2026-09-19T15:00:00.000Z"));
  const failed = { from() { const q={update:()=>q,eq:()=>q,or:()=>q,select:async()=>({error:{message:"denied"}})}; return q; } };
  await assert.rejects(claimWalletLook(failed,"family-a"),/Could not check/);
});

test("held tips require an active saved program ID and reject welcome-offer objects", () => {
  const programs=[{id:"card-a",is_active:true},{id:"program-b"},{id:"closed",is_active:false}];
  assert.equal(heldProgramForTip({program_id:"card-a"},programs),programs[0]);
  assert.equal(heldProgramForTip({program_id:"program-b"},programs),programs[1]);
  for(const tip of [{},{program_id:"other"},{program_id:"closed"},{program_id:"card-a",offer:{}}]) {
    assert.equal(heldProgramForTip(tip,programs),null);
  }
});

test("request loop transmits automatic intent only for the explicit automatic check", async () => {
  const bodies=[];
  const fetchImpl=async(url,init)=>{
    bodies.push({url,body:JSON.parse(init.body)});
    return new Response(JSON.stringify({done:true,added:0}),{status:200});
  };
  await runLook({steps:[{scope:"wallet",automatic:true}],fetchImpl});
  await runLook({steps:[{scope:"offers"}],fetchImpl});
  assert.deepEqual(bodies.map(c=>c.body),[{scope:"wallet",automatic:true},{scope:"offers"}]);
});

const source = readFileSync(new URL("../app/api/tips/wallet/route.js", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replaceAll("export const ", "const ").replace("export async function POST", "async function POST");
function setup({scopePrograms=[{id:"held"}], claim=true, user=true, secondary=false, readError=false}={}) {
  const writes=[], models=[], claims=[];
  const supabase={auth:{getUser:async()=>({data:{user:user?{id:"user"}:null}})},from(table){
    let write=false;
    const q={
      select:()=>q, eq:()=>q, in:()=>q, neq:()=>q, or:()=>q, order:()=>q,
      update(value){write=true;writes.push({table,value});return q;},
      then(resolve){return Promise.resolve(write?{data:[]}:
        table==="family_members"?{data:[{family_id:"family-a"}]}:
        table==="rewards_programs"?{data:scopePrograms,error:readError?{message:"failed"}:null}:{data:[]}).then(resolve);}
    }; return q;
  }};
  const route=new Function("NextResponse","createClient","todayISO","resolveAccess","WALLET_SCOPES","walletTips","claimWalletLook","ledgerRow","staleOffers",`${source}\nreturn POST;`)(
    {json:(body,options)=>new Response(JSON.stringify(body),options)},
    async()=>supabase,()=>"2026-09-20",async()=>({can:{isSecondary:secondary}}),
    ["wallet","offers"],async(input)=>{models.push(input);return {tips:[],dropped:[],searched:true};},
    async(...args)=>{claims.push(args);if(claim instanceof Error)throw claim;return claim;},
    ()=>({}),()=>[]
  );
  return {writes,models,claims,send:body=>route(new Request("https://www.alyeska.app/api/tips/wallet",{method:"POST",body:JSON.stringify(body)}))};
}
test("route never automatically runs offers, even with a crafted request",async()=>{
  const q=setup();
  assert.equal((await q.send({scope:"offers",automatic:true})).status,400);
  assert.equal(q.models.length,0); assert.equal(q.claims.length,0);
});
test("route skips duplicate automatic checks and fails closed on claim errors",async()=>{
  for(const [claim,status] of [[false,200],[new Error("cannot claim"),503]]){
    const q=setup({claim});
    assert.equal((await q.send({scope:"wallet",automatic:true})).status,status);
    assert.equal(q.models.length,0);
  }
});
test("manual offers do not stamp or consume the automatic held-program check",async()=>{
  const q=setup();
  assert.equal((await q.send({scope:"offers"})).status,200);
  assert.equal(q.models[0].scope,"offers");
  assert.equal(q.claims.length,0); assert.deepEqual(q.writes,[]);
});
test("automatic tips run one scope; manual tips remain available and stamp completion",async()=>{
  const q=setup();
  await q.send({scope:"wallet",automatic:true});
  assert.deepEqual(q.models.map(m=>m.scope),["wallet"]);
  assert.equal(q.claims.length,1); assert.deepEqual(q.writes,[]);
  await q.send({scope:"wallet"});
  assert.equal(q.models.length,2); assert.equal(q.writes[0].table,"families");
});
test("empty and closed-only wallets never call the model; read errors are not empty wallets",async()=>{
  for(const scopePrograms of [[],[{id:"closed",is_active:false}]]){
    const q=setup({scopePrograms});
    const response=await q.send({scope:"wallet",automatic:true});
    assert.equal(response.status,200);
    assert.match((await response.json()).note,/only checked when you choose See offers/);
    assert.equal(q.models.length,0);
  }
  const q=setup({readError:true});
  assert.equal((await q.send({scope:"offers"})).status,503);
  assert.equal(q.models.length,0);
});
test("signed-out and secondary users cannot claim or run wallet checks",async()=>{
  for(const options of [{user:false},{secondary:true}]){
    const q=setup(options);
    assert.ok((await q.send({scope:"wallet",automatic:true})).status>=400);
    assert.equal(q.models.length,0);assert.equal(q.claims.length,0);
  }
});
