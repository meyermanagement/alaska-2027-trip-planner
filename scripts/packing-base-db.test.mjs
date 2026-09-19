import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const id=n=>`80000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const user=id(1),second=id(2),foreign=id(3),family=id(10),first=id(20),next=id(21),otherTrip=id(22),draft=id(23);
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function account_session_allowed() returns boolean language sql stable as $$select current_setting('test.allowed',true)='true'$$;
create table families(id uuid primary key);
create table family_members(family_id uuid,user_id uuid);
create function private.is_family_member(fid uuid) returns boolean language sql stable as $$select exists(select 1 from family_members where family_id=fid and user_id=auth.uid())$$;
create function private.is_secondary_traveler(fid uuid) returns boolean language sql stable as $$select auth.uid()='${second}'::uuid$$;
create table travelers(id uuid primary key default gen_random_uuid(),family_id uuid,name text,is_person boolean);
create table trips(id uuid primary key,family_id uuid,name text,start_date date,end_date date,status text,created_at timestamptz);
create table packing_templates(id uuid primary key default gen_random_uuid(),family_id uuid,name text,is_base boolean,pet_id uuid,created_by uuid,created_at timestamptz default now());
create table packing_template_items(id uuid primary key default gen_random_uuid(),template_id uuid references packing_templates(id),item text,category text,
 assignee text,pet_id uuid,quantity text,last_minute boolean,sort_order int,created_by uuid);
create table packing_items(id uuid primary key default gen_random_uuid(),trip_id uuid references trips(id),item text,category text,
 assignee text,pet_id uuid,quantity text,last_minute boolean,sort_order int,created_by uuid,is_packed boolean default false,
 packed_at timestamptz,notes text,from_template boolean,stashed_at timestamptz);
grant usage on schema public,private,auth to authenticated,anon;
insert into families values('${family}'),('${id(11)}');
insert into family_members values('${family}','${user}'),('${family}','${second}'),('${id(11)}','${foreign}');
insert into travelers(family_id,name,is_person) values('${family}','Avery',true);
insert into trips values
 ('${first}','${family}','First trip',current_date+10,current_date+14,'planning',now()-interval '2 days'),
 ('${next}','${family}','Second trip',current_date+40,current_date+44,'planning',now()-interval '1 day'),
 ('${otherTrip}','${id(11)}','Private trip',current_date+20,current_date+22,'planning',now()-interval '4 days'),
 ('${draft}','${family}','Draft',null,null,'draft',now()-interval '5 days');
insert into packing_items(id,trip_id,item,category,assignee,is_packed,packed_at,notes,quantity) values
 ('${id(30)}','${first}','Socks','Clothing','Avery',true,now(),'Trip-specific note','3'),
 ('${id(31)}','${first}','Toothpaste','Toiletries','Shared',false,null,null,null),
 ('${id(32)}','${otherTrip}','Private item','General','Shared',false,null,null,null);
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261009_first_trip_packing.sql",import.meta.url),"utf8"));
const as=async(uid=user,allowed=true)=>db.exec(`reset role; set test.uid='${uid}'; set test.allowed='${allowed}'; set role authenticated;`);
const admin=()=>db.exec("reset role");
const call=async(trip=first,action="state",items=[]) => (await db.query("select packing_base($1,$2,$3::jsonb) result",[trip,action,JSON.stringify(items)])).rows[0].result;
const clear=async()=>{
  await admin();await db.exec(`delete from packing_base_onboarding;delete from packing_template_items;delete from packing_templates;delete from packing_items where id not in ('${id(30)}','${id(31)}','${id(32)}');`);await as();
};
test.beforeEach(clear);
test("opening and canceling preserves introduction without generating a base list",async()=>{
  const a=await call(),b=await call();
  assert.equal(a.showIntro,true);assert.equal(b.showIntro,true);assert.equal(a.template,null);
  assert.equal((await call(next)).showIntro,false);
});
test("Not now persists across requests, not just component state",async()=>{
  assert.equal((await call(first,"dismiss")).showIntro,false);
  assert.equal((await call()).showIntro,false);
  assert.equal((await call(next)).template,null);
});
test("essentials atomically save to trip and base, without duplicates on retry",async()=>{
  const rows=[{item:"Socks",assignee:"Avery"},{item:"Phone charger",assignee:"Avery"}];
  const a=await call(first,"essentials",rows);
  assert.equal(a.items.length,2);assert.equal(a.tripAdded,1);assert.equal(a.showIntro,false);
  const b=await call(first,"essentials",rows);
  assert.equal(b.added,0);assert.equal(b.tripAdded,0);
  await admin();
  assert.equal((await db.query("select is_packed from packing_items where id=$1",[id(30)])).rows[0].is_packed,true);
});
test("second trip offers previous lists even after skipping setup, then copies only selected items",async()=>{
  await call(first,"dismiss");
  const state=await call(next);
  assert.deepEqual(state.previousTrips.map(t=>t.id),[first]);assert.equal(state.showIntro,false);
  const source=await call(next,"source",[first]);assert.equal(source.sourceItems.length,2);
  const result=await call(next,"copy",[id(30)]);
  assert.equal(result.added,1);assert.equal(result.tripAdded,1);
  assert.equal(result.items[0].assignee,"Avery");assert.equal(result.items[0].quantity,"3");
  assert.equal("is_packed" in result.items[0],false);
  await admin();
  const rows=(await db.query("select * from packing_items where trip_id=$1",[next])).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].is_packed,false);
  assert.equal(rows[0].packed_at,null);assert.equal(rows[0].notes,null);
  assert.equal((await db.query("select is_packed from packing_items where id=$1",[id(30)])).rows[0].is_packed,true);
  await as();
  const retry=await call(next,"copy",[id(30)]);assert.equal(retry.added,0);assert.equal(retry.tripAdded,0);
});
test("bulk remember preserves Shared, never mutates source or other trips",async()=>{
  const result=await call(first,"remember",[id(31)]);
  assert.equal(result.items[0].assignee,"Shared");assert.equal(result.tripAdded,0);
  await admin();assert.equal((await db.query("select count(*)::int n from packing_items")).rows[0].n,3);
});
test("invalid item later in a batch rolls back template creation and all writes",async()=>{
  await assert.rejects(call(next,"copy",[id(30),id(32)]),/no longer/);
  const result=await call(next);assert.equal(result.items.length,0);assert.equal(result.template,null);
});
test("unknown essentials, unknown owner, wrong source trip and drafts cannot be used",async()=>{
  await assert.rejects(call(first,"essentials",[{item:"Untrusted",assignee:"Avery"}]),/Choose essentials/);
  await assert.rejects(call(first,"essentials",[{item:"Socks",assignee:"Stranger"}]),/Choose essentials/);
  await assert.rejects(call(next,"source",[otherTrip]),/not found/);
  await assert.rejects(call(first,"source",[next]),/not found/);
  await assert.rejects(call(draft),/Not permitted/);
});
test("secondary, revoked session, foreign household and anonymous access are blocked",async()=>{
  await as(second);await assert.rejects(call(),/Not permitted/);
  assert.equal((await db.query("select * from packing_base_onboarding")).rows.length,0);
  await as(user,false);await assert.rejects(call(),/sign in/);
  await as(foreign);await assert.rejects(call(),/Not permitted/);
  await db.exec("reset role;set role anon");await assert.rejects(call(),/permission denied/);
});
test("essentials remain accessible on the templates page without a trip",async()=>{
  const result=await call(null,"essentials",[{item:"Socks",assignee:"Avery"}]);
  assert.equal(result.added,1);assert.equal(result.tripAdded,0);assert.equal(result.showIntro,false);
});
test("deleting base items does not resurrect the first-time introduction",async()=>{
  await call(first,"remember",[id(30)]);
  await admin();await db.exec("delete from packing_template_items");await as();
  assert.equal((await call()).showIntro,false);
  assert.equal((await call(next)).previousTrips.length,1);
});
test.after(()=>db.close());
