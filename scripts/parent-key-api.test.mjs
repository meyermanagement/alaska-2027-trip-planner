import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
const policy=await import(`data:text/javascript;base64,${Buffer.from(read("lib/childView/keyPolicy.js")).toString("base64")}`);
// Execute the real route with isolated identity, database and authenticator adapters.
let ctx, calls, jar, fresh, invalidSignature, grantKind, authorizeOK, challengeFail;
const hash=value=>createHash("sha256").update(value).digest("hex");
const fake={
  ...policy,
  NextResponse:{json:(data,init)=>new Response(JSON.stringify(data),init)},
  cookies:async()=>({get:key=>jar.has(key)?{value:jar.get(key)}:undefined,set:(k,v)=>jar.set(k,v),delete:k=>jar.delete(k)}),
  randomBytes:n=>Buffer.alloc(n,7),randomToken:()=>"g".repeat(43),hashToken:hash,
  cookieOptions:{httpOnly:true},privateHeaders:{"Cache-Control":"private, no-store"},
  parentContext:async()=>{if(!ctx)throw new Error("Please sign in again.");return ctx;},
  requestOrigin:request=>{if(request.headers.get("origin")!=="https://www.alyeska.app")throw new Error("Bad origin");return {origin:"https://www.alyeska.app",rpID:"alyeska.app"};},
  keysFor:async()=>[{credential_id:"parent-key",transports:[],label:"My phone"}],
  issueChallenge:async(...args)=>{calls.push(["challenge",...args.slice(2)]);},
  consumeChallenge:async(...args)=>{calls.push(["consume",...args.slice(2)]);if(challengeFail)throw new Error("Expired");return "challenge";},
  verifyParentKey:async()=>{if(invalidSignature)throw new Error("raw secret from library");return "parent-key";},
  generateAuthenticationOptions:async options=>({challenge:"challenge",...options}),
  generateRegistrationOptions:async options=>({challenge:"registration",...options}),
  verifyRegistrationResponse:async()=>{if(invalidSignature)throw new Error("CBOR diagnostic");return {verified:true,registrationInfo:{userVerified:true,credential:{id:"replacement",publicKey:Buffer.from("key"),counter:0,transports:[]}}};},
  deliverParentKeyAlerts:async()=>({sent:1,pending:false}),
};
globalThis.__parentKeyRouteTest=fake;
const transformed=read("app/api/family/parent-keys/route.js").replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm,"");
const moduleCode=`const {${Object.keys(fake).join(",")}}=globalThis.__parentKeyRouteTest;\n${transformed}`;
const api=await import(`data:text/javascript;base64,${Buffer.from(moduleCode).toString("base64")}`);
function reset(){
  calls=[];jar=new Map();fresh=true;invalidSignature=false;grantKind="recover";authorizeOK=true;challengeFail=false;
  ctx={user:{id:"parent",email:"parent@test.invalid"},sessionId:"adult-session",
    get claims(){return {amr:[{method:"password",timestamp:Date.now()/1000-(fresh?10:600)}]};},
    admin:{
      rpc:async(name,args)=>{calls.push([name,args]);return {data:authorizeOK,error:null};},
      from:table=>{
        const chain={select:()=>chain,eq:()=>chain,gt:()=>chain,
          maybeSingle:async()=>({data:table==="parent_key_grants"?{kind:grantKind}:{recovery_created_at:null},error:null})};
        return chain;
      },
    },
  };
}
async function post(body,origin="https://www.alyeska.app"){
  const response=await api.POST(new Request("https://www.alyeska.app/api/family/parent-keys",
    {method:"POST",headers:{"Content-Type":"application/json",origin},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json(),headers:response.headers};
}
test("parent-key API checks authenticated parent, origin and fresh sign-in before recovery",async()=>{
  reset();ctx=null;assert.equal((await post({action:"recover",code:"a".repeat(48)})).status,400);assert.equal(calls.length,0);
  reset();assert.equal((await post({action:"recover"},"https://evil.invalid")).status,400);assert.equal(calls.length,0);
  reset();fresh=false;const r=await post({action:"recover",code:"a".repeat(48),freshSignIn:true});
  assert.equal(r.status,403);assert.equal(r.body.needsSignIn,true);assert.equal(calls.length,0);
});
test("recovery hashes code, scopes grant, and still requires WebAuthn registration",async()=>{
  reset();const result=await post({action:"recover",code:"aa-".repeat(24)});
  assert.equal(result.status,200);assert.equal(result.body.options.authenticatorSelection.userVerification,"required");
  const auth=calls.find(c=>c[0]==="authorize_parent_key_change")[1];
  assert.equal(auth.code_hash,hash("A".repeat(48)));assert.equal(auth.parent_id,"parent");
  assert.equal(auth.adult_session,"adult-session");assert.equal(auth.verified_key,null);
  assert.equal(calls.some(c=>c[0]==="finish_parent_key_change"),false);
  assert.equal(jar.get("alyeska-parent-key-grant"),"g".repeat(43));
});
test("malformed codes still count as attempts; failed proof never registers a key",async()=>{
  reset();authorizeOK=false;const r=await post({action:"recover",code:"wrong"});
  assert.equal(r.status,403);assert.equal(calls[0][1].code_hash,null);assert.equal(jar.size,0);
});
test("forged key-management fields cannot bypass authentication",async()=>{
  reset();invalidSignature=true;
  const r=await post({action:"auth-verify",kind:"add",response:{id:"parent-key"},verified:true});
  assert.equal(r.status,400);assert.equal(JSON.stringify(r.body).includes("raw secret"),false);
  assert.equal(calls.some(c=>c[0]==="authorize_parent_key_change"),false);
  reset();const bad=await post({action:"auth-verify",kind:"recover"});
  assert.equal(bad.status,400);assert.equal(calls.length,0);
});
test("registration is session-bound, rechecks freshness and rotates code after verified replacement",async()=>{
  reset();jar.set("alyeska-parent-key-grant","g".repeat(43));fresh=false;
  assert.equal((await post({action:"register-verify"})).status,403);
  assert.equal(calls.some(c=>c[0]==="finish_parent_key_change"),false);
  reset();jar.set("alyeska-parent-key-grant","g".repeat(43));invalidSignature=true;
  assert.equal((await post({action:"register-verify"})).status,400);
  assert.equal(calls.some(c=>c[0]==="finish_parent_key_change"),false);
  reset();jar.set("alyeska-parent-key-grant","g".repeat(43));
  const r=await post({action:"register-verify",response:{},label:"New phone"});
  assert.equal(r.status,200);assert.equal(policy.validRecoveryCode(r.body.recoveryCode),true);
  const finish=calls.find(c=>c[0]==="finish_parent_key_change")[1];
  assert.equal(finish.key_id,"replacement");assert.equal(finish.next_recovery_hash,hash(policy.normalizeRecoveryCode(r.body.recoveryCode)));
  assert.equal(r.headers.get("cache-control"),"private, no-store");assert.equal(jar.size,0);
});
test("expired challenge blocks add and registration and cannot leak credential diagnostics",async()=>{
  reset();challengeFail=true;assert.equal((await post({action:"auth-verify",kind:"add"})).status,400);
  assert.equal(calls.some(c=>c[0]==="authorize_parent_key_change"),false);
  reset();challengeFail=true;jar.set("alyeska-parent-key-grant","g".repeat(43));
  assert.equal((await post({action:"register-verify"})).status,400);
  assert.equal(calls.some(c=>c[0]==="finish_parent_key_change"),false);
});
