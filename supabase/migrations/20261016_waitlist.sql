-- The waitlist on the front door.
--
-- People who want into the beta and do not have an invite code. The list is for
-- two things only: inviting families into the beta, and recruiting organizers
-- for the Alyeska Groups pilot and the nonprofit program. It is never sold or
-- shared, the same promise the rest of the app makes.
--
-- Row-level security is on and there are no policies, on purpose. The only
-- writer is /api/waitlist through the service role, and nobody -- signed in or
-- not -- can read the list back through the public API.
--
-- The address is stored lowercased, so the unique constraint is the dedupe: a
-- second submission of the same address is ignored by the route.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(email) and char_length(email) between 3 and 254),
  household_size smallint check (household_size between 1 and 6),
  organizer boolean not null default false,
  source text not null default 'home' check (char_length(source) <= 40),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

revoke all on table public.waitlist from anon, authenticated;

comment on table public.waitlist is
  'Front-door waitlist. Beta invitations and Groups/nonprofit pilot recruiting only; never sold or shared.';
comment on column public.waitlist.household_size is
  'Travelers in the household, 1 to 6; 6 means six or more. Optional.';
comment on column public.waitlist.organizer is
  'Ticked "I organize trips for a group or an organization."';
