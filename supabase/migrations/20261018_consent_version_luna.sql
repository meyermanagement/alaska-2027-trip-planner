-- Consent version 2026-09-24: Ask Aly's answers move to the OpenAI API.
--
-- Six live functions compare a stored or submitted consent to the literal
-- '2026-09-22'. Bumping AGREEMENT_VERSION and PRIVACY_VERSION in the app without
-- this would let a parent re-accept while adult invitations, the parent-opened
-- trip view, parent key recovery and minor review kept demanding the old one.
--
-- Rather than edit six literals to a seventh, every one of them now asks one
-- function. The next bump is this function and the two app constants, together.
--
-- Transition: until an account re-accepts, the functions that read its stored
-- consent treat it as not current -- the same as the app's own gate does. Apply
-- this with the deploy that changes lib/beta/agreement.js, not before it.

create or replace function private.beta_consent_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-24'::text $$;

revoke all on function private.beta_consent_version() from public;
grant execute on function private.beta_consent_version() to authenticated, service_role;

do $$
declare
  f record;
  def text;
  rewritten text;
begin
  for f in
    select p.oid, n.nspname, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and p.proname <> 'beta_consent_version'
      and p.prosrc like '%''2026-09-22''%'
  loop
    def := pg_get_functiondef(f.oid);
    rewritten := replace(def, '''2026-09-22''', 'private.beta_consent_version()');
    if rewritten = def then
      raise exception 'consent literal not rewritten in %.%', f.nspname, f.proname;
    end if;
    execute rewritten;
    raise notice 'consent version now read from private.beta_consent_version() in %.%', f.nspname, f.proname;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prosrc like '%''2026-09-22''%'
  ) then
    raise exception 'a function still names consent version 2026-09-22';
  end if;
end
$$;
