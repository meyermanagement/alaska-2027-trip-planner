import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("../lib/childView/keyPolicy.js",import.meta.url),"utf8");
const {hasFreshParentSignIn:fresh,normalizeRecoveryCode:normalize,validRecoveryCode:valid,parentKeyLabel:label}=
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("freshness uses verified AMR, not refresh-token issuance",()=>{
  const now=2000000, timestamp=now/1000-30;
  assert.equal(fresh({amr:[{method:"password",timestamp}]},now),true);
  assert.equal(fresh({amr:[{method:"oauth",timestamp}]},now),true);
  for(const claims of [null,{}, {iat:timestamp}, {amr:["password"]},
    {amr:[{method:"password",timestamp:now/1000-301}]},
    {amr:[{method:"password",timestamp:now/1000+1}]},
    {amr:[{method:"anonymous",timestamp}]}, {amr:[{method:"password",timestamp:String(timestamp)}]}])
    assert.equal(fresh(claims,now),false);
});
test("recovery code has 192 bits of random material with friendly separators",()=>{
  assert.equal(normalize("aabbcc-dd eeff"),"AABBCCDDEEFF");
  assert.equal(valid("a".repeat(48)),true);
  for(const value of [null,"a".repeat(47),"x".repeat(48),{},["a"]]) assert.equal(valid(value),false);
  assert.equal(label("  Phone  "),"Phone");
  assert.equal(label("x".repeat(100)).length,60);
});
test("recovery has no child API escape hatch or persisted plaintext code",()=>{
  const constants=readFileSync(new URL("../lib/childView/constants.js",import.meta.url),"utf8");
  assert.equal(constants.includes("parent-keys"),false);
  const ui=readFileSync(new URL("../app/family/child-access/ParentKeySettings.js",import.meta.url),"utf8");
  assert.equal(/localStorage|sessionStorage/.test(ui),false);
  assert.match(ui,/type="password"/);
  const route=readFileSync(new URL("../app/api/family/parent-keys/route.js",import.meta.url),"utf8");
  assert.match(route,/hasFreshParentSignIn\(ctx.claims\)/);
  assert.match(route,/requireUserVerification: true/);
  assert.match(route,/requestOrigin\(request\)/);
});
