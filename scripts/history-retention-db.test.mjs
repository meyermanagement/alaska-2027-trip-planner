import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const id = n => `80000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const family=id(1), message=id(2), trip=id(3);
const path = suffix => `${family}/inbox/${message}/${suffix}.pdf`;
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create table inbox_messages(id uuid primary key, family_id uuid, status text, parse_status text, filed_at timestamptz);
create table trips(id uuid primary key);
create table itinerary_items(id uuid primary key,trip_id uuid references trips);
create table insurance_policies(id uuid primary key);
create table item_documents(id uuid primary key,itinerary_item_id uuid references itinerary_items on delete cascade,storage_path text);
create table insurance_documents(id uuid primary key,policy_id uuid references insurance_policies on delete cascade,storage_path text);
create table traveler_documents(id uuid primary key,storage_path text);
create table inbox_parsed_items(id uuid primary key,message_id uuid references inbox_messages on delete cascade,
  approved_item_id uuid references itinerary_items on delete set null);
create table inbox_parsed_policies(id uuid primary key,message_id uuid references inbox_messages on delete cascade,
  approved_policy_id uuid references insurance_policies on delete set null);
create table inbox_attachments(id uuid primary key,message_id uuid references inbox_messages on delete cascade,family_id uuid,storage_path text);
create table inbox_reprocess_runs(id uuid primary key,message_id uuid references inbox_messages on delete cascade,status text);
create table flight_deals(id uuid primary key,status text,trip_id uuid references trips on delete set null,
  message_id uuid references inbox_messages on delete set null);
create table pro_tips(id uuid primary key);
create table card_offers(id uuid primary key,status text,decided_on date,tip_id uuid references pro_tips on delete set null);
create table reviews(id uuid primary key);
insert into inbox_messages values('${message}','${family}','deleted','succeeded',null);
insert into flight_deals(id,status) values('${id(5)}','dismissed');
insert into card_offers(id,status,decided_on) values('${id(6)}','declined',current_date-100);
grant usage on schema public to anon,authenticated,service_role;
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261010_history_retention.sql",import.meta.url),"utf8"));
const count = async table => (await db.query(`select count(*)::int n from ${table}`)).rows[0].n;
const purge = async (dry=true,limit=2000) =>
  (await db.query("select purge_completed_history($1,$2) result",[dry,limit])).rows[0].result;
const age = async (table, clock, days=91) => db.exec(`
  alter table ${table} disable trigger ${clock};
  update ${table} set history_entered_at=now()-interval '${days} days';
  alter table ${table} enable trigger ${clock};`);
const reset = async () => {
  await db.exec(`reset role; truncate inbox_messages,trips,insurance_policies,traveler_documents,pro_tips,reviews cascade;
    insert into trips values('${trip}');
    insert into inbox_messages(id,family_id,status,parse_status) values('${message}','${family}','filed','succeeded');
    insert into flight_deals(id,status,message_id) values('${id(5)}','dismissed','${message}');
    insert into pro_tips values('${id(6)}');
    insert into card_offers(id,status,tip_id) values('${id(7)}','declined','${id(6)}');
    insert into reviews values('${id(8)}');
    delete from history_attachment_cleanup;`);
  await age("inbox_messages","inbox_history_clock");
  await age("flight_deals","fare_history_clock");
  await age("card_offers","offer_history_clock");
};
test("legacy unknown clocks get a grace period; known decline dates remain usable",async()=>{
  const result=await purge();
  assert.equal(result.messages,0); assert.equal(result.fares,0); assert.equal(result.offers,1);
});
test("dry run defaults to read-only and is unavailable to clients",async()=>{
  await reset();
  const result=(await db.query("select purge_completed_history() result")).rows[0].result;
  assert.deepEqual([result.messages,result.fares,result.offers],[1,1,1]);
  assert.equal(await count("inbox_messages"),1);
  assert.equal(await count("history_attachment_cleanup"),0);
  for (const role of ["anon","authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(purge(false),/permission denied/);
    await assert.rejects(db.query("select * from history_attachment_cleanup"),/permission denied/);
    await db.exec("reset role");
  }
  await db.exec("set role service_role");
  assert.equal((await purge()).messages,1);
  await db.exec("reset role");
});
test("deleting history preserves bookings, policies, documents, reviews and cleared tips",async()=>{
  await reset();
  await db.exec(`
    insert into itinerary_items values('${id(10)}','${trip}');
    insert into insurance_policies values('${id(11)}');
    insert into inbox_parsed_items values('${id(12)}','${message}','${id(10)}');
    insert into inbox_parsed_policies values('${id(13)}','${message}','${id(11)}');
    insert into item_documents values('${id(14)}','${id(10)}','${path("saved-item")}');
    insert into insurance_documents values('${id(15)}','${id(11)}','${path("saved-policy")}');
    insert into traveler_documents values('${id(16)}','${path("saved-person")}');
    insert into inbox_attachments values
      ('${id(20)}','${message}','${family}','${path("original")}'),
      ('${id(21)}','${message}','${family}','${path("saved-item")}'),
      ('${id(22)}','${message}','${family}','${path("saved-policy")}'),
      ('${id(23)}','${message}','${family}','${path("saved-person")}');`);
  const result=await purge(false);
  assert.deepEqual([result.messages,result.fares,result.offers,result.attachments_queued],[1,1,1,1]);
  for (const table of ["trips","itinerary_items","insurance_policies","item_documents","insurance_documents","traveler_documents","reviews","pro_tips"]) {
    assert.equal(await count(table),1,table);
  }
  for (const table of ["inbox_messages","inbox_parsed_items","inbox_parsed_policies","inbox_attachments"]) assert.equal(await count(table),0,table);
  assert.equal((await db.query("select storage_path from history_attachment_cleanup")).rows[0].storage_path,path("original"));
});
test("pending inbox, active fares, taken offers and their source groups survive any age",async()=>{
  await reset();
  await db.exec("update inbox_messages set status='pending'; update flight_deals set status='open'; update card_offers set status='taken';");
  // Even inconsistent historical clocks cannot override the active-state guards.
  await age("inbox_messages","inbox_history_clock",300);
  await age("flight_deals","fare_history_clock",300);
  await age("card_offers","offer_history_clock",300);
  assert.deepEqual(await purge(false).then(r=>[r.messages,r.fares,r.offers]),[0,0,0]);
  await db.exec("update inbox_messages set status='noted'");
  await age("inbox_messages","inbox_history_clock");
  assert.equal((await purge(false)).messages,0);
});
test("trip-linked fares are protected even when their status says dismissed",async()=>{
  await reset();
  await db.query("update flight_deals set trip_id=$1",[trip]);
  const result=await purge(false);
  assert.equal(result.fares,0); assert.equal(result.messages,0);
  assert.equal(await count("flight_deals"),1);
});
test("running and ready rereads and initial parses protect the source message",async()=>{
  for (const status of ["running","ready"]) {
    await reset();
    await db.query("insert into inbox_reprocess_runs values($1,$2,$3)",[id(50),message,status]);
    assert.equal((await purge(false)).messages,0);
  }
  for (const status of ["pending","running"]) {
    await reset(); await db.query("update inbox_messages set parse_status=$1",[status]);
    assert.equal((await purge(false)).messages,0);
  }
});
test("restoration clears the clock, re-decline starts fresh, expiration does not restart it",async()=>{
  await reset();
  const stamp=async()=> (await db.query("select history_entered_at from flight_deals")).rows[0].history_entered_at;
  const original=await stamp();
  await db.exec("update flight_deals set status='expired',history_entered_at=now()");
  assert.deepEqual(await stamp(),original);
  await db.exec("update flight_deals set status='open'");
  assert.equal(await stamp(),null);
  await db.exec("update flight_deals set status='dismissed',history_entered_at=now()-interval '200 days'");
  assert.ok(Date.now()-(await stamp()).getTime()<60000);
  assert.equal((await purge()).fares,0);
});
test("90-day boundary, batch cap and idempotent retry are enforced",async()=>{
  await reset();
  await age("inbox_messages","inbox_history_clock",89);
  await age("flight_deals","fare_history_clock",89);
  await age("card_offers","offer_history_clock",89);
  assert.deepEqual(await purge().then(r=>[r.messages,r.fares,r.offers]),[0,0,0]);
  await age("inbox_messages","inbox_history_clock",90);
  await age("flight_deals","fare_history_clock",90);
  await age("card_offers","offer_history_clock",90);
  assert.equal((await purge(false,1)).capped,true);
  assert.deepEqual(await purge(false).then(r=>[r.messages,r.fares,r.offers]),[0,0,0]);
});
test("partial batches keep an email group until all its fares can be removed",async()=>{
  await reset();
  await db.query("insert into flight_deals(id,status,message_id) values($1,'dismissed',$2)",[id(60),message]);
  await age("flight_deals","fare_history_clock");
  const first=await purge(false,1);
  assert.equal(first.fares,1); assert.equal(first.messages,0);
  assert.equal(await count("inbox_messages"),1);
  const second=await purge(false,1);
  assert.equal(second.fares,1); assert.equal(second.messages,1);
});
test("foreign or traversal attachment paths hold the message rather than risking saved files",async()=>{
  for (const bad of [`${id(99)}/inbox/${message}/x.pdf`,`${family}/inbox/${message}/../saved.pdf`]) {
    await reset();
    await db.query("insert into inbox_attachments values($1,$2,$3,$4)",[id(99),message,family,bad]);
    assert.equal((await purge(false)).messages,0);
    assert.equal(await count("history_attachment_cleanup"),0);
  }
});
test.after(async()=>db.close());
