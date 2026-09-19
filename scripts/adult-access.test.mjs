import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const jiti=createJiti(import.meta.url,{alias:{"@":fileURLToPath(new URL("..",import.meta.url))}});
const {cleanAdultConsent,validAdultToken,adultEmailMatches}=jiti("../lib/adultAccess/validation.js");
const {adultInviteEmail}=jiti("../lib/email/adultInvite.js");
const versions={agreementVersion:"current",privacyVersion:"current",appBuild:"review",featureIds:["mail","documents"]};
const base={agreementVersion:"current",privacyVersion:"current",agreed:true,ageConfirmed:true,dataAcknowledged:true,sharingAcknowledged:true};
test("adult consent is personal, strict, current and optional-off by default",()=>{
  const result=cleanAdultConsent(base,versions);
  assert.equal(result.ai_processing,false); assert.equal(result.diagnostics,false);
  assert.deepEqual(result.features,{mail:false,documents:false});
  for(const key of ["agreed","ageConfirmed","dataAcknowledged","sharingAcknowledged"]) {
    assert.throws(()=>cleanAdultConsent({...base,[key]:"true"},versions),/required/);
  }
  assert.throws(()=>cleanAdultConsent({...base,agreementVersion:"old"},versions),/changed/);
  assert.deepEqual(cleanAdultConsent({...base,features:{mail:true,documents:"yes",admin:true}},versions).features,{mail:true,documents:false});
});
test("mailbox capability validation and exact normalized email match",()=>{
  assert.equal(validAdultToken("a".repeat(43)),true);
  for(const value of [null,"abc","a".repeat(44),"<script>"]) assert.equal(validAdultToken(value),false);
  assert.equal(adultEmailMatches(" Adult@example.com ","adult@example.com"),true);
  assert.equal(adultEmailMatches("parent@example.com","adult@example.com"),false);
});
test("invitation copy never promises manager access and escapes email content",()=>{
  const mail=adultInviteEmail({email:'<adult>@example.com',url:"https://example.com/auth/adult-access#token"});
  assert.match(mail.text,/secondary traveler/); assert.match(mail.text,/48 hours/);
  assert.match(mail.html,/&lt;adult&gt;/); assert.doesNotMatch(mail.html,/<adult>/);
  assert.match(mail.text,/parent cannot accept/);
});
test("release stays disabled by default and acceptance has no diagnostic listeners",()=>{
  const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
  assert.match(read("lib/adultAccess/server.js"),/ADULT_ACCESS_INVITES_ENABLED === "true"/);
  assert.match(read("components/AppServices.js"),/path.startsWith\("\/auth\/adult-access"\)/);
  assert.match(read("app/auth/adult-access/AdultAcceptance.js"),/history.replaceState/);
  assert.doesNotMatch(read("app/auth/adult-access/AdultAcceptance.js"),/localStorage|sessionStorage/);
});
