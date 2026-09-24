// The 2026-09-24 compatibility migration, run against stand-ins for the six live
// functions that named the old version: every literal is rewritten to the one
// authority, privileges survive, an old acceptance stops counting and a new one
// starts. PGLITE_MODULE points at @electric-sql/pglite.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AGREEMENT_VERSION, PRIVACY_VERSION } from "../lib/beta/agreement.js";

const { PGlite } = await import(process.env.PGLITE_MODULE);
const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20261018_consent_version_luna.sql", import.meta.url),
  "utf8",
);

await db.exec(`
create role authenticated; create role service_role;
create schema private;
create table public.beta_consents(user_id uuid primary key, agreement_version text, privacy_version text);
insert into public.beta_consents values
  ('00000000-0000-0000-0000-000000000001','2026-09-22','2026-09-22'),
  ('00000000-0000-0000-0000-000000000002','2026-09-24','2026-09-24');
create function private.parent_may_open_trip_view(u uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.beta_consents b where b.user_id = u
    and b.agreement_version='2026-09-22' and b.privacy_version='2026-09-22') $$;
create function public.accept_adult_access_invitation(p_consent jsonb) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_consent->>'agreement_version' is distinct from '2026-09-22'
     or p_consent->>'privacy_version' is distinct from '2026-09-22' then
    return 'consent_outdated';
  end if;
  return 'ok';
end $$;
revoke all on function public.accept_adult_access_invitation(jsonb) from public;
grant execute on function public.accept_adult_access_invitation(jsonb) to authenticated;
create function public.untouched() returns text language sql as $$ select '2026-09-19-draft-1' $$;
`);

test("the app and the database agree on the version", () => {
  assert.equal(AGREEMENT_VERSION, "2026-09-24");
  assert.equal(PRIVACY_VERSION, "2026-09-24");
  assert.match(migration, /select '2026-09-24'::text/);
});

test("the migration rewrites every literal and leaves nothing naming the old one", async () => {
  await db.exec(migration);
  const left = await db.query(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname in ('public','private') and p.prosrc like '%''2026-09-22''%'`,
  );
  assert.deepEqual(left.rows, []);
  const untouched = await db.query("select public.untouched() v");
  assert.equal(untouched.rows[0].v, "2026-09-19-draft-1");
});

test("an old acceptance stops counting and a new one counts", async () => {
  const r = await db.query(
    `select private.parent_may_open_trip_view('00000000-0000-0000-0000-000000000001') old,
            private.parent_may_open_trip_view('00000000-0000-0000-0000-000000000002') new`,
  );
  assert.equal(r.rows[0].old, false);
  assert.equal(r.rows[0].new, true);
  const stored = await db.query(
    "select agreement_version from public.beta_consents where user_id='00000000-0000-0000-0000-000000000001'",
  );
  assert.equal(stored.rows[0].agreement_version, "2026-09-22", "the old row is not overwritten");
});

test("the invitation takes the new version and refuses the old", async () => {
  const q = (v) =>
    db.query("select public.accept_adult_access_invitation($1::jsonb) r", [
      JSON.stringify({ agreement_version: v, privacy_version: v }),
    ]);
  assert.equal((await q("2026-09-22")).rows[0].r, "consent_outdated");
  assert.equal((await q("2026-09-24")).rows[0].r, "ok");
});

test("grants survive the rewrite", async () => {
  const r = await db.query(
    `select has_function_privilege('authenticated','public.accept_adult_access_invitation(jsonb)','execute') a,
            has_function_privilege('public','public.accept_adult_access_invitation(jsonb)','execute') p`,
  );
  assert.equal(r.rows[0].a, true);
  assert.equal(r.rows[0].p, false);
});

test("running it twice is harmless", async () => {
  await db.exec(migration);
});
