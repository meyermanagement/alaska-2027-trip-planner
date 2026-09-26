-- Turns on assistant connections: after this, an approved client with an
-- allowed, current-version, unrevoked row in assistant_connections can read
-- that household's trips through /api/mcp.
--
-- Applied on Mark's explicit go-ahead on 2026-09-25, before counsel's
-- sign-off, while his account held the only approval. The consent screen's
-- wording did not change, so CONSENT_SURFACE_VERSION stays at 2026-10-19.
-- If counsel asks for wording changes, raise that version in the same
-- release so earlier approvals ask again.
--
-- To turn every connection off at once, apply a migration returning false.
-- Requires 20261020_pin_assistant_switch_search_path.sql first; keeps the pin.

create or replace function public.assistant_connections_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;

comment on function public.assistant_connections_enabled is
  'Whether real assistant connections may be approved and used. On since 2026-09-25, turned on by Mark for his own account ahead of counsel review; return false here to turn every connection off at once.';
