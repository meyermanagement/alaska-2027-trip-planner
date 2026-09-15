-- Make account deletion possible, and make it provable.
--
-- The beta terms and the privacy policy both say that deleting your account in
-- Settings removes your household's data within 30 days. Nothing in the app did
-- that. There was no route, no function, and no button -- the promise was
-- written and never wired. This migration is the database half of it.
--
-- Most of the work was already here and nobody had noticed. Deleting a families
-- row cascades to thirty-one tables, and trips and travelers cascade again from
-- there, so one delete already reaches itinerary items, packing lists,
-- pre-departure tasks, notes, costs, facts, insurance, pets, templates, and
-- traveler documents. Deleting an auth user cascades profiles, membership,
-- consent, consent history, survey answers, conversations, messages, usage
-- events, feedback, and refusals. The gap was never the bulk of the data.
--
-- The gap was three narrower things: ten foreign keys that refuse the delete
-- outright, files that no cascade can reach, and no record afterwards that any
-- of it happened.


-- 1. Ten authorship columns that block the delete
--
-- These ten reference auth.users with NO ACTION, which is the database refusing
-- to lose track of who wrote a row. Applied to an author it means the opposite of
-- what it looks like: auth.admin.deleteUser returns a foreign key violation and
-- deletes nothing at all. So the promise failed at the first call, for every
-- account that had ever filed an email or priced a trip.
--
-- Twenty-odd sibling columns -- trips.created_by, packing_items.packed_by,
-- itinerary_items.updated_by and the rest -- already say SET NULL, which is the
-- right answer: the row is the household's, the name on it is the person's, and
-- when the person goes the row stays and the name does not. These ten were
-- written later and picked the default instead. Every one is already nullable,
-- so this is a constraint change and not a data change.
--
-- Ordering alone would hide the problem in the whole-household case, because the
-- family delete takes these rows with it. It would not fix the case where one
-- member leaves a household that carries on, and depending on statement order
-- for a correctness property is how this comes back.

alter table public.calendar_feeds
  drop constraint calendar_feeds_created_by_fkey,
  add constraint calendar_feeds_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.family_forwarders
  drop constraint family_forwarders_added_by_fkey,
  add constraint family_forwarders_added_by_fkey
    foreign key (added_by) references auth.users (id) on delete set null;

alter table public.favorite_moments
  drop constraint favorite_moments_created_by_fkey,
  add constraint favorite_moments_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.inbox_messages
  drop constraint inbox_messages_filed_by_fkey,
  add constraint inbox_messages_filed_by_fkey
    foreign key (filed_by) references auth.users (id) on delete set null;

alter table public.insurance_documents
  drop constraint insurance_documents_created_by_fkey,
  add constraint insurance_documents_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.insurance_policies
  drop constraint insurance_policies_created_by_fkey,
  add constraint insurance_policies_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.insurance_policies
  drop constraint insurance_policies_updated_by_fkey,
  add constraint insurance_policies_updated_by_fkey
    foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.trip_costs
  drop constraint trip_costs_created_by_fkey,
  add constraint trip_costs_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.trip_costs
  drop constraint trip_costs_updated_by_fkey,
  add constraint trip_costs_updated_by_fkey
    foreign key (updated_by) references auth.users (id) on delete set null;

alter table public.trip_insurance_policies
  drop constraint trip_insurance_policies_created_by_fkey,
  add constraint trip_insurance_policies_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;


-- 2. The record that has to outlive the account
--
-- A deletion nobody can evidence is a deletion that did not happen, as far as an
-- app store reviewer or a regulator is concerned. This table is the receipt: who
-- asked, what scope, when, and what the run actually removed.
--
-- user_id deliberately has no foreign key. The whole point of the row is that it
-- survives the user it names, and a reference would either block the delete or
-- take the receipt with it.
--
-- The email is kept because it is the only identifier that ties a support
-- request to a completed run once the account is gone. It is the narrowest
-- retention in the policy and it is stated there.
--
-- storage_errors exists because a file we failed to remove has to be visible
-- rather than swallowed. An open row with an error in it can be retried; a
-- silent exception cannot.

create table if not exists public.deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  user_email      text not null,
  family_id       uuid,
  scope           text not null check (scope in ('member', 'household')),
  requested_by    text not null default 'self' check (requested_by in ('self', 'support')),
  requested_at    timestamptz not null default now(),
  completed_at    timestamptz,
  objects_removed integer not null default 0,
  storage_errors  jsonb,
  note            text
);

create index if not exists deletion_requests_open_idx
  on public.deletion_requests (requested_at)
  where completed_at is null;

-- RLS on with no policy, deliberately, exactly as signup_codes is: the
-- deny-everything state is the intended one. A tester has no reason to read a
-- list of who has left, and adding a policy to quiet the linter would be the
-- wrong repair. The route reaches it with the service role.
alter table public.deletion_requests enable row level security;

-- And the grants underneath, so RLS is the second refusal rather than the only
-- one, and the table never appears on the REST surface.
revoke all on public.deletion_requests from anon, authenticated;


-- 3. Every file the cascade cannot reach
--
-- Deleting rows orphans objects. Files live in three buckets -- documents,
-- feedback-shots, and trip-covers -- and the paths that name them are scattered
-- across four tables, two of which are only reachable from the family by way of
-- trips and travelers. Collecting them in the route would mean four round trips
-- and a join the caller has no right to make.
--
-- SECURITY DEFINER because the caller's own rights are not the question here:
-- the route has already established that this person is deleting their own
-- household, and by the time the files are removed the rows naming them are
-- gone. Execute is revoked from everybody but the service role for that reason.
--
-- Paths must be collected before the delete, since afterwards there is nothing
-- left to read them from.
--
-- Two arguments rather than one, because the two scopes remove different things.
-- A household delete takes the household's documents with it. A member leaving a
-- household that carries on takes only their own feedback screenshots, and
-- p_family is passed as null so the document branches return nothing. Feedback
-- keys on the person either way: another member's screenshot is theirs, and the
-- household closing is not a reason to reach into it.

create or replace function public.account_deletion_paths(p_family uuid, p_user uuid)
returns table (bucket text, path text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select 'documents'::text, td.storage_path
    from traveler_documents td
    join travelers t on t.id = td.traveler_id
   where t.family_id = p_family
     and td.storage_path is not null

  union all
  select 'documents'::text, ind.storage_path
    from insurance_documents ind
   where ind.family_id = p_family
     and ind.storage_path is not null

  union all
  select 'documents'::text, idoc.storage_path
    from item_documents idoc
    join itinerary_items ii on ii.id = idoc.itinerary_item_id
    join trips tr on tr.id = ii.trip_id
   where tr.family_id = p_family
     and idoc.storage_path is not null

  union all
  select 'documents'::text, ia.storage_path
    from inbox_attachments ia
   where ia.family_id = p_family
     and ia.storage_path is not null

  union all
  select 'feedback-shots'::text, fb.path
    from feedback fb
   where fb.user_id = p_user
     and fb.path is not null;
$$;

revoke all on function public.account_deletion_paths(uuid, uuid) from public;
revoke all on function public.account_deletion_paths(uuid, uuid) from anon, authenticated;

comment on function public.account_deletion_paths(uuid, uuid) is
  'Storage objects belonging to a household, collected before deletion. Service role only; see app/api/account/delete.';
