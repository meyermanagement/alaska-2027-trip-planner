import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const modulePath = process.env.PGLITE_MODULE;
if (!modulePath) throw new Error("Set PGLITE_MODULE to run the required child-access database tests.");
const { PGlite } = await import(modulePath);
const sql = readFileSync(new URL("../supabase/migrations/20260922_parent_managed_access.sql", import.meta.url), "utf8");
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const parent = id(1), child = id(2), other = id(3), reviewer = id(4);
const family = id(10), another = id(11), childSeat = id(22);
const db = new PGlite();
await db.exec(`
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
grant usage on schema auth,private,public to authenticated,service_role,anon;
create table public.families(id uuid primary key);
create table public.family_members(user_id uuid,family_id uuid);
create table public.travelers(id uuid primary key,family_id uuid,user_id uuid,is_person boolean default true,date_of_birth date,access_level text);
create table public.beta_consents(user_id uuid primary key,agreement_version text,privacy_version text,age_confirmed boolean,data_acknowledged boolean,ai_processing boolean,withdrawn_at timestamptz);
create function private.is_family_member(fid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.family_members where user_id=auth.uid() and family_id=fid) $$;
create function private.is_secondary_traveler(fid uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.travelers where user_id=auth.uid() and family_id=fid and access_level='secondary') $$;
insert into auth.users values('${parent}'),('${child}'),('${other}'),('${reviewer}');
insert into public.families values('${family}'),('${another}');
insert into public.family_members values('${parent}','${family}'),('${child}','${family}'),('${other}','${another}');
insert into public.travelers values
 ('${id(21)}','${family}','${parent}',true,current_date-interval '42 years','primary'),
 ('${childSeat}','${family}','${child}',true,current_date-interval '12 years','secondary'),
 ('${id(23)}','${another}','${other}',true,current_date-interval '40 years','primary');
insert into public.beta_consents values
 ('${parent}','2026-09-22','2026-09-22',true,true,true,null),
 ('${other}','2026-09-22','2026-09-22',true,true,true,null);
`);
await db.exec(sql);
const as = async (user, role = "authenticated") => db.exec(`reset role; set test.uid='${user}'; set role ${role};`);
const ask = (params = {}) => db.query(`select * from public.request_child_access(
 $1, $2, $3, $4, $5, $6, $7, $8)`, [
 params.child || childSeat, params.ai ?? true, params.guardian ?? true,
 params.collection ?? true, params.disclosure ?? true, params.notice ?? "2026-09-19-draft-1",
 "2026-09-22", "2026-09-22",
]);
let requestId;
test("database rejects a child, other household, missing attestations, stale notice, and adult target", async () => {
  await as(child); await assert.rejects(ask(), /adult primary/);
  await as(other); await assert.rejects(ask(), /adult primary/);
  await as(parent);
  await assert.rejects(ask({ guardian: false }), /confirmations/);
  await assert.rejects(ask({ disclosure: false }), /confirmations/);
  await assert.rejects(ask({ notice: "old" }), /current parent notice/);
  await assert.rejects(ask({ child: id(21) }), /Choose a child/);
});
test("database records separate parent choices and prevents optimistic duplicate replacement", async () => {
  await as(parent);
  const result = await ask();
  const row = result.rows[0]; requestId = row.id;
  assert.equal(row.status, "pending");
  assert.equal(row.ai_requested, true);
  assert.equal(row.guardian_user_id, parent);
  await assert.rejects(ask(), /already exists/);
});
test("direct writes and forged client verification are denied", async () => {
  await as(parent);
  await assert.rejects(db.exec(`update public.child_access_requests set status='verified' where id='${requestId}'`), /permission denied/);
  await assert.rejects(db.exec(`select public.review_child_access('${requestId}','${reviewer}','verified','signed_form','record_123')`), /permission denied/);
  await as(child);
  assert.equal((await db.query("select * from public.child_access_requests")).rows.length, 0);
  await as(other);
  assert.equal((await db.query("select * from public.child_access_requests")).rows.length, 0);
});
test("verification requires independent reviewer and recorded evidence", async () => {
  await as(reviewer, "service_role");
  await assert.rejects(db.exec(`select public.review_child_access('${requestId}','${parent}','verified','signed_form','record_123')`), /different authorized reviewer/);
  await assert.rejects(db.exec(`select public.review_child_access('${requestId}','${reviewer}','verified','email_plus','record_123')`), /method and restricted/);
  await assert.rejects(db.exec(`select public.review_child_access('${requestId}','${reviewer}','verified','signed_form',null)`), /method and restricted/);
  const { rows } = await db.query(`select * from public.review_child_access('${requestId}','${reviewer}','verified','signed_form','record_123')`);
  assert.equal(rows[0].status, "verified");
  assert.equal(Object.hasOwn(rows[0], "ai_enabled"), false);
});
test("withdrawal survives adult-consent withdrawal, is atomic with audit, and prevents stale review", async () => {
  await db.exec(`reset role; update public.beta_consents set withdrawn_at=now() where user_id='${parent}'`);
  await as(other);
  await assert.rejects(db.exec(`select public.withdraw_child_access('${requestId}')`), /Only the requesting parent/);
  await as(parent);
  const result = await db.query(`select * from public.withdraw_child_access('${requestId}')`);
  assert.equal(result.rows[0].status, "revoked");
  await as(reviewer, "service_role");
  await assert.rejects(db.exec(`select public.review_child_access('${requestId}','${reviewer}','verified','signed_form','record_123')`), /no longer awaiting/);
  await db.exec("reset role");
  const { rows } = await db.query("select event from public.child_access_events order by created_at");
  assert.deepEqual(rows.map(row => row.event), ["requested", "verified", "revoked"]);
});
test("a direct child adult-consent insert fails at the database layer", async () => {
  await db.exec("reset role");
  await assert.rejects(db.exec(`insert into public.beta_consents values('${child}','2026-09-22','2026-09-22',true,true,true,null)`), /Child accounts require/);
});
test("profile and guardian consent changes prevent approval; deleted child cleans up requests and audit", async () => {
  await db.exec(`reset role; update public.beta_consents set withdrawn_at=null where user_id='${parent}'`);
  await as(parent); await ask({ ai: false, disclosure: false });
  await db.exec(`reset role; update public.travelers set date_of_birth=current_date-interval '11 years' where id='${childSeat}'`);
  await as(reviewer, "service_role");
  await assert.rejects(db.exec(`select public.review_child_access('${requestId}','${reviewer}','verified','signed_form','record_456')`), /profile changed/);
  await db.exec(`reset role; delete from public.travelers where id='${childSeat}'`);
  assert.equal((await db.query("select * from public.child_access_requests")).rows.length, 0);
  assert.equal((await db.query("select * from public.child_access_events")).rows.length, 0);
});
test.after(async () => { await db.close(); });
