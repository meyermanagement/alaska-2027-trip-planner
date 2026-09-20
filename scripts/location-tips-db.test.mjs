import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema private;
create table auth.users(id uuid primary key);
create table trips(id uuid primary key, family_id uuid);
create table push_subscriptions(id uuid primary key);
create table roster(user_id uuid, trip_id uuid);
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create function private.is_minor_account(uuid) returns boolean language sql as $$select $1='${id(3)}'$$;
create function private.can_access_trip(uuid) returns boolean language sql security definer as $$select exists(select 1 from roster where user_id=auth.uid() and trip_id=$1)$$;
grant usage on schema auth,private to authenticated;
insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}');
insert into trips values('${id(10)}','${id(100)}'),('${id(20)}','${id(200)}');
insert into roster values('${id(1)}','${id(10)}'),('${id(2)}','${id(10)}'),('${id(3)}','${id(10)}'),('${id(4)}','${id(20)}');
insert into push_subscriptions values('${id(30)}');
`);
await db.exec(readFileSync(new URL("../supabase/migrations/20261013_personal_location_tips.sql", import.meta.url), "utf8"));
const pref = async (user, trip = 10) => db.exec(`insert into location_tip_preferences(user_id,trip_id,enabled,notice_version,revision)
 values('${id(user)}','${id(trip)}',true,'foreground-location-v1','${id(40)}')`);
for (const user of [1, 2, 3]) await pref(user);
await pref(4, 20);
const claim = async (user = 1, token = 50, auto = false, device = true) =>
  (await db.query(`select claim_location_tips('${id(user)}','${id(10)}','${id(40)}','${id(token)}',${auto},${device}) as ok`)).rows[0].ok;
const finish = async (user = 1, token = 50) =>
  (await db.query(`select finish_location_tips('${id(user)}','${id(10)}','${id(40)}','${id(token)}',
  '[{"fingerprint":"ferry","content":{"title":"Verified ferry change","urgency":"now"}}]'::jsonb) as ok`)).rows[0].ok;
test("per-person locks isolate co-travelers and block duplicate work", async () => {
  assert.equal(await claim(), true);
  assert.equal(await claim(1, 51), false);
  assert.equal(await claim(2, 52), true);
  assert.equal(await finish(1, 51), false);
  assert.equal(await finish(), true);
  assert.equal(await claim(1, 51), false);
  await db.exec(`update location_tip_preferences set checked_at=now()-interval '2 minutes' where user_id='${id(1)}'`);
  assert.equal(await claim(1, 51, true), false);
  assert.equal(await claim(1, 51, false), true);
});
test("turning off invalidates an in-flight result and prevents device refresh", async () => {
  await db.exec(`update location_tip_preferences set enabled=false,revision='${id(41)}',token=null where user_id='${id(1)}'`);
  assert.equal(await finish(1, 51), false);
  assert.equal(await claim(1, 51), false);
  await db.exec(`update location_tip_preferences set revision='${id(40)}',checked_at=null,locked_until=null where user_id='${id(1)}'`);
  assert.equal(await claim(1, 51, false, true), false);
  assert.equal(await claim(1, 51, false, false), true);
});
test("cleared tips stay cleared on rerun", async () => {
  await db.exec(`update location_tips set status='dismissed' where user_id='${id(1)}'`);
  assert.equal(await finish(1, 51), true);
  assert.equal((await db.query(`select status from location_tips where user_id='${id(1)}'`)).rows[0].status, "dismissed");
});
test("owner-only RLS denies other adults, another tenant, minors and removed roster members", async () => {
  for (const user of [1, 2, 3, 4]) {
    await db.exec(`set role authenticated; set test.uid='${id(user)}'`);
    const tips = (await db.query("select * from location_tips")).rows;
    assert.equal(tips.length, user === 1 ? 1 : 0);
    const prefs = (await db.query("select * from location_tip_preferences")).rows;
    assert.equal(prefs.length, user === 3 ? 0 : 1);
    await assert.rejects(claim(), /permission denied/);
    await assert.rejects(db.exec(`update location_tip_preferences set enabled=true`), /permission denied/);
    await db.exec("reset role");
  }
  await db.exec(`delete from roster where user_id='${id(1)}'; set role authenticated; set test.uid='${id(1)}'`);
  assert.equal((await db.query("select * from location_tips")).rows.length, 0);
  await db.exec("reset role");
});
test("notification claims deduplicate and account deletion cascades", async () => {
  const tip = (await db.query("select id from location_tips")).rows[0].id;
  await db.exec(`insert into location_tip_pushes values('${tip}','${id(30)}')`);
  await assert.rejects(db.exec(`insert into location_tip_pushes values('${tip}','${id(30)}')`), /duplicate key/);
  await db.exec(`delete from auth.users where id='${id(1)}'`);
  assert.equal((await db.query("select * from location_tips")).rows.length, 0);
  assert.equal((await db.query("select * from location_tip_pushes")).rows.length, 0);
});
test.after(() => db.close());
