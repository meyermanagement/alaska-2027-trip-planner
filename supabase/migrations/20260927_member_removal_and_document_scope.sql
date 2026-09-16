-- Taking somebody out of a household, and making the drawer as narrow as the rows in it.
--
-- Two findings from the September 16 isolation pass, both of them about the same
-- thing: what a household member can still reach after the household would
-- rather they could not.
--
-- 1. There was no way to remove a member at all. `family_members` carried a
--    select policy and nothing else, and no route deleted a row, so an owner's
--    DELETE matched nothing and returned success. The only removal-shaped action
--    the app offered was unlinking the traveler's seat, which left the
--    membership row -- and therefore the household's trips, its people, and a
--    freshly signed URL for somebody else's passport -- fully readable to a
--    person who had just been shown the door. The sharing screen and the beta
--    terms both say removal takes access away, so the promise was the thing that
--    was wrong.
--
-- 2. The documents bucket sat one trust level wider than the tables it stores
--    files for. `documents_read` asked only "are you in this household", while
--    `traveler_documents` refuses a secondary traveler outright. So a secondary
--    could not read the row describing a passport and could still sign the
--    passport itself. The interface never offers that path, which is why review
--    missed it and why a probe found it.
--
-- Removal is a SECURITY DEFINER function rather than a delete policy. A delete
-- policy would be the smaller change, but removing a member is not one DELETE:
-- it is the membership row, the traveler's seat, that person's push devices, and
-- a receipt saying it happened. Those have to succeed or fail together, and the
-- rule about who may do it is worth stating once in a place the app cannot
-- forget to call.

-- ---------------------------------------------------------------------------
-- A receipt, because "their access was removed" is a claim somebody will ask us
-- to evidence. It holds no address and no name -- the ids are enough to prove a
-- removal happened and to reconstruct who did it while both rows still exist,
-- and it stops being able to identify anybody once the household is deleted.
-- ---------------------------------------------------------------------------
create table if not exists public.member_removals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  removed_user uuid not null,
  removed_traveler uuid,
  removed_by uuid not null,
  devices_removed integer not null default 0,
  at timestamptz not null default now()
);

comment on table public.member_removals is
  'One row per household member removal: who was removed, from where, by whom, and when. Evidence that revocation happened; carries no name or address.';

create index if not exists member_removals_family_idx
  on public.member_removals (family_id, at desc);

alter table public.member_removals enable row level security;

-- Readable by the household it belongs to, written only by the function below.
drop policy if exists member_removals_select on public.member_removals;
create policy member_removals_select on public.member_removals
  for select to authenticated
  using (private.is_family_member(family_id));

