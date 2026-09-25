-- Consent for letting an external assistant read a household's data through
-- the MCP connection, and the OAuth clients that connection recognizes.
--
-- This is a different question from ai_processing on beta_consents. That flag
-- answers "may Alyeska's own features send my text to OpenAI or Gemini?" This
-- table answers a narrower, later question: "may a named third-party assistant
-- -- something outside Alyeska entirely, like a phone's built-in assistant or an
-- MCP-speaking client someone installed -- read what Alyeska already knows?"
-- Nobody has been asked that yet, so nobody has answered it, and this table is
-- built ready rather than wired live: rows can exist, but nothing in the MCP
-- route (lib/mcp/scope.js) checks this table for a live connection until
-- counsel has reviewed the consent screen's wording. See
-- research/assistant-surface-implementation-spec.md.
--
-- One row per (account, client) rather than one flag per account, because the
-- real question is "may *this* assistant read my data", not "assistants in
-- general" -- an account may approve one MCP client and never see another. A
-- person revokes by row, not by an all-or-nothing switch.

create table if not exists public.assistant_oauth_clients (
  -- Supabase's own client_id from OAuth Apps / dynamic registration. Not
  -- generated here -- this table names clients, it does not create them.
  client_id text primary key,

  -- What the consent screen shows: who is asking. Filled in when a client is
  -- pre-registered (Authentication > OAuth Apps) or backfilled from the
  -- dynamic registration metadata when allow_dynamic_registration is on.
  client_name text not null,
  client_description text,

  -- Free text for now (a house style for the consent screen to read from),
  -- not the seven MCP tool names -- those are fixed in lib/mcp/tools.js and do
  -- not vary by client. This is what the screen tells a person the client is
  -- for, e.g. "Reads your trip dates and packing status."
  purpose_summary text,

  -- Whether this client may be approved at all. False is the default and the
  -- state every client starts in and stays in until counsel has reviewed the
  -- consent surface -- see assistant_connections_enabled() below, which the
  -- approval route must call before accepting any answer.
  approved_for_consent boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.assistant_oauth_clients is
  'Named OAuth clients the assistant-connection consent screen may show. Not the MCP tool list -- that is fixed in code. approved_for_consent gates whether the screen will accept an answer about this client at all.';

alter table public.assistant_oauth_clients enable row level security;

-- Everybody signed in may read the client directory -- it is what the consent
-- screen shows before anyone has decided anything, the same way a login
-- screen names the app before a password is typed. Nothing here is
-- per-household; the directory is the same for every account.
create policy assistant_oauth_clients_read
  on public.assistant_oauth_clients
  for select
  to authenticated
  using (true);

-- No insert/update/delete policy for anyone. Clients are named by app code
-- running as the service role (the same pattern as the nightly reminder job in
-- lib/supabase/admin.js), not by a person's own session, so there is
-- deliberately no policy here for authenticated to write through.

create table if not exists public.assistant_connections (
  id uuid primary key default gen_random_uuid(),

  -- Whose answer this is. A person's own decision about their own data, the
  -- same shape as beta_consents -- one household member cannot approve a
  -- connection on behalf of another.
  user_id uuid not null references auth.users (id) on delete cascade,

  client_id text not null references public.assistant_oauth_clients (client_id) on delete cascade,

  -- allowed | denied | revoked. Denying and revoking are both "no access"; kept
  -- distinct because a screen explaining what happened says something
  -- different for each -- "you said no" versus "you said yes, then took it
  -- back" -- and a support conversation about either needs to tell them apart.
  status text not null check (status in ('allowed', 'denied', 'revoked')),

  -- The consent surface's own version, tracked the same way
  -- lib/beta/agreement.js tracks AGREEMENT_VERSION -- a dated string, bumped
  -- when what the screen discloses changes, so an old answer stops covering
  -- new wording. Not yet wired to anything, because the screen itself has not
  -- shipped to a real audience; present now so the rollout does not need a
  -- schema change later.
  consent_version text not null,

  decided_at timestamptz not null default now(),
  revoked_at timestamptz,

  created_at timestamptz not null default now(),

  unique (user_id, client_id)
);

comment on table public.assistant_connections is
  'One row per account per OAuth client: whether that account has allowed, denied, or revoked that assistant reading its data through MCP. Built ready per the step-2 authorization; live use stays blocked until counsel reviews this consent surface and the MCP route is wired to check it.';

alter table public.assistant_connections enable row level security;

-- A person reads and writes only their own answers. No family-wide read: one
-- member's choice to let an assistant see their own scope of the data is not
-- something a housemate gets to see or veto by looking, matching how
-- beta_consents is not family-scoped either.
create policy assistant_connections_own_read
  on public.assistant_connections
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy assistant_connections_own_write
  on public.assistant_connections
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy assistant_connections_own_update
  on public.assistant_connections
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Revocation is a normal update (status -> 'revoked', revoked_at set), not a
-- delete -- the same append-only instinct as beta_consent_events, so "this
-- person approved this client on this date, then revoked it on that date" is
-- still readable afterward. No delete policy for anyone.

create index if not exists assistant_connections_user_idx
  on public.assistant_connections (user_id);

create index if not exists assistant_connections_client_idx
  on public.assistant_connections (client_id);

-- The one function the MCP route will eventually call before trusting any row
-- in assistant_connections. It exists now, returns false unconditionally, and
-- is the single place that gets flipped once counsel has reviewed the consent
-- screen -- one function, not a search-and-replace across every caller.
--
-- Applied to production as 20260925172340_assistant_connection_consent. The
-- search_path pin the security advisor asked for afterward lives in its own
-- file, 20261020_pin_assistant_switch_search_path.sql.
create or replace function public.assistant_connections_enabled()
returns boolean
language sql
stable
as $$
  select false;
$$;

comment on function public.assistant_connections_enabled is
  'Whether real assistant connections may be approved and used. Hard-false until counsel reviews the MCP consent screen; flip to true (or make it read a settings row) only after that review, per the step-2 authorization to build this schema ready but gated.';
