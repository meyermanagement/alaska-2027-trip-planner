import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const code = readFileSync(new URL("../lib/packing/baseList.js", import.meta.url), "utf8");
const { rememberCandidates, baseItemKey, PACKING_ESSENTIALS } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
test("matching ignores whitespace/case but preserves person and pet identity", () => {
  assert.equal(baseItemKey({item:" Phone  charger ",assignee:" AVERY "}),baseItemKey({item:"phone charger",assignee:"avery"}));
  assert.notEqual(baseItemKey({item:"Feed",pet_id:"horse"}),baseItemKey({item:"Feed",pet_id:"dog"}));
  assert.equal(rememberCandidates([
    {item:"Socks",assignee:"Avery"},{item:" socks ",assignee:"Avery"},{item:"Socks",assignee:"Shared"},
    {item:"Hat",stashed_at:"now"},
  ],[{item:"Socks",assignee:"Avery"}]).length,1);
});
test("bulk remembering hides only with no eligible items and reappears for a new one", () => {
  const items=[{item:"Socks",assignee:"Avery",is_packed:true}];
  assert.equal(rememberCandidates(items,[]).length,1);
  assert.equal(rememberCandidates(items,items).length,0);
  assert.equal(rememberCandidates([...items,{item:"Hat"}],items).length,1);
});
test("starter suggestions are individual items with categories, not explanations", () => {
  assert.equal(PACKING_ESSENTIALS.length,8);
  assert.ok(PACKING_ESSENTIALS.every(row => row.item && row.category && !row.notes));
});
test("real app integrates persistent base destination, API and read-only gate", () => {
  const packing=readFileSync(new URL("../components/Packing.js",import.meta.url),"utf8");
  assert.match(packing,/!readOnly && <PackingBaseTools/);
  assert.match(packing,/keepOnBase,/);
  assert.equal((packing.match(/setKeepOnBase\(false\)/g)||[]).length,1); // only deliberate trip-only choice
  assert.match(packing,/baseList.save\("remember", \[row.id\]\)/);
  const api=readFileSync(new URL("../app/api/packing/base/route.js",import.meta.url),"utf8");
  assert.match(api,/requestOrigin\(request\)/);
  assert.match(api,/supabase.auth.getUser/);
  assert.match(api,/supabase.rpc\("packing_base"/);
});
