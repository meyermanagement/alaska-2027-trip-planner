import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { canCheckDayPack, saveDayPackCheck } = jiti("../lib/daypack/check.js");

test("secondary travelers may check RLS-visible saved rows, never accept tip suggestions", () => {
  const permission = { readOnly: true, userId: "adult-user" };
  for (const assignee of ["Sam", "Shared"]) {
    assert.equal(canCheckDayPack({ kind: "row", rowId: "row", assignee }, permission), true);
  }
  for (const line of [{kind:"tip"}, {kind:"note"}, {kind:"row"}, null]) {
    assert.equal(canCheckDayPack(line, permission), false);
  }
  assert.equal(canCheckDayPack({kind:"row",rowId:"row"}, {readOnly:true}), false);
  assert.equal(canCheckDayPack({kind:"tip"}, {userId:"primary-user"}), true);
});

function client(result, throws = false) {
  const calls = [];
  const query = {
    from: (...args) => { calls.push(["from", ...args]); return query; },
    update: (...args) => { calls.push(["update", ...args]); return query; },
    eq: (...args) => { calls.push(["eq", ...args]); return query; },
    select: (...args) => { calls.push(["select", ...args]); return query; },
    maybeSingle: async () => { if (throws) throw Error("offline"); return result; },
  };
  return { calls, supabase: query };
}
const args = {tripId:"trip", rowId:"row", userId:"adult-user"};

test("check and uncheck update only checkmark metadata and require the exact trip and row", async () => {
  for (const packed of [true, false]) {
    const { calls, supabase } = client({data:{id:"row",is_packed:packed}});
    await saveDayPackCheck({...args, packed, supabase});
    assert.deepEqual(calls.filter(c => c[0] === "eq"), [["eq","id","row"],["eq","trip_id","trip"]]);
    const payload = calls.find(c => c[0] === "update")[1];
    assert.deepEqual(Object.keys(payload).sort(), ["is_packed","packed_at","packed_by","updated_at","updated_by"]);
    assert.equal(payload.is_packed, packed);
    assert.equal(payload.packed_by, packed ? "adult-user" : null);
    assert.equal(Boolean(payload.packed_at), packed);
    assert.equal(calls[0][1], "day_pack_items");
  }
});

test("denied, zero-row, mismatched and network-failed saves cannot report success", async () => {
  for (const result of [
    {data:null}, {error:{code:"42501"}}, {data:{id:"other",is_packed:true}},
    {data:{id:"row",is_packed:false}},
  ]) {
    await assert.rejects(saveDayPackCheck({...args,packed:true,...client(result)}));
  }
  await assert.rejects(saveDayPackCheck({...args,packed:true,...client(null,true)}));
});

test("missing identity, scope or invalid packed values never write", async () => {
  for (const invalid of [{userId:null},{tripId:null},{rowId:null},{packed:"true"}]) {
    const {calls, supabase} = client({});
    await assert.rejects(saveDayPackCheck({...args,packed:true,...invalid,supabase}));
    assert.deepEqual(calls, []);
  }
});
