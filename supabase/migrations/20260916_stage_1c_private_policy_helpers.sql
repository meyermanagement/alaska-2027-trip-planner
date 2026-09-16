-- Stage 1C: the policy helpers leave the schema the API exposes.
--
-- The problem this closes, stated plainly. Row-level security policies on this
-- database are written in terms of nine small SECURITY DEFINER functions --
-- is_family_member, can_access_trip, trip_family and so on. A policy expression
-- is evaluated with the privileges of the caller, so `authenticated` has to hold
-- EXECUTE on each of them or every policy that names one stops working. Stage 1B
-- learned that the hard way. But anything executable in the `public` schema is
-- also a REST endpoint, because PostgREST exposes `public`. So every one of those
-- nine was callable directly at /rest/v1/rpc/<name> by any signed-in tester.
--
-- Seven of the nine only ever answered a question about the caller, so calling
-- them directly told you nothing you did not already know. Two did not:
--
--   trip_family(tid)      -> the family_id of any trip, to anybody
--   traveler_family(pid)  -> the family_id of any traveler, to anybody
--
-- That is gap 21, found on September 15, 2026 by probing the live API as two real
-- signed-in owners of separate households: household B asked for the family id of
-- household C's trip and got it. No rows leaked -- the policies still refused
-- every read and write -- but a household identifier is not something one
-- household should be able to obtain about another, and neither function checks
-- who is asking.
--
-- The fix is not to revoke, which breaks the policies, and not to add a caller
-- check, which the policies cannot tolerate: `is_family_member(trip_family(id))`
-- has to be able to resolve the family of a trip the caller cannot see, or the
-- expression can never evaluate to true in the first place. The fix is to move
-- the functions somewhere the API does not look, while leaving the grants intact.
-- PostgREST exposes named schemas; `private` is not one of them.
--
-- ALTER FUNCTION ... SET SCHEMA is used deliberately rather than
-- create-in-private-then-drop-from-public. Policies store the function's OID, not
-- its name, so moving a function rewrites nothing: all 137 policies on `public`
-- keep working, with no window in which a policy references a function that does
-- not exist. Grants move with the function too.
--
-- What stays in `public`: claim_traveler_seat, join_family_with_code and
-- redeem_signup_code. Those are real RPCs the app calls by name from the browser.
-- They are not policy helpers, and each already validates its own caller.

create schema if not exists private;

comment on schema private is
  'Policy helpers. Not exposed by PostgREST, so nothing in here is a REST endpoint, while authenticated keeps the EXECUTE that row-level security needs. See 20260916_stage_1c_private_policy_helpers.sql.';

-- USAGE only. It does not grant EXECUTE on anything; the per-function grants that
-- travel with the functions below are what let a policy evaluate.
grant usage on schema private to authenticated, anon, service_role;

alter function public.is_family_member(uuid) set schema private;
alter function public.is_secondary_traveler(uuid) set schema private;
alter function public.can_access_trip(uuid) set schema private;
alter function public.on_trip(uuid) set schema private;
alter function public.shares_family_with(uuid) set schema private;
alter function public.can_see_conversation(uuid, text) set schema private;
alter function public.my_traveler_name(uuid) set schema private;
alter function public.traveler_family(uuid) set schema private;
alter function public.trip_family(uuid) set schema private;

-- Three trigger functions call those helpers by unqualified name, and plpgsql
-- resolves names when the line runs rather than when the function is created. All
-- three are pinned to `search_path=public`, which no longer contains the helpers,
-- so without this they would start failing the moment somebody edited a packing
-- list. `private` goes last: a table in public still wins.
alter function public.day_pack_secondary_may_only_check_off()
  set search_path = public, private, pg_temp;
alter function public.secondary_may_only_check_off()
  set search_path = public, private, pg_temp;
alter function public.travelers_secondary_guard()
  set search_path = public, private, pg_temp;

-- Verify rather than assume. Any failure here aborts the migration.
do $$
declare
  n int;
  missing text;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private'
    and p.proname in ('is_family_member','is_secondary_traveler','can_access_trip',
                      'on_trip','shares_family_with','can_see_conversation',
                      'my_traveler_name','traveler_family','trip_family');
  if n <> 9 then
    raise exception 'expected 9 helpers in private, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('is_family_member','is_secondary_traveler','can_access_trip',
                      'on_trip','shares_family_with','can_see_conversation',
                      'my_traveler_name','traveler_family','trip_family');
  if n <> 0 then
    raise exception '% policy helpers are still in public and therefore still REST endpoints', n;
  end if;

  -- The half that is easy to forget: a moved function nobody can execute is an
  -- outage, not a hardening.
  select string_agg(p.proname, ', ') into missing
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private'
    and not has_function_privilege('authenticated', p.oid, 'execute');
  if missing is not null then
    raise exception 'authenticated cannot execute % -- every policy naming it would fail closed', missing;
  end if;

  if not has_schema_privilege('authenticated', 'private', 'usage') then
    raise exception 'authenticated lacks USAGE on private';
  end if;

  -- The three RPCs the browser calls must not have been swept up.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.proname in ('claim_traveler_seat','join_family_with_code','redeem_signup_code');
  if n <> 3 then
    raise exception 'the app-facing RPCs are no longer in public (found %)', n;
  end if;
end $$;

notify pgrst, 'reload schema';