-- ---------------------------------------------------------------------------
-- The removal itself.
-- ---------------------------------------------------------------------------
create or replace function public.remove_household_member(p_traveler uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid       uuid := auth.uid();
  v_family    uuid;
  v_target    uuid;
  v_name      text;
  v_devices   integer := 0;
begin
  if v_uid is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;

  select t.family_id, t.user_id, t.name
    into v_family, v_target, v_name
    from public.travelers t
   where t.id = p_traveler;

  if v_family is null then
    raise exception 'There is nobody here by that id.' using errcode = 'P0002';
  end if;

  -- Only a primary traveler of that household, and only somebody who is not the
  -- person being removed. Both halves matter: the first is the rule, and the
  -- second stops a household locking itself out of its own trips one tap from
  -- the pill next to it.
  if not exists (
    select 1 from public.travelers me
     where me.family_id = v_family
       and me.user_id = v_uid
       and coalesce(me.is_person, true)
       and me.access_level = 'primary'
  ) then
    raise exception
      'Only a primary traveler can remove somebody from this household.'
      using errcode = '42501';
  end if;

  if v_target = v_uid then
    raise exception
      'You cannot remove yourself. Another primary traveler has to do it, or you can delete your account in Settings.'
      using errcode = '42501';
  end if;

  -- An unclaimed seat has no access to take away. Clearing the invitation is
  -- still the right answer to the button, so say so rather than raising.
  if v_target is null then
    update public.travelers
       set invited_at = null
     where id = p_traveler;
    return json_build_object(
      'ok', true, 'name', v_name, 'wasSignedIn', false, 'devicesRemoved', 0
    );
  end if;

  -- The membership row is the perimeter: everything else in the schema asks
  -- is_family_member, including the storage policies on the documents bucket.
  delete from public.family_members
   where family_id = v_family
     and user_id = v_target;

  -- The seat goes back to being an unclaimed person, so the household keeps the
  -- traveler, their packing and their history. Removing a member is not deleting
  -- a person from the trip.
  update public.travelers
     set user_id = null,
         linked_at = null,
         invited_at = null
   where id = p_traveler;

  -- Anything that would keep speaking to them after the fact. A push
  -- subscription outlives a session, so a device left registered would go on
  -- delivering this household's reminders to somebody who is no longer in it.
  with gone as (
    delete from public.push_subscriptions
     where user_id = v_target
       and family_id = v_family
    returning 1
  )
  select count(*) into v_devices from gone;

  insert into public.member_removals
    (family_id, removed_user, removed_traveler, removed_by, devices_removed)
  values
    (v_family, v_target, p_traveler, v_uid, v_devices);

  return json_build_object(
    'ok', true,
    'name', v_name,
    'wasSignedIn', true,
    'devicesRemoved', v_devices
  );
end;
$$;

comment on function public.remove_household_member(uuid) is
  'Removes a signed-in member from the household that owns the given traveler: drops the membership row, unclaims the seat, retires their push devices for that household, and writes a receipt. Primary travelers only, and never yourself.';

revoke all on function public.remove_household_member(uuid) from public;
revoke all on function public.remove_household_member(uuid) from anon;
grant execute on function public.remove_household_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The documents bucket, narrowed to match the tables.
--
-- One helper rather than the condition written twice, because a read rule and a
-- delete rule that drift apart is exactly the class of bug this migration
-- exists to fix. The path convention is <family_id>/<scope>/<owner_id>/<file>,
-- written in lib/documents/upload.js, and the scope segment is what says which
-- table's rules apply.
-- ---------------------------------------------------------------------------
create or replace function private.uuid_or_null(p_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

create or replace function private.item_trip(p_item uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select ii.trip_id from itinerary_items ii where ii.id = p_item;
$$;

revoke all on function private.item_trip(uuid) from public;
revoke all on function private.item_trip(uuid) from anon;

/**
 * Can the caller open this object in the documents bucket?
 *
 * Household membership first, because that is the perimeter. Then the same
 * distinction the tables draw: a secondary traveler is somebody tagging along,
 * so passports and licenses are not theirs to open, an insurance policy is
 * (insurance_documents lets the whole household read), and a file attached to an
 * itinerary item is theirs only if they are actually on that trip.
 *
 * Anything with a scope this function does not recognize -- including the inbox
 * folder and whatever gets added next -- is primaries only. Failing closed on an
 * unknown scope is the whole point: the previous rule failed open on every
 * scope at once.
 */
create or replace function private.can_open_document(p_name text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  with parts as (
    select storage.foldername(p_name) as f
  ),
  named as (
    select
      private.uuid_or_null((select f[1] from parts)) as family_id,
      (select f[2] from parts)                       as scope,
      private.uuid_or_null((select f[3] from parts)) as owner_id
  )
  select
    n.family_id is not null
    and private.is_family_member(n.family_id)
    and case
      when not private.is_secondary_traveler(n.family_id) then true
      when n.scope = 'insurance' then true
      when n.scope = 'trip' then
        n.owner_id is not null
        and private.on_trip(private.item_trip(n.owner_id))
      else false
    end
  from named n;
$$;

comment on function private.can_open_document(text) is
  'Read rule for the documents bucket, keyed on the <family_id>/<scope>/<owner_id>/ path convention. Mirrors the row policies on traveler_documents, insurance_documents and item_documents; unknown scopes are primaries only.';

revoke all on function private.can_open_document(text) from public;
revoke all on function private.can_open_document(text) from anon;

drop policy if exists documents_read on storage.objects;
create policy documents_read on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.can_open_document(name));

-- Deleting a stored file is a primary traveler's job in every one of these
-- tables, so the delete rule does not need the scope distinction -- only the
-- household check and the level check.
drop policy if exists documents_delete on storage.objects;
create policy documents_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and private.is_family_member(private.uuid_or_null((storage.foldername(name))[1]))
    and not private.is_secondary_traveler(
      private.uuid_or_null((storage.foldername(name))[1])
    )
  );

-- Uploading follows the same rule as deleting: your own household, and not
-- somebody tagging along.
drop policy if exists documents_write on storage.objects;
create policy documents_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and private.is_family_member(private.uuid_or_null((storage.foldername(name))[1]))
    and not private.is_secondary_traveler(
      private.uuid_or_null((storage.foldername(name))[1])
    )
  );
