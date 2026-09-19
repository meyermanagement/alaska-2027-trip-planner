import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const id = n => `10000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const parent=id(1), child=id(2), other=id(3), family=id(10), foreign=id(11), seat=id(22);
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema private; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('test.authrole',true) $$;
grant usage on schema auth,private,public,storage to authenticated,anon,service_role;
create table public.families(id uuid primary key);
create table public.family_members(user_id uuid,family_id uuid);
create table public.travelers(id uuid primary key,family_id uuid,user_id uuid,is_person boolean default true,date_of_birth date,access_level text,email text,name text);
create table public.beta_consents(user_id uuid primary key,agreement_version text,privacy_version text,age_confirmed boolean,data_acknowledged boolean,ai_processing boolean,withdrawn_at timestamptz);
create function private.is_family_member(fid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.family_members where user_id=auth.uid() and family_id=fid) $$;
create function private.is_secondary_traveler(fid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.travelers where user_id=auth.uid() and family_id=fid and access_level='secondary') $$;
create table public.trips(id uuid primary key,family_id uuid,name text,destination text,start_date date,end_date date,status text);
create table public.trip_travelers(trip_id uuid,traveler_id uuid);
create table public.itinerary_items(id uuid,trip_id uuid,item_date date,end_date date,start_time time,title text,category text,location text,status text,sort_order int,confirmation_number text,notes text);
create table public.packing_items(id uuid,trip_id uuid,category text,item text,quantity int,is_packed boolean,sort_order int,assignee text,pet_id uuid,stashed_at timestamptz,notes text);
create table public.push_subscriptions(id uuid,user_id uuid,enabled boolean);
create table storage.objects(id uuid,name text);
alter table storage.objects enable row level security;
create policy open on storage.objects for all to authenticated using(true) with check(true);
grant all on storage.objects to authenticated;
create function public.redeem_code(p_code text) returns jsonb language plpgsql security definer as $$ begin return '{"ok":true}'; end; $$;
create function public.remove_household_member(p_traveler uuid) returns json language plpgsql security definer as $$ begin return '{"ok":true}'; end; $$;
insert into auth.users values('${parent}','parent@example.test'),('${child}','child@example.test'),('${other}','other@example.test');
insert into public.families values('${family}'),('${foreign}');
insert into public.family_members values('${parent}','${family}'),('${child}','${family}'),('${other}','${foreign}');
insert into public.travelers values
 ('${id(21)}','${family}','${parent}',true,current_date-interval '40 years','primary','parent@example.test','Parent'),
 ('${seat}','${family}','${child}',true,current_date-interval '12 years','secondary','child@example.test','Child'),
 ('${id(23)}','${foreign}','${other}',true,current_date-interval '40 years','primary','other@example.test','Other');
insert into public.beta_consents values('${parent}','2026-09-22','2026-09-22',true,true,true,null);
insert into public.trips values
 ('${id(31)}','${family}','Included','Place','2027-01-02','2027-01-04','planning'),
 ('${id(32)}','${family}','Draft','Place',null,null,'draft'),
 ('${id(33)}','${family}','Not on roster','Place',null,null,'planning'),
 ('${id(34)}','${foreign}','Cross family','Place',null,null,'planning');
insert into public.trip_travelers values('${id(31)}','${seat}'),('${id(32)}','${seat}'),('${id(34)}','${seat}');
insert into public.itinerary_items values('${id(41)}','${id(31)}','2027-01-02',null,'10:00','Train to hotel','transport','Station','confirmed',0,'SECRET-CONFIRMATION','PRIVATE-NOTE');
insert into public.packing_items values
 ('${id(51)}','${id(31)}','Clothes','Rain jacket',1,false,0,'Child',null,null,'PRIVATE-NOTE'),
 ('${id(52)}','${id(31)}','Clothes','Adult item',1,false,0,'Parent',null,null,'PRIVATE-NOTE'),
 ('${id(53)}','${id(31)}','Clothes','Stashed',1,false,0,'Child',null,now(),'PRIVATE-NOTE');
insert into public.push_subscriptions values('${id(61)}','${child}',true),('${id(62)}','${parent}',true);
insert into storage.objects values('${id(71)}','PRIVATE-PASSPORT');
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t.tablename);
 execute format('grant all on public.%I to authenticated',t.tablename);
 execute format('create policy baseline on public.%I for all to authenticated using(true) with check(true)',t.tablename);
end loop; end $$;
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20260922_parent_managed_access.sql",import.meta.url),"utf8"));
// An old pending AI request must never activate the new read-only grant.
await db.exec(`set test.uid='${parent}'; select public.request_child_access('${seat}',true,true,true,true,'2026-09-19-draft-1','2026-09-22','2026-09-22');`);
await db.exec(readFileSync(new URL("../supabase/migrations/20260930_minor_review_only.sql",import.meta.url),"utf8"));
const as = user => db.exec(`reset role; set test.uid='${user}'; set test.authrole='authenticated'; set role authenticated;`);
const review = async () => (await db.query("select public.minor_trip_review() as result")).rows[0].result;
const grant = (enabled=true, target=seat, guardian=true, notice="2026-09-19-review-1") =>
  db.query("select public.set_minor_review_access($1,$2,$3,$4,'2026-09-22','2026-09-22')",[target,enabled,guardian,notice]);
test("migration preserves adults and denies all direct minor table/storage reads and writes", async () => {
  await as(parent);
  assert.equal((await db.query("select * from public.trips")).rows.length,4);
  await as(child);
  assert.equal((await db.query("select public.account_is_minor($1) as minor",[child])).rows[0].minor,true);
  await assert.rejects(db.query("select public.account_is_minor($1)",[parent]),/not allowed/);
  for(const table of ["travelers","trips","packing_items","itinerary_items","family_members","beta_consents","storage.objects"]) {
    assert.equal((await db.query(`select * from ${table}`)).rows.length,0,table);
  }
  await assert.rejects(db.exec(`insert into public.packing_items(id,item) values('${id(99)}','Injected')`),/row-level security/);
  assert.equal((await db.query("update public.packing_items set is_packed=true returning id")).rows.length,0);
  await assert.rejects(db.exec("select public.redeem_code('ANY')"),/read-only/);
  await assert.rejects(db.exec(`select public.remove_household_member('${seat}')`),/read-only/);
  assert.deepEqual(await review(),{enabled:false,trips:[]});
});
test("child, foreign parent, missing confirmation, stale notice and old AI flow cannot grant access", async () => {
  await as(child); await assert.rejects(grant(),/adult/);
  await as(other); await assert.rejects(grant(),/household/);
  await as(parent); await assert.rejects(grant(true,seat,false),/notice/);
  await assert.rejects(grant(true,seat,true,"old"),/notice/);
  await assert.rejects(db.exec(`select public.request_child_access('${seat}',true,true,true,true,'2026-09-19-draft-1','2026-09-22','2026-09-22')`),/retired/);
  await grant();
});
test("projection exposes only rostered non-draft trips, own packing, and selected itinerary fields", async () => {
  await as(child);
  const result=await review();
  assert.equal(result.enabled,true);
  assert.deepEqual(result.trips.map(t=>t.name),["Included"]);
  assert.deepEqual(result.trips[0].packing.map(p=>p.item),["Rain jacket"]);
  assert.equal(result.trips[0].itinerary[0].title,"Train to hotel");
  assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|Adult item|Stashed|date_of_birth|user_id/);
  assert.equal((await db.query("select * from public.minor_review_grants")).rows.length,0);
  await assert.rejects(grant(false),/adult/);
});
test("ambiguous same-name packing assignments stay private", async () => {
  await db.exec(`reset role; insert into public.travelers(id,family_id,is_person,date_of_birth,access_level,name) values('${id(24)}','${family}',true,current_date-interval '35 years','secondary',' CHILD ')`);
  await as(child);
  assert.deepEqual((await review()).trips[0].packing,[]);
  await db.exec(`reset role; delete from public.travelers where id='${id(24)}'`);
});
test("guardian consent withdrawal, membership loss, draft conversion and roster removal take effect on the next read", async () => {
  await db.exec(`reset role; update public.beta_consents set withdrawn_at=now() where user_id='${parent}'`);
  await as(child); assert.equal((await review()).enabled,false);
  await as(parent); await grant(false);
  await db.exec("reset role; update public.beta_consents set withdrawn_at=null");
  await as(parent); await grant();
  await db.exec(`reset role; delete from public.family_members where user_id='${child}'`);
  await as(child); assert.equal((await review()).enabled,false);
  await db.exec(`reset role; insert into public.family_members values('${child}','${family}'); update public.trips set status='draft' where id='${id(31)}'`);
  await as(child); assert.equal((await review()).trips.length,0);
  await db.exec(`reset role; update public.trips set status='planning' where id='${id(31)}'; delete from public.trip_travelers where trip_id='${id(31)}'`);
  await as(child); assert.equal((await review()).trips.length,0);
});
test("identity edits invalidate grants without making a known child an adult", async () => {
  await db.exec(`reset role; update public.travelers set date_of_birth=current_date-interval '30 years' where id='${seat}'`);
  await as(child);
  assert.equal((await db.query("select public.account_is_minor($1) as minor",[child])).rows[0].minor,true);
  assert.equal((await review()).enabled,false);
  await db.exec("reset role");
  assert.equal((await db.query("select enabled from public.minor_review_grants")).rows[0].enabled,false);
});
test("minor push subscriptions are disabled, including a service write that tries to re-enable them", async () => {
  await db.exec("reset role");
  let rows=(await db.query("select user_id,enabled from public.push_subscriptions")).rows;
  assert.equal(rows.find(r=>r.user_id===child).enabled,false);
  assert.equal(rows.find(r=>r.user_id===parent).enabled,true);
  await db.exec(`update public.push_subscriptions set enabled=true where user_id='${child}'`);
  rows=(await db.query("select enabled from public.push_subscriptions where user_id=$1",[child])).rows;
  assert.equal(rows[0].enabled,false);
});
test.after(async()=>db.close());
