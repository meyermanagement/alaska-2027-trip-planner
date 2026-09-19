import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const load=code=>import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
const code=readFileSync(new URL("../lib/retention/history.js",import.meta.url),"utf8");
const {isHistoryAttachmentPath,cleanupHistoryAttachments,purgeCompletedHistory}=await load(code);
const path="80000000-0000-0000-0000-000000000001/inbox/80000000-0000-0000-0000-000000000002/file.pdf";
function fake({saved=false,removeError=false,rpcError=false}={}) {
  const calls=[];
  return {calls,
    from:()=>({select:()=>({order:()=>({limit:async()=>({data:[{storage_path:path}]})})}),
      delete:()=>({eq:async()=>{calls.push("queue-delete");return {};}})}),
    rpc:async name=>{calls.push(name);return {data:saved,error:rpcError?{message:"offline"}:null};},
    storage:{from:()=>({remove:async()=>{calls.push("storage-remove");return {error:removeError?{message:"offline"}:null};}})}
  };
}
test("storage cleanup only accepts namespaced inbox paths",()=>{
  assert.equal(isHistoryAttachmentPath(path),true);
  for(const bad of ["other/file.pdf",path.replace("file.pdf","../saved.pdf"),path.replace("/inbox/","/insurance/"),null]) {
    assert.equal(isHistoryAttachmentPath(bad),false);
  }
});
test("pending release is inert without explicit enablement",async()=>{
  delete process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED;
  const result=await purgeCompletedHistory({supabase:{rpc:()=>{throw Error("must not call");}}});
  assert.equal(result.detail.disabled,true);
});
test("saved attachment references are checked again and never deleted",async()=>{
  const client=fake({saved:true});
  assert.deepEqual(await cleanupHistoryAttachments(client),{removed:0,protected:1,failed:0,capped:false});
  assert.deepEqual(client.calls,["history_attachment_is_saved","queue-delete"]);
});
test("failed storage deletion retains durable retry and continues safely",async()=>{
  const client=fake({removeError:true});
  assert.equal((await cleanupHistoryAttachments(client)).failed,1);
  assert.ok(!client.calls.includes("queue-delete"));
});
test("failed saved-reference check cannot delete any bytes",async()=>{
  const client=fake({rpcError:true});
  assert.equal((await cleanupHistoryAttachments(client)).failed,1);
  assert.deepEqual(client.calls,["history_attachment_is_saved"]);
});
test("successful cleanup removes the blob before acknowledging its queue row",async()=>{
  const client=fake();
  assert.equal((await cleanupHistoryAttachments(client)).removed,1);
  assert.deepEqual(client.calls,["history_attachment_is_saved","storage-remove","queue-delete"]);
});
test("dry run never touches storage even when release is disabled",async()=>{
  let args;
  const result=await purgeCompletedHistory({dryRun:true,supabase:{
    rpc:async(name,input)=>{args=input;return {data:{messages:2,fares:3,offers:1,dry_run:true}};}
  }});
  assert.equal(args.p_dry_run,true); assert.equal(result.scanned,6); assert.equal(result.purged,0);
});
test("partial attachment failures keep deletion counts and surface in the retention ledger",async()=>{
  process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED="true";
  const client=fake({removeError:true});
  const savedRpc=client.rpc;
  client.rpc=async(name,args)=>name==="purge_completed_history"
    ? {data:{messages:2,fares:1,offers:1}} : savedRpc(name,args);
  const result=await purgeCompletedHistory({supabase:client});
  assert.equal(result.purged,4);
  assert.match(result.error,/need retry/);
  const purgeCode=readFileSync(new URL("../lib/retention/purge.js",import.meta.url),"utf8")
    .replace('"./history.js"',JSON.stringify(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`));
  const {purgeRecord,cutoffFor,COMPLETED_HISTORY}=await load(purgeCode);
  const cutoff=cutoffFor(COMPLETED_HISTORY,new Date("2026-09-19T12:00:00Z"));
  assert.equal(cutoff.toISOString(),"2026-06-21T12:00:00.000Z");
  const row=purgeRecord({job:COMPLETED_HISTORY,cutoff,result});
  assert.equal(row.purged,4); assert.match(row.error,/need retry/);
  assert.equal(row.detail.attachments.failed,1);
  delete process.env.NEXT_PUBLIC_HISTORY_RETENTION_ENABLED;
});
test("maintenance dry run is authenticated and cannot fall through into other deletions",()=>{
  const route=readFileSync(new URL("../app/api/tasks/maintain/route.js",import.meta.url),"utf8");
  assert.ok(route.indexOf('request.headers.get("authorization")')<route.indexOf("if (dryRun)"));
  assert.match(route,/asked !== "completed-history"/);
  assert.match(route,/return NextResponse.json\(await purgeCompletedHistory\(\{ supabase, dryRun: true \}\)\)/);
});
