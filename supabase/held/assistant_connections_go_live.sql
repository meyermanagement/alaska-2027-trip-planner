-- HELD. Do not apply.
--
-- Turns on assistant connections: after this, an approved client with an
-- allowed, current-version, unrevoked row in assistant_connections can read
-- that household's trips through /api/mcp.
--
-- Kept outside supabase/migrations so no tool picks it up by accident.
-- Before it moves there with a dated name, all of these must be true:
--   1. Counsel has signed off on the consent screen (app/oauth/consent) and
--      the "Connected assistants" section in Settings.
--   2. CONSENT_SURFACE_VERSION in lib/mcp/consentVersion.js is raised to the
--      reviewed version, in the same release, so earlier approvals ask again.
--   3. Mark has given an explicit go-ahead for this migration.
--
-- Requires 20261020_pin_assistant_switch_search_path.sql first; this keeps
-- the pin.

create or replace function public.assistant_connections_enabled()
returns boolean
language sql
stable
set search_path = ''
as $$
  select true;
$$;

comment on function public.assistant_connections_enabled is
  'Whether real assistant connections may be approved and used. On since counsel reviewed the MCP consent screen; return false here to turn every connection off at once.';
