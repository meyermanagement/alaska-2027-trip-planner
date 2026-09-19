import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const id = n => `90000000-0000-0000-0000-${String(n).padStart(12,"0")}`;
const user=id(1), secondary=id(2), other=id(3), family=id(10), message=id(20), trip=id(30), booking=id(40), policy=id(50);
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function public.account_session_allowed() returns boolean language sql stable as $$ select current_setting('test.allowed',true)='true' $$;
create table families(id uuid primary key);
create table family_members(family_id uuid,user_id uuid);
create function private.is_family_member(fid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from family_members where family_id=fid and user_id=auth.uid()) $$;
create function private.is_secondary_traveler(fid uuid) returns boolean language sql stable security definer as $$ select auth.uid()='${secondary}'::uuid $$;
create table inbox_messages(id uuid primary key,family_id uuid references families(id),status text,parse_status text,
 parse_error text,parse_model text,parsed_at timestamptz,attributed_traveler_id uuid,subject text);
create table trips(id uuid primary key,family_id uuid);
create table itinerary_items(id uuid primary key,trip_id uuid,title text,category text,location text,item_date date,end_date date,start_time time,confirmation_number text,notes text,
 check(end_date is null or end_date>=item_date));
create table insurance_policies(id uuid primary key,family_id uuid,kind text,provider text,plan_name text,policy_number text,
 coverage_start date,coverage_end date,emergency_phone text,claims_phone text,claims_url text,covers text[],premium numeric,deductible numeric,
 medical_limit numeric,evacuation_limit numeric,notes text);
create table inbox_parsed_items(id uuid primary key default gen_random_uuid(),message_id uuid,family_id uuid,category text,title text,
 location text,item_date date,end_date date,start_time time,confirmation_number text,notes text,confidence text,sort_order int,source text,
 attributed_traveler_id uuid,status text default 'pending',approved_item_id uuid);
create table inbox_parsed_policies(id uuid primary key default gen_random_uuid(),message_id uuid,family_id uuid,kind text,provider text,plan_name text,
 policy_number text,coverage_start date,coverage_end date,emergency_phone text,claims_phone text,claims_url text,covers text[],premium numeric,deductible numeric,
 medical_limit numeric,evacuation_limit numeric,notes text,insured_names text[],confidence text,approved_at timestamptz,approved_policy_id uuid);
create table inbox_attachments(id uuid primary key,message_id uuid);
grant usage on schema public,auth,private to authenticated,anon,service_role;
insert into auth.users values('${user}'),('${secondary}'),('${other}');
insert into families values('${family}');
insert into family_members values('${family}','${user}'),('${family}','${secondary}');
insert into trips values('${trip}','${family}');
insert into inbox_messages values('${message}','${family}','filed','succeeded',null,null,null,null,'Example booking');
insert into itinerary_items values('${booking}','${trip}','Original flight','flight','Airport','2027-03-15',null,'10:00','ABC','Personal note');
insert into inbox_parsed_items(id,message_id,family_id,category,title,status,approved_item_id)
 values('${id(41)}','${message}','${family}','flight','Original flight','approved','${booking}');
insert into insurance_policies(id,family_id,kind,provider,plan_name,coverage_start,coverage_end,covers,notes)
 values('${policy}','${family}','annual','Example insurer','Annual plan','2027-01-01','2027-12-31',array['medical'],'Personal insurance note');
