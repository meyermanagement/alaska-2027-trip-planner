import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const id = n => `20000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const parent=id(1), child=id(2), other=id(3), family=id(10), seat=id(22);
const hash="a".repeat(64), notice="2026-09-19-parent-view-1";
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private; create schema storage;
create table auth.users(id uuid primary key,email text,banned_until timestamptz,updated_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid);
create table auth.refresh_tokens(user_id text,session_id uuid);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.role() returns text language sql stable as $$ select current_setting('test.authrole',true) $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('session_id',nullif(current_setting('test.session',true),'')) $$;
grant usage on schema auth,private,public,storage to authenticated,anon,service_role;
create table public.families(id uuid primary key);
create table public.family_members(user_id uuid,family_id uuid);
create table public.profiles(id uuid primary key,skin text,text_size text);
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
insert into auth.users(id,email) values('${parent}','parent@test.invalid'),('${child}','child@test.invalid'),('${other}','other@test.invalid');
insert into auth.sessions values('${id(101)}','${parent}'),('${id(102)}','${parent}'),('${id(103)}','${child}'),('${id(104)}','${other}');
insert into auth.refresh_tokens select user_id::text,id from auth.sessions;
insert into public.families values('${family}'),('${id(11)}');
insert into public.family_members values('${parent}','${family}'),('${child}','${family}'),('${other}','${id(11)}');
insert into public.profiles values('${parent}','aurora','regular'),('${child}','frost','large');
insert into public.travelers values
 ('${id(21)}','${family}','${parent}',true,current_date-interval '40 years','primary','parent@test.invalid','Parent'),
 ('${seat}','${family}','${child}',true,current_date-interval '12 years','secondary','child@test.invalid','Child'),
 ('${id(23)}','${id(11)}','${other}',true,current_date-interval '40 years','primary','other@test.invalid','Other');
insert into public.beta_consents values('${parent}','2026-09-22','2026-09-22',true,true,true,null);
insert into public.trips values
 ('${id(31)}','${family}','Included','Place','2027-01-02','2027-01-04','planning'),
 ('${id(32)}','${family}','Draft','Place',null,null,'draft'),
 ('${id(33)}','${family}','Not rostered','Place',null,null,'planning'),
 ('${id(34)}','${id(11)}','Foreign','Place',null,null,'planning');
insert into public.trip_travelers values('${id(31)}','${seat}'),('${id(32)}','${seat}'),('${id(34)}','${seat}');
insert into public.itinerary_items values('${id(41)}','${id(31)}','2027-01-02',null,'10:00','Train to hotel','transport','Station','confirmed',0,'SECRET','PRIVATE');
insert into public.packing_items values
 ('${id(51)}','${id(31)}','Clothes','Rain jacket',1,false,0,'Child',null,null,'PRIVATE'),
 ('${id(52)}','${id(31)}','Clothes','Adult item',1,false,0,'Parent',null,null,'PRIVATE'),
 ('${id(53)}','${id(31)}','Clothes','Stashed',1,false,0,'Child',null,now(),'PRIVATE');
insert into public.push_subscriptions values('${id(61)}','${child}',true),('${id(62)}','${parent}',true);
insert into storage.objects values('${id(71)}','PRIVATE');
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table public.%I enable row level security',t.tablename);
 execute format('grant all on public.%I to authenticated',t.tablename);
 execute format('create policy baseline on public.%I for all to authenticated using(true) with check(true)',t.tablename);
end loop; end $$;
`);
for(const migration of ["20260922_parent_managed_access","20260930_minor_review_only","20261001_parent_opened_trip_view"]) {
  await db.exec(readFileSync(new URL(`../supabase/migrations/${migration}.sql`,import.meta.url),"utf8"));
}
const as = (user=parent,session=id(101),role="authenticated") => db.exec(`reset role; set test.uid='${user}'; set test.session='${session}'; set test.authrole='${role}'; set role ${role};`);
const admin = () => db.exec("reset role; set test.uid=''; set test.session=''; set test.authrole='service_role';");
const open = (p=parent,c=seat,s=id(101),h=hash,n=notice) => db.query("select public.open_parent_trip_view($1,$2,$3,$4,$5) as result",[p,c,s,h,n]);
const read = async (h=hash) => (await db.query("select public.parent_trip_view_data($1) as result",[h])).rows[0].result;
test("known child accounts are banned and sessions removed without losing profiles or trips",async()=>{
  await admin();
  assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[child])).rows[0].banned,true);
  assert.equal((await db.query("select * from auth.sessions where user_id=$1",[child])).rows.length,0);
  assert.equal((await db.query("select * from auth.refresh_tokens where user_id=$1",[child])).rows.length,0);
  assert.equal((await db.query("select skin from profiles where id=$1",[child])).rows[0].skin,"frost");
  assert.equal((await db.query("select * from trip_travelers where traveler_id=$1",[seat])).rows.length,3);
  assert.equal((await db.query("select enabled from push_subscriptions where user_id=$1",[child])).rows[0].enabled,false);
});
test("server-only tables and RPCs are inaccessible even with a known view hash",async()=>{
  for(const role of ["anon","authenticated"]) {
    await as(parent,id(101),role);
    await assert.rejects(read(),/permission denied/);
    await assert.rejects(open(),/permission denied/);
    await assert.rejects(db.query("select * from parent_view_keys"),/permission denied/);
  }
  await as(parent);
  await assert.rejects(db.query("select public.minor_trip_review()"),/permission denied/);
});
test("opening requires current adult primary membership, consent, notice and key",async()=>{
  await admin();
  await assert.rejects(open(),/verified/);
  await db.exec(`insert into parent_view_keys(credential_id,guardian_user_id,public_key) values('test-key','${parent}','test-public-key')`);
  await assert.rejects(open(other,seat,id(104)),/verified/);
  await assert.rejects(open(parent,seat,id(101),hash,"old"),/verified/);
  await db.exec("update beta_consents set withdrawn_at=now()");
  await assert.rejects(open(),/verified/);
  await db.exec("update beta_consents set withdrawn_at=null");
  const result=(await open()).rows[0].result;
  assert.equal(result.skin,"frost");
  assert.equal((await db.query("select parent_skin from parent_trip_views")).rows[0].parent_skin,"aurora");
  assert.equal((await db.query("select * from auth.sessions where id=$1",[id(101)])).rows.length,0);
  assert.equal((await db.query("select * from auth.sessions where id=$1",[id(102)])).rows.length,1);
});
test("stale parent JWT loses direct database, storage, writes and definer RPC access",async()=>{
  await as();
  assert.equal((await db.query("select account_session_allowed() as ok")).rows[0].ok,false);
  for(const table of ["trips","packing_items","profiles","storage.objects"]) assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
  await assert.rejects(db.query("insert into packing_items(item) values('Injection')"),/row-level security/);
  await assert.rejects(db.query("select redeem_code('ANY')"),/signed out/);
  await as(parent,id(102));
  assert.equal((await db.query("select account_session_allowed() as ok")).rows[0].ok,true);
  assert.equal((await db.query("select * from trips")).rows.length,4);
});
test("opaque view projects only assigned non-draft trips and own packing in saved theme",async()=>{
  await admin();
  const result=await read();
  assert.equal(result.enabled,true);
  assert.equal(result.skin,"frost");
  assert.deepEqual(result.trips.map(t=>t.name),["Included"]);
  assert.deepEqual(result.trips[0].packing.map(p=>p.item),["Rain jacket"]);
  assert.doesNotMatch(JSON.stringify(result),/SECRET|PRIVATE|Adult item|Stashed|date_of_birth|user_id/);
  assert.equal((await read("b".repeat(64))).enabled,false);
});
test("live consent, roster, identity, expiry and close changes are enforced on every read",async()=>{
  await admin();
  await db.exec("update beta_consents set withdrawn_at=now()");
  assert.equal((await read()).enabled,false);
  await db.exec("update beta_consents set withdrawn_at=null; update trips set status='draft'");
  assert.equal((await read()).trips.length,0);
  await db.exec(`update trips set status='planning' where id='${id(31)}'; update parent_trip_views set expires_at=now()-interval '1 second'`);
  assert.equal((await read()).enabled,false);
  await db.exec("update parent_trip_views set expires_at=now()+interval '1 hour',closed_at=now()");
  assert.equal((await read()).enabled,false);
  await db.exec(`update parent_trip_views set closed_at=null; update travelers set name='Changed' where id='${seat}'`);
  assert.deepEqual((await read()).trips[0].packing,[]);
  await db.exec(`update travelers set name='Child',date_of_birth=date_of_birth-interval '1 day' where id='${seat}'`);
  assert.equal((await read()).enabled,false);
  await db.exec(`update travelers set date_of_birth=date_of_birth+interval '1 day' where id='${seat}'`);
});
test("known minor replacement accounts and newly classified minors cannot keep login",async()=>{
  await admin();
  await db.exec(`insert into auth.users(id,email) values('${id(8)}','CHILD@test.invalid')`);
  assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[id(8)])).rows[0].banned,true);
  await db.exec(`update travelers set date_of_birth=current_date-interval '15 years' where user_id='${other}'`);
  assert.equal((await db.query("select * from auth.sessions where user_id=$1",[other])).rows.length,0);
});
test("temporary records are purged without reviving a stale JWT or deleting traveler data",async()=>{
  await admin();
  await db.exec("update parent_trip_views set created_at=now()-interval '31 days'; update private.handed_off_sessions set created_at=now()-interval '31 days'");
  const result=(await db.query("select purge_parent_view_security_records() as result")).rows[0].result;
  assert.equal(result.views,1); assert.equal(result.sessions,1);
  await as();
  assert.equal((await db.query("select account_session_allowed() as ok")).rows[0].ok,false);
  await admin();
  assert.equal((await db.query("select skin from profiles where id=$1",[child])).rows[0].skin,"frost");
});
test.after(async()=>db.close());
