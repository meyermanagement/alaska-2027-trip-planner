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
test("adult invitation migration and lifecycle (isolated database only)", async t => {
  await admin();
  await db.exec(`
    alter table auth.users add column email_confirmed_at timestamptz default now(), add column created_at timestamptz default now();
    alter table family_members add column role text default 'member', add unique(user_id,family_id);
    alter table travelers add column wants_reminders boolean default true, add column linked_at timestamptz;
    alter table beta_consents add column family_id uuid, add column app_build text, add column ai_provider text,
      add column ai_decided_at timestamptz, add column features jsonb, add column diagnostics boolean,
      add column sharing_acknowledged boolean, add column accepted_at timestamptz;
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261002_adult_access_invitations.sql",import.meta.url),"utf8"));
  const newUser=id(1001), newSeat=id(1002), inviteHash="d".repeat(64), email="adult@test.invalid";
  const consent={agreement_version:"2026-09-22",privacy_version:"2026-09-22",
    age_confirmed:true,data_acknowledged:true,sharing_acknowledged:true,
    ai_processing:false,diagnostics:false,features:{mail:false,documents:false}};
  const create=()=>db.query("select create_adult_access_invitation($1,$2,$3) as result",[newSeat,inviteHash,email]);
  const inspect=()=>db.query("select check_adult_access_invitation($1) as result",[inviteHash]);
  const accept=(uid=newUser,c=consent)=>db.query("select accept_adult_access_invitation($1,$2,$3) as result",[inviteHash,uid,c]);
  const refused=async(fn,pattern)=>{
    await db.exec("savepoint refusal");
    await assert.rejects(fn,pattern);
    await db.exec("rollback to refusal; release savepoint refusal");
  };
  const seed=async()=>{
    await db.exec(`
      insert into auth.users(id,email) values('${newUser}','${email}');
      insert into travelers(id,family_id,user_id,is_person,date_of_birth,access_level,email,name)
      values('${newSeat}','${family}','${newUser}',true,current_date-interval '17 years','secondary','${email}','Adult Traveler');
      insert into family_members values('${newUser}','${family}','member');
      insert into profiles values('${newUser}','frost','large');
      insert into trip_travelers values('${id(31)}','${newSeat}');
      update travelers set date_of_birth=current_date-interval '18 years' where id='${newSeat}';
    `);
  };
  const isolated=async(name,body)=>t.test(name,async()=>{
    await admin(); await db.exec("begin");
    try { await seed(); await body(); } finally { await db.exec("rollback"); await admin(); }
  });
  await isolated("birthday does not unban or restore sessions; existing unknown bans need review",async()=>{
    assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[newUser])).rows[0].banned,true);
    assert.equal((await db.query("select review_required from private.minor_login_holds where user_id=$1",[newUser])).rows[0].review_required,false);
    assert.equal((await db.query("select review_required from private.minor_login_holds where user_id=$1",[child])).rows[0].review_required,true);
    await as(parent,id(102));
    const states=(await db.query("select adult_access_status($1) as result",[family])).rows[0].result;
    assert.equal(states[newSeat],"eligible");
    await create();
    assert.equal((await db.query("select adult_access_status($1) as result",[family])).rows[0].result[newSeat],"pending");
  });
  await isolated("under-18, missing birthday, secondary inviter, outsider and stale parent session are refused",async()=>{
    for(const dob of ["current_date-interval '18 years'+interval '1 day'","null"]) {
      await admin(); await db.exec(`update travelers set date_of_birth=${dob} where id='${newSeat}'`);
      await as(parent,id(102)); await refused(create,/eligible/);
    }
    await admin(); await db.exec(`update travelers set date_of_birth=current_date-interval '18 years' where id='${newSeat}'`);
    for(const [uid,sid] of [[other,id(104)],[newUser,id(1009)],[parent,id(101)]]) {
      await as(uid,sid); await refused(create,/eligible/);
    }
  });
  await isolated("parents cannot inspect bearer links or accept consent via direct RPC",async()=>{
    await as(parent,id(102)); await create();
    await refused(inspect,/permission denied/);
    await refused(accept,/permission denied/);
    await refused(()=>db.query("select * from adult_access_invitations"),/permission denied/);
    await refused(()=>db.query("select * from private.minor_login_holds"),/permission denied/);
  });
  await isolated("atomic adult acceptance preserves theme and assignments, resets permissions, rejects replay",async()=>{
    await as(parent,id(102)); await create(); await admin();
    assert.equal((await inspect()).rows[0].result.email,email);
    await db.exec(`insert into auth.sessions values('${id(1009)}','${newUser}')`);
    assert.equal((await accept()).rows[0].result,true);
    assert.equal((await db.query("select banned_until from auth.users where id=$1",[newUser])).rows[0].banned_until,null);
    assert.equal((await db.query("select * from auth.sessions where user_id=$1",[newUser])).rows.length,0);
    assert.equal((await db.query("select skin from profiles where id=$1",[newUser])).rows[0].skin,"frost");
    assert.equal((await db.query("select * from trip_travelers where traveler_id=$1",[newSeat])).rows.length,1);
    const c=(await db.query("select * from beta_consents where user_id=$1",[newUser])).rows[0];
    assert.equal(c.ai_processing,false); assert.equal(c.diagnostics,false); assert.equal(c.sharing_acknowledged,true);
    assert.equal((await db.query("select access_level,wants_reminders from travelers where id=$1",[newSeat])).rows[0].access_level,"secondary");
    await assert.rejects(accept(),/no longer available/);
  });
  await isolated("changed, missing, coerced or old consent is not accepted",async()=>{
    await as(parent,id(102)); await create(); await admin();
    for(const override of [{age_confirmed:false},{sharing_acknowledged:"true"},{privacy_version:"old"},{agreement_version:null}]) {
      await db.exec("savepoint consent_attempt");
      await assert.rejects(accept(newUser,{...consent,...override}),/personal consent/);
      await db.exec("rollback to consent_attempt");
    }
    assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[newUser])).rows[0].banned,true);
  });
  for(const [name,change] of [
    ["expired", "update adult_access_invitations set expires_at=now()-interval '1 second'"],
    ["revoked", "update adult_access_invitations set revoked_at=now()"],
    ["changed email", `update travelers set email='changed@test.invalid' where id='${newSeat}'`],
    ["changed DOB", `update travelers set date_of_birth=current_date-interval '19 years' where id='${newSeat}'`],
    ["parent consent withdrawn", `update beta_consents set withdrawn_at=now() where user_id='${parent}'`],
    ["different administrative ban", `update auth.users set banned_until=now()+interval '200 years' where id='${newUser}'`],
  ]) await isolated(`${name} blocks acceptance`,async()=>{
    await as(parent,id(102)); await create(); await admin(); await db.exec(change);
    await assert.rejects(accept(),/invitation|review|changed/);
  });
  await isolated("email duplicates and existing account mismatches cannot be invited",async()=>{
    await db.exec(`insert into travelers(id,family_id,email,is_person) values('${id(1003)}','${family}','${email}',true)`);
    await as(parent,id(102)); await assert.rejects(create(),/another traveler/);
  });
  await isolated("new adult account must be newly provisioned, verified, banned and unlinked",async()=>{
    await db.exec(`delete from family_members where user_id='${newUser}'; update travelers set user_id=null where id='${newSeat}'; delete from auth.users where id='${newUser}'`);
    await as(parent,id(102)); await create(); await admin();
    assert.equal((await inspect()).rows[0].result.needsPassword,true);
    await db.exec(`insert into auth.users(id,email,banned_until) values('${newUser}','${email}',now()+interval '100 years')`);
    const provisionedBan=(await db.query("select banned_until from auth.users where id=$1",[newUser])).rows[0].banned_until;
    await db.query("select accept_adult_access_invitation($1,$2,$3,$4)",[inviteHash,newUser,consent,provisionedBan]);
    assert.equal((await db.query("select user_id from travelers where id=$1",[newSeat])).rows[0].user_id,newUser);
    assert.equal((await db.query("select role from family_members where user_id=$1",[newUser])).rows[0].role,"member");
  });
  await isolated("resending invalidates previous link and revoking does not unban",async()=>{
    await as(parent,id(102)); await create(); await admin();
    await db.exec("update adult_access_invitations set created_at=now()-interval '2 minutes'");
    await as(parent,id(102));
    await db.query("select create_adult_access_invitation($1,$2,$3)",[newSeat,"e".repeat(64),email]);
    await admin(); await assert.rejects(inspect(),/no longer available/);
  });
  await isolated("parent cancellation revokes the capability without restoring login",async()=>{
    await as(parent,id(102)); await create();
    await db.query("select revoke_adult_access_invitation($1)",[newSeat]);
    await admin(); await refused(inspect,/no longer available/);
    assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[newUser])).rows[0].banned,true);
  });
  await isolated("wrong account, unverified email, and wrong account email are rejected",async()=>{
    await as(parent,id(102)); await create(); await admin();
    await refused(()=>accept(parent),/verified account/);
    await db.exec(`update auth.users set email_confirmed_at=null where id='${newUser}'`);
    await refused(accept,/verified account/);
    await db.exec(`update auth.users set email_confirmed_at=now(),email='wrong@test.invalid' where id='${newUser}'`);
    await refused(accept,/administrative review/);
  });
  await isolated("a new admin restriction during minority invalidates automatic release provenance",async()=>{
    await db.exec(`update travelers set date_of_birth=current_date-interval '17 years' where id='${newSeat}';
      update auth.users set banned_until=now()+interval '200 years' where id='${newUser}';
      update travelers set date_of_birth=current_date-interval '18 years' where id='${newSeat}';`);
    assert.equal((await db.query("select review_required from private.minor_login_holds where user_id=$1",[newUser])).rows[0].review_required,true);
    await as(parent,id(102)); await refused(create,/administrative review/);
  });
  await isolated("an existing owner role is never retained or silently demoted by activation",async()=>{
    await as(parent,id(102)); await create(); await admin();
    await db.exec(`update family_members set role='owner' where user_id='${newUser}'`);
    await refused(accept,/memberships.*review/);
    assert.equal((await db.query("select role from family_members where user_id=$1",[newUser])).rows[0].role,"owner");
  });
  await isolated("new minor auth creation records an age hold without a foreign-key race",async()=>{
    const newcomer=id(1100);
    await db.exec(`insert into travelers(id,family_id,email,is_person,date_of_birth,access_level)
      values('${id(1101)}','${family}','newminor@test.invalid',true,current_date-interval '12 years','secondary');
      insert into auth.users(id,email) values('${newcomer}','newminor@test.invalid');
      set constraints all immediate;`);
    assert.equal((await db.query("select review_required from private.minor_login_holds where user_id=$1",[newcomer])).rows[0].review_required,false);
    assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[newcomer])).rows[0].banned,true);
  });
  await isolated("ordinary Google enrollment cannot bypass a birthday or pending/expired invitation",async()=>{
    await db.exec(`insert into travelers(id,family_id,email,is_person,date_of_birth,access_level)
      values('${id(1200)}','${family}','birthday@test.invalid',true,current_date-interval '17 years','secondary');
      update travelers set date_of_birth=current_date-interval '18 years' where id='${id(1200)}';
      insert into auth.users(id,email) values('${id(1201)}','birthday@test.invalid');`);
    assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[id(1201)])).rows[0].banned,true);
    await db.exec(`insert into travelers(id,family_id,email,is_person,date_of_birth,access_level)
      values('${id(1202)}','${family}','pending@test.invalid',true,current_date-interval '19 years','secondary')`);
    await as(parent,id(102));
    await db.query("select create_adult_access_invitation($1,$2,$3)",[id(1202),"f".repeat(64),"pending@test.invalid"]);
    await admin();
    await db.exec(`update adult_access_invitations set expires_at=now()-interval '1 second';
      insert into auth.users(id,email) values('${id(1203)}','pending@test.invalid');`);
    assert.equal((await db.query("select banned_until>now() as banned from auth.users where id=$1",[id(1203)])).rows[0].banned,true);
  });
});
test("held child interactions preserve the parent boundary",async t=>{
  await admin();
  await db.exec("alter table trips add column cover_image_url text; alter table trips add column cover_image_alt text;");
  await db.exec(readFileSync(new URL("../supabase/migrations/20261004_child_trip_interactions.sql",import.meta.url),"utf8"));
  const v2="2026-09-19-parent-view-2", h="9".repeat(64);
  await db.exec(`insert into auth.sessions values('${id(900)}','${parent}')`);
  await assert.rejects(open(parent,seat,id(900),h,notice),/verified/);
  await open(parent,seat,id(900),h,v2);
  const pack=(item=id(51),value=true,token=h)=>db.query("select set_child_packing($1,$2,$3) as result",[token,item,value]);
  const theme=(skin="sodium",token=h)=>db.query("select set_child_theme($1,$2) as result",[token,skin]);
  const isolated=async(name,fn)=>t.test(name,async()=>{await admin();await db.exec("begin");try{await fn();}finally{await db.exec("rollback; reset role;");}});
  await isolated("filtered child projection includes status for standard trip grouping",async()=>{
    await db.exec(`update trips set status='complete' where id='${id(31)}'`);
    const result=await read(h);
    assert.equal(result.trips.find(trip=>trip.id===id(31)).status,"complete");
    await db.exec(`update trips set status='draft' where id='${id(31)}'`);
    assert.equal((await read(h)).trips.some(trip=>trip.id===id(31)),false);
  });
  await isolated("only own packing flag changes, and can be unchecked",async()=>{
    const before=(await db.query("select * from packing_items where id=$1",[id(51)])).rows[0];
    assert.equal((await pack()).rows[0].result.is_packed,true);
    const after=(await db.query("select * from packing_items where id=$1",[id(51)])).rows[0];
    assert.deepEqual(after,{...before,is_packed:true});
    assert.equal((await pack(id(51),false)).rows[0].result.is_packed,false);
  });
  // Each rejection runs in its own transaction because PostgreSQL aborts a
  // transaction after a denied mutation.
  for(const [name,sql,item] of [
    ["another person's item","",id(52)],["stashed item","",id(53)],["missing item","",id(599)],
    ["draft trip",`update trips set status='draft' where id='${id(31)}'`],
    ["removed roster",`delete from trip_travelers where trip_id='${id(31)}'`],
    ["foreign trip",`update trips set family_id='${id(11)}' where id='${id(31)}'`],
    ["pet item",`update packing_items set pet_id='${id(22)}' where id='${id(51)}'`],
    ["duplicate name",`insert into travelers(id,family_id,name,is_person) values('${id(599)}','${family}',' child ',true)`],
    ["revoked consent","update beta_consents set withdrawn_at=now()"],
    ["expired view","update parent_trip_views set expires_at=now()-interval '1 minute'"],
    ["closed view","update parent_trip_views set closed_at=now()"],
    ["old authorization","update parent_trip_views set notice_version='2026-09-19-parent-view-1'"],
    ["changed child identity",`update travelers set date_of_birth=date_of_birth-interval '1 day' where id='${seat}'`],
    ["parent removed",`delete from family_members where user_id='${parent}'`],
  ]) await isolated(`packing rejects ${name}`,async()=>{
    if(sql) await db.exec(sql);
    await assert.rejects(pack(item),/unavailable/);
  });
  await isolated("theme is scoped to traveler, persists, and leaves parent unchanged",async()=>{
    await theme();
    assert.equal((await read(h)).skin,"sodium");
    assert.equal((await db.query("select skin from profiles where id=$1",[parent])).rows[0].skin,"aurora");
    await db.exec(`insert into auth.sessions values('${id(901)}','${parent}')`);
    assert.equal((await open(parent,seat,id(901),"8".repeat(64),v2)).rows[0].result.skin,"sodium");
  });
  await isolated("theme also works for a child without a login profile",async()=>{
    await db.exec(`update travelers set user_id=null where id='${seat}';
      insert into auth.sessions values('${id(902)}','${parent}')`);
    await open(parent,seat,id(902),"7".repeat(64),v2);
    await theme("journal","7".repeat(64));
    assert.equal((await read("7".repeat(64))).skin,"journal");
  });
  await isolated("invalid theme fails",async()=>{await assert.rejects(theme("unknown"),/Invalid theme/);});
  for(const [name,sql] of [
    ["closed","update parent_trip_views set closed_at=now()"],
    ["old notice","update parent_trip_views set notice_version='2026-09-19-parent-view-1'"],
    ["withdrawn parent","update beta_consents set withdrawn_at=now()"],
  ]) await isolated(`theme denies ${name}`,async()=>{await db.exec(sql);await assert.rejects(theme(),/unavailable/);});
  for(const role of ["anon","authenticated"]) {
    await isolated(`${role} cannot invoke packing RPC`,async()=>{await as(parent,id(102),role);await assert.rejects(pack(),/permission denied/);});
    await isolated(`${role} cannot invoke theme RPC`,async()=>{await as(parent,id(102),role);await assert.rejects(theme(),/permission denied/);});
    await isolated(`${role} cannot read preferences`,async()=>{await as(parent,id(102),role);await assert.rejects(db.query("select * from child_view_preferences"),/permission denied/);});
  }
});
test("saved parent approval permits direct handoff without relaxing the boundary",async t=>{
  await admin();
  // The preceding test created a real v2 handoff. Migration carries its approval.
  await db.exec(readFileSync(new URL("../supabase/migrations/20261005_saved_parent_view_approval.sql",import.meta.url),"utf8"));
  const v2="2026-09-19-parent-view-2";
  const approved=async(p=parent,n=v2)=>(await db.query("select * from parent_view_approved_children($1,$2)",[p,n])).rows;
  const entry=(fresh=false,p=parent,c=seat,n=v2)=>db.query(
    "select open_approved_parent_trip_view($1,$2,$3,$4,$5,$6) as result",
    [p,c,id(950),"6".repeat(64),n,fresh]);
  const isolated=async(name,fn)=>t.test(name,async()=>{
    await admin();await db.exec("begin");
    try { await db.exec(`insert into auth.sessions values('${id(950)}','${parent}')`);await fn(); }
    finally {await db.exec("rollback; reset role;");}
  });
  await isolated("verified historical approval survives a finished view",async()=>{
    assert.deepEqual(await approved(),[{traveler_id:seat}]);
    await db.exec("update parent_trip_views set closed_at=now(),expires_at=now()-interval '1 day'");
    assert.deepEqual(await approved(),[{traveler_id:seat}]);
    assert.equal((await entry()).rows[0].result.skin,"frost");
    assert.equal((await db.query("select * from auth.sessions where id=$1",[id(950)])).rows.length,0);
    assert.equal((await read("6".repeat(64))).enabled,true);
  });
  await isolated("first verified setup persists approval atomically",async()=>{
    await db.exec("delete from parent_view_approvals");
    await entry(true);
    assert.deepEqual(await approved(),[{traveler_id:seat}]);
  });
  await isolated("revoke closes active views and removes direct-entry eligibility",async()=>{
    await db.query("select revoke_parent_view_approval($1,$2)",[parent,seat]);
    assert.deepEqual(await approved(),[]);
    assert.equal((await read("9".repeat(64))).enabled,false);
    await assert.rejects(entry(),/setup required/);
  });
  await isolated("verified setup can renew a revoked approval",async()=>{
    await db.query("select revoke_parent_view_approval($1,$2)",[parent,seat]);
    await entry(true);
    assert.deepEqual(await approved(),[{traveler_id:seat}]);
  });
  for(const [name,sql] of [
    ["no approval","delete from parent_view_approvals"],
    ["revoked approval","update parent_view_approvals set revoked_at=now()"],
    ["old notice","update parent_view_approvals set notice_version='old'"],
    ["changed birthday",`update travelers set date_of_birth=date_of_birth-interval '1 day' where id='${seat}'`],
    ["changed user",`update travelers set user_id=null where id='${seat}'`],
    ["changed household",`update travelers set family_id='${id(11)}' where id='${seat}'`],
    ["adult child",`update travelers set date_of_birth=current_date-interval '18 years' where id='${seat}'`],
    ["removed parent",`delete from family_members where user_id='${parent}'`],
    ["secondary parent",`update travelers set access_level='secondary' where user_id='${parent}'`],
    ["withdrawn beta","update beta_consents set withdrawn_at=now()"],
    ["missing passkey","delete from parent_view_keys"],
    ["banned parent",`update auth.users set banned_until=now()+interval '1 day' where id='${parent}'`],
  ]) await isolated(`direct entry rejects ${name}`,async()=>{
    await db.exec(sql);assert.deepEqual(await approved(),[]);
    await assert.rejects(entry(),/setup required/);
  });
  await isolated("another parent cannot reuse this approval",async()=>{
    assert.deepEqual(await approved(other),[]);
    await assert.rejects(entry(false,other),/setup required/);
  });
  await isolated("another child cannot reuse this approval",async()=>{
    await assert.rejects(entry(false,parent,id(23)),/setup required/);
  });
  await isolated("changed server notice requires setup",async()=>{
    assert.deepEqual(await approved(parent,"new"),[]);
    await assert.rejects(entry(false,parent,seat,"new"),/setup required/);
  });
  await isolated("stale parent session cannot open a view",async()=>{
    await db.exec(`delete from auth.sessions where id='${id(950)}'`);
    await assert.rejects(entry(),/verified/);
  });
  for(const role of ["anon","authenticated"]) {
    await isolated(`${role} cannot read approval`,async()=>{
      await as(parent,id(102),role);
      await assert.rejects(db.query("select * from parent_view_approvals"),/permission denied/);
    });
    await isolated(`${role} cannot forge fresh verification`,async()=>{
      await as(parent,id(102),role);await assert.rejects(entry(true),/permission denied/);
    });
    await isolated(`${role} cannot query saved approval`,async()=>{
      await as(parent,id(102),role);await assert.rejects(approved(),/permission denied/);
    });
    await isolated(`${role} cannot revoke through RPC`,async()=>{
      await as(parent,id(102),role);
      await assert.rejects(db.query("select revoke_parent_view_approval($1,$2)",[parent,seat]),/permission denied/);
    });
  }
});
test.after(async()=>db.close());