insert into inbox_parsed_policies(id,message_id,family_id,provider,approved_at,approved_policy_id)
 values('${id(51)}','${message}','${family}','Example insurer',now(),'${policy}');
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261008_inbox_reprocess.sql",import.meta.url),"utf8"));
const admin = () => db.exec("reset role; set test.uid=''; set test.allowed='true';");
const as = (uid=user,allowed=true) => db.exec(`reset role; set test.uid='${uid}'; set test.allowed='${allowed}'; set role authenticated;`);
const begin = async () => (await db.query("select begin_inbox_reprocess($1,$2,$3) as id",[message,user,"The return flight is missing."])).rows[0].id;
const item = {category:"flight",title:"Corrected flight",item_date:"2027-03-15",end_date:null,start_time:"12:00",location:null,confirmation_number:"ABC",notes:"Model note",confidence:"high",sort_order:0};
const ready = async (result={kind:"booking",items:[item]}) => {
  await admin();
  await db.exec("delete from inbox_reprocess_runs");
  const rid=await begin();
  await db.query("update inbox_reprocess_runs set status='ready',result=$2::jsonb where id=$1",[rid,JSON.stringify(result)]);
  return rid;
};
const apply = (rid,choices) => db.query("select apply_inbox_reprocess($1,$2::jsonb) as result",[rid,JSON.stringify(choices)]);
test("creating a reread does not touch the saved booking or previous staging",async()=>{
  await admin();
  const rid=await begin();
  assert.ok(rid);
  assert.equal((await db.query("select title from itinerary_items")).rows[0].title,"Original flight");
  assert.equal((await db.query("select count(*)::int n from inbox_parsed_items")).rows[0].n,1);
  await assert.rejects(begin(),/already being reprocessed/);
});
test("confirmed correction updates the existing row once and preserves personal notes and omitted fields",async()=>{
  const rid=await ready(); await as();
  const result=(await apply(rid,[{index:0,target_id:booking}])).rows[0].result;
  assert.equal(result.updated,1);
  assert.equal((await apply(rid,[{index:0,target_id:booking}])).rows[0].result.already_applied,true);
  await admin();
  const row=(await db.query("select * from itinerary_items")).rows[0];
  assert.equal(row.title,"Corrected flight"); assert.equal(row.notes,"Personal note");
  assert.equal(row.location,"Airport"); assert.equal(row.start_time,"12:00:00");
  assert.equal((await db.query("select count(*)::int n from itinerary_items")).rows[0].n,1);
});
test("newly found bookings become unfiled suggestions, never automatic duplicate itinerary rows",async()=>{
  const rid=await ready({kind:"booking",items:[{...item,title:"Return flight"}]}); await as();
  assert.equal((await apply(rid,[{index:0,target_id:null}])).rows[0].result.staged,1);
  await admin();
  assert.equal((await db.query("select count(*)::int n from itinerary_items")).rows[0].n,1);
  assert.equal((await db.query("select status from inbox_messages")).rows[0].status,"pending");
  assert.equal((await db.query("select title from inbox_parsed_items where status='pending'")).rows[0].title,"Return flight");
});
test("stale proposal cannot overwrite a manual edit and does not clear drafts",async()=>{
  const rid=await ready();
  await db.exec("update itinerary_items set notes='Changed elsewhere'");
  await as();
  await assert.rejects(apply(rid,[{index:0,target_id:booking}]),/changed/);
  await admin();
  assert.equal((await db.query("select title from inbox_parsed_items where status='pending'")).rows[0].title,"Return flight");
});
test("policy corrections reuse the policy and preserve kind, notes and missing dates",async()=>{
  const rid=await ready({kind:"insurance",policy:{kind:"trip",provider:"Correct insurer",coverage_start:null,coverage_end:null,
    medical_limit:100000,covers:["medical","evacuation"],confidence:"high",insured_names:[],notes:"Model note"}});
  await as();
  assert.equal((await apply(rid,[{index:0,target_id:policy}])).rows[0].result.updated,1);
  await admin();
  const row=(await db.query("select * from insurance_policies")).rows[0];
  assert.equal(row.provider,"Correct insurer"); assert.equal(row.kind,"annual");
  assert.equal(row.notes,"Personal insurance note"); assert.equal(row.coverage_start.toISOString().slice(0,10),"2027-01-01");
  assert.equal((await db.query("select count(*)::int n from insurance_policies")).rows[0].n,1);
});
test("primary/session authorization and server-only proposal creation are enforced in SQL",async()=>{
  const rid=await ready();
  for (const who of [secondary,other]) {
    await as(who);
    await assert.rejects(apply(rid,[{index:0,target_id:booking}]),/Not permitted/);
    assert.equal((await db.query("select * from inbox_reprocess_runs")).rows.length,0);
  }
  await as(user,false);
  await assert.rejects(apply(rid,[{index:0,target_id:booking}]),/Not permitted/);
  await as();
  await assert.rejects(begin(),/permission denied/);
  await assert.rejects(db.exec("update inbox_reprocess_runs set status='ready'"),/permission denied/);
});
test("a newly recognized insurance policy is staged for review, not saved or linked automatically",async()=>{
  const rid=await ready({kind:"insurance",policy:{kind:"trip",provider:"New insurer",coverage_start:"2027-06-01",
    coverage_end:"2027-06-15",medical_limit:250000,covers:["medical"],confidence:"medium",insured_names:["Example traveler"]}});
  await as();
  assert.equal((await apply(rid,[{index:0,target_id:null}])).rows[0].result.staged,1);
  await admin();
  assert.equal((await db.query("select count(*)::int n from insurance_policies")).rows[0].n,1);
  const staged=(await db.query("select * from inbox_parsed_policies where approved_at is null")).rows[0];
  assert.equal(staged.provider,"New insurer");
  assert.deepEqual(staged.insured_names,["Example traveler"]);
});
test("invalid mappings and duplicate targets roll back every change",async()=>{
  const rid=await ready({kind:"booking",items:[item,{...item,title:"Another flight"}]}); await as();
  await assert.rejects(apply(rid,[{index:0,target_id:id(999)}]),/does not belong/);
  await assert.rejects(apply(rid,[{index:0,target_id:booking},{index:1,target_id:booking}]),/only once/);
  await assert.rejects(apply(rid,[{index:0,target_id:null},{index:0,target_id:null}]),/Invalid result/);
  await assert.rejects(apply(rid,null),/Choose at least/);
  await admin();
  assert.equal((await db.query("select status from inbox_reprocess_runs where id=$1",[rid])).rows[0].status,"ready");
});
test("an abandoned run expires and rapid repeated reads are capped",async()=>{
  await admin(); await db.exec("delete from inbox_reprocess_runs");
  const rid=await begin();
  await db.query("update inbox_reprocess_runs set created_at=now()-interval '4 minutes' where id=$1",[rid]);
  assert.ok(await begin());
  assert.equal((await db.query("select status from inbox_reprocess_runs where id=$1",[rid])).rows[0].status,"failed");
  for(let i=0;i<3;i++){
    await db.exec("update inbox_reprocess_runs set status='failed' where status='running'");
    await begin();
  }
  await db.exec("update inbox_reprocess_runs set status='failed' where status='running'");
  await assert.rejects(begin(),/wait a few minutes/);
});
test.after(()=>db.close());
