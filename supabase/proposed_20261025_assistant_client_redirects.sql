-- PROPOSED, NOT APPLIED. Needs Mark's explicit go-ahead before it runs.
--
-- Lets a signed-in person's session read one OAuth client's registration type
-- and registered return addresses, so Alyeska can recognize a self-registered
-- (dynamic) client by where its approvals go (lib/mcp/trust.js).
--
-- auth.oauth_clients is not readable from a session. This exposes only the two
-- columns needed, for one client_id at a time, and only for clients that are
-- not deleted. Return addresses are public callback URLs, not secrets. No
-- client secret, name or other metadata is returned.
--
-- Safe to apply before dynamic registration is turned on: with no dynamic
-- clients it changes nothing anybody can do.

create or replace function public.assistant_client_redirects(p_client_id text)
returns table (registration_type text, redirect_uris text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.registration_type::text, c.redirect_uris
  from auth.oauth_clients c
  where c.id::text = p_client_id
    and c.deleted_at is null
$$;

revoke all on function public.assistant_client_redirects(text) from public, anon;
grant execute on function public.assistant_client_redirects(text) to authenticated;
