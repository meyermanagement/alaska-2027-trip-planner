import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti=createJiti(import.meta.url,{alias:{"@":fileURLToPath(new URL("..",import.meta.url))}});
const { minorRouteAllowed }=jiti("../lib/beta/minorRoutes.js");
const { validateMinorReview }=jiti("../lib/beta/minorReview.js");
const read=path=>readFileSync(new URL(`../${path}`,import.meta.url),"utf8");
test("minor route allowlist denies deep links, mutation, forged paths, and AI routes",()=>{
  for(const path of ["/child","/api/child","/auth/land","/auth/callback"]) assert.equal(minorRouteAllowed(path),true);
  for(const path of ["/api/chat","/api/tips","/api/child/extra","/family","/trips/123","/login/qa","/api/account/delete"]) assert.equal(minorRouteAllowed(path),false);
  assert.equal(minorRouteAllowed("/api/child","POST"),false);
  const middleware=read("middleware.js");
  assert.ok(middleware.indexOf("const age = await accountAge") < middleware.indexOf("const consentCookie ="));
});
test("new parent flow has no optional child AI permission",()=>{
  assert.equal(validateMinorReview({guardian:true,collection:true}),null);
  assert.ok(validateMinorReview({guardian:true,collection:true,askAly:true,aiDisclosure:true}));
  assert.ok(validateMinorReview({guardian:true,collection:false}));
  assert.doesNotMatch(read("app/family/child-access/ChildAccessPanel.js"),/choices.askAly|choices.aiDisclosure|Waiting for parent verification/);
});
test("minor surface has no adult chrome, writes, or model calls and clears stale data",()=>{
  const ui=read("app/child/MinorReview.js");
  assert.doesNotMatch(ui,/TopBar|ChatPanel|geolocation|method: "(POST|PATCH|DELETE)"|type="checkbox"/);
  assert.match(ui,/setData\(null\)/);
  assert.match(ui,/visibilitychange/);
  assert.match(read("components/AppServices.js"),/path === "\/child".*return null/);
  assert.doesNotMatch(read("app/api/child/route.js"),/createAdminClient|generate|loadEverything/);
});
