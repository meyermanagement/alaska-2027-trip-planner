import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const text=readFileSync(new URL("../lib/childView/keyAlerts.js",import.meta.url),"utf8")
  .replace('import { sendEmail } from "@/lib/email/send";','const sendEmail=()=>{throw new Error("Real mail forbidden in tests");};');
const {deliverParentKeyAlerts:deliver}=await import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`);
function fake(){
  const changes=[];
  const row={id:"alert",guardian_user_id:"parent",kind:"recover",created_at:"2026-09-19T12:00:00Z",attempts:0};
  return {changes,admin:{auth:{admin:{getUserById:async()=>({data:{user:{email:"parent@test.invalid"}}})}},
    from:table=>{
      let action="select",payload;
      const chain={
        select:()=>chain,is:()=>chain,or:()=>chain,order:()=>chain,limit:()=>chain,eq:()=>chain,
        lt:()=>chain,not:()=>chain,
        update:values=>{action="update";payload=values;changes.push([table,values]);return chain;},
        delete:()=>{action="delete";return chain;},
        maybeSingle:async()=>({data:{id:"alert"}}),
        then:(resolve,reject)=>Promise.resolve(action==="select"?{data:[row]}:{data:null,error:null}).then(resolve,reject),
      };
      return chain;
    }}};
}
test("security alerts go to the parent's account and never contain recovery secrets",async()=>{
  const {admin,changes}=fake();let mail;
  const result=await deliver(admin,"parent",async message=>{mail=message;return {ok:true};});
  assert.equal(result.sent,1);assert.equal(result.pending,false);
  assert.equal(mail.to,"parent@test.invalid");assert.match(mail.text,/Previous passkeys/);
  assert.doesNotMatch(mail.text,/token_hash|public_key|AABBCC|recovery_hash/);
  assert.ok(changes.some(([,value])=>value.sent_at));
});
test("failed sends remain queued and never claim delivery",async()=>{
  const {admin,changes}=fake();
  const result=await deliver(admin,"parent",async()=>({ok:false,error:"Unconfigured"}));
  assert.equal(result.sent,0);assert.equal(result.pending,true);
  assert.equal(changes.some(([,value])=>value.sent_at),false);
  assert.ok(changes.some(([,value])=>value.claimed_until===null));
});
test("unexpected transport failure remains retryable after its lease expires",async()=>{
  const {admin,changes}=fake();
  const result=await deliver(admin,"parent",async()=>{throw new Error("Offline");});
  assert.equal(result.sent,0);assert.equal(result.pending,true);
  assert.equal(changes.some(([,value])=>value.sent_at),false);
  assert.ok(changes[0][1].claimed_until);
});
