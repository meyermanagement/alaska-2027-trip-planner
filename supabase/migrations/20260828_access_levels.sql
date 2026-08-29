-- Access levels: primary travelers run the trip, secondary travelers come along.
--
-- A secondary traveler is a minor or a friend tagging along. They see the
-- itinerary and the packing items assigned to them, they can check those off,
-- they can see and complete their own pre-departure tasks, and they can ask Aly
-- questions. Everything else is closed to them: other people's packing, the
-- documents drawer, the wallet, the templates, the family roster, and any write
-- at all to a trip.
--
-- The rules live here rather than only in the app because the app talks to this
-- database with the signed-in user's own token. A restriction that exists only
-- in a React component is a suggestion.

-- ---------------------------------------------------------------------------
-- 1. The column
-- ---------------------------------------------------------------------------

alter table travelers
  add column if not exists access_level text not null default 'primary';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travelers_access_level_check'
  ) then
    alter table travelers
      add constraint travelers_access_level_check
      check (access_level in ('primary', 'secondary'));
  end if;
end $$;

-- Everybody already on file stays exactly as they were. Mark chose this: nobody
-- loses access because a migration ran.
update travelers set access_level = 'primary' where access_level is null;

comment on column travelers.access_level is
  'primary = full access. secondary = itinerary, own packing items, own tasks, read-only Aly. "Shared" is not a person and its level is meaningless.';

-- ---------------------------------------------------------------------------
-- 2. Who is asking
-- ---------------------------------------------------------------------------

-- Deliberately fails open: a member with no traveler row of their own is treated
-- as primary. Family membership is the perimeter and it is unchanged by any of
-- this -- you cannot get a family_members row without the household's invite
-- code. Access level is a refinement inside a household that already trusts
-- you, so an unlinked seat must not become a lockout. When create_family is
-- eventually built it has to create the founder's traveler row.
create or replace function public.is_secondary_traveler(fid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from travelers t
    where t.family_id = fid
      and t.user_id = auth.uid()
      and t.is_person
      and t.access_level = 'secondary'
  );
$$;

-- Assignment is by name in this schema, on both packing items and tasks, so
-- "mine" is a name comparison rather than an id one.
create or replace function public.my_traveler_name(fid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select t.name
  from travelers t
  where t.family_id = fid
    and t.user_id = auth.uid()
    and t.is_person
  order by t.sort_order
  limit 1;
$$;

-- The documents drawer hangs off the person, not the household.
create or replace function public.traveler_family(pid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.family_id from travelers t where t.id = pid;
$$;

create or replace function public.trip_family(tid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.family_id from trips t where t.id = tid;
$$;

-- Whether the asker is on a given trip at all. A friend tagging along on the
-- Curacao week has no business reading the Alaska plans.
create or replace function public.on_trip(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from trip_travelers tt
    join travelers t on t.id = tt.traveler_id
    where tt.trip_id = tid and t.user_id = auth.uid()
  );
$$;

grant execute on function public.is_secondary_traveler(uuid) to authenticated;
grant execute on function public.my_traveler_name(uuid) to authenticated;
grant execute on function public.trip_family(uuid) to authenticated;
grant execute on function public.traveler_family(uuid) to authenticated;
grant execute on function public.on_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A family always keeps at least one primary
-- ---------------------------------------------------------------------------

-- This one rule covers what Mark asked for twice over. The founder starts as the
-- only primary, so demoting them would leave zero and is refused; once somebody
-- else is primary, the founder can be demoted like anyone. No "founder" column
-- is needed to express it.
create or replace function public.travelers_keep_a_primary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  others integer;
begin
  -- Only a primary ceasing to be one can break the rule.
  if tg_op = 'UPDATE' then
    if old.access_level <> 'primary' then return new; end if;
    if new.access_level = 'primary' and new.is_person then return new; end if;
  elsif tg_op = 'DELETE' then
    if old.access_level <> 'primary' or not old.is_person then return old; end if;
  end if;

  select count(*) into others
  from travelers t
  where t.family_id = old.family_id
    and t.is_person
    and t.access_level = 'primary'
    and t.id <> old.id;

  if others = 0 then
    raise exception
      'Somebody has to stay in charge: % is the only primary traveler on this family. Make another person primary first.',
      old.name
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists travelers_keep_a_primary on travelers;
create trigger travelers_keep_a_primary
  before update or delete on travelers
  for each row execute function public.travelers_keep_a_primary();

-- ---------------------------------------------------------------------------
-- 4. What a secondary may change on a row they are allowed to touch
-- ---------------------------------------------------------------------------

-- Row-level security cannot say "you may change this column but not that one",
-- and checking off an item is exactly a single-column update. So the row policy
-- decides which rows, and this decides which columns.
create or replace function public.secondary_may_only_check_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
  mine text;
begin
  fid := public.trip_family(new.trip_id);
  if not public.is_secondary_traveler(fid) then
    return new;
  end if;

  mine := public.my_traveler_name(fid);
  if mine is null or new.assignee is distinct from mine then
    raise exception 'That is not yours to change.' using errcode = '42501';
  end if;

  if tg_table_name = 'packing_items' then
    -- Everything except the packed flag and its bookkeeping must be untouched.
    if new.trip_id is distinct from old.trip_id
      or new.item is distinct from old.item
      or new.category is distinct from old.category
      or new.assignee is distinct from old.assignee
      or new.quantity is distinct from old.quantity
      or new.bag is distinct from old.bag
      or new.notes is distinct from old.notes
      or new.sort_order is distinct from old.sort_order
      or new.stashed_at is distinct from old.stashed_at
      or new.stashed_for is distinct from old.stashed_for
      or new.pet_id is distinct from old.pet_id
    then
      raise exception
        'You can check your own things off the list, but not change them.'
        using errcode = '42501';
    end if;
  elsif tg_table_name = 'predeparture_tasks' then
    if new.trip_id is distinct from old.trip_id
      or new.title is distinct from old.title
      or new.detail is distinct from old.detail
      or new.assignee is distinct from old.assignee
      or new.due_date is distinct from old.due_date
      or new.timing is distinct from old.timing
      or new.priority is distinct from old.priority
      or new.sort_order is distinct from old.sort_order
      or new.itinerary_item_id is distinct from old.itinerary_item_id
    then
      raise exception
        'You can finish your own tasks, but not change what they say.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists packing_secondary_guard on packing_items;
create trigger packing_secondary_guard
  before update on packing_items
  for each row execute function public.secondary_may_only_check_off();

drop trigger if exists tasks_secondary_guard on predeparture_tasks;
create trigger tasks_secondary_guard
  before update on predeparture_tasks
  for each row execute function public.secondary_may_only_check_off();

-- ---------------------------------------------------------------------------
-- 5. The row policies
-- ---------------------------------------------------------------------------

-- Added as RESTRICTIVE so the existing per-family policies stay exactly as they
-- are and these are ANDed on top. Every one is written as "not a secondary, OR
-- the narrow thing a secondary may do", so a primary traveler is unaffected.
--
-- These are split by command on purpose. A single FOR ALL policy is a trap: a
-- DELETE consults only USING, so "you may read your own row" silently becomes
-- "you may delete your own row". Reads and writes are therefore stated
-- separately, and INSERT and DELETE are denied outright wherever a secondary has
-- no business creating or destroying anything.

-- Old FOR ALL shapes from the first pass of this migration.
drop policy if exists trips_secondary on trips;
drop policy if exists itinerary_secondary on itinerary_items;
drop policy if exists packing_secondary on packing_items;
drop policy if exists tasks_secondary on predeparture_tasks;
drop policy if exists travelers_secondary on travelers;
drop policy if exists documents_secondary on traveler_documents;
drop policy if exists rewards_secondary on rewards_programs;
drop policy if exists prefs_secondary on travel_preferences;
drop policy if exists pets_secondary on pets;
drop policy if exists templates_secondary on packing_templates;
drop policy if exists template_items_secondary on packing_template_items;
drop policy if exists trip_travelers_secondary on trip_travelers;
drop policy if exists trip_pets_secondary on trip_pets;
drop policy if exists trip_notes_secondary on trip_notes;
drop policy if exists families_secondary on families;

-- Trips: read the ones you are on, write none of them.
create policy trips_secondary_read on trips as restrictive for select to authenticated
  using (not public.is_secondary_traveler(family_id) or public.on_trip(id));
create policy trips_secondary_insert on trips as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(family_id));
create policy trips_secondary_update on trips as restrictive for update to authenticated
  using (not public.is_secondary_traveler(family_id))
  with check (not public.is_secondary_traveler(family_id));
create policy trips_secondary_delete on trips as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(family_id));

-- The itinerary, which they are meant to see and not touch.
create policy itinerary_secondary_read on itinerary_items as restrictive for select to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or public.on_trip(trip_id)
  );
create policy itinerary_secondary_insert on itinerary_items as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy itinerary_secondary_update on itinerary_items as restrictive for update to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)))
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy itinerary_secondary_delete on itinerary_items as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

-- Packing: read and update their own lines, create and destroy nothing. Which
-- columns an update may touch is section 4's job.
create policy packing_secondary_read on packing_items as restrictive for select to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and assignee = public.my_traveler_name(public.trip_family(trip_id))
    )
  );
create policy packing_secondary_update on packing_items as restrictive for update to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and assignee = public.my_traveler_name(public.trip_family(trip_id))
    )
  )
  with check (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and assignee = public.my_traveler_name(public.trip_family(trip_id))
    )
  );
create policy packing_secondary_insert on packing_items as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy packing_secondary_delete on packing_items as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

-- Tasks: the same shape.
create policy tasks_secondary_read on predeparture_tasks as restrictive for select to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and assignee = public.my_traveler_name(public.trip_family(trip_id))
    )
  );
create policy tasks_secondary_update on predeparture_tasks as restrictive for update to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and assignee = public.my_traveler_name(public.trip_family(trip_id))
    )
  )
  with check (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and assignee = public.my_traveler_name(public.trip_family(trip_id))
    )
  );
create policy tasks_secondary_insert on predeparture_tasks as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy tasks_secondary_delete on predeparture_tasks as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

-- The roster: see who is in the family, change nobody, including yourself. A
-- secondary who could edit their own row could promote themselves.
create policy travelers_secondary_insert on travelers as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(family_id));
create policy travelers_secondary_update on travelers as restrictive for update to authenticated
  using (not public.is_secondary_traveler(family_id))
  with check (not public.is_secondary_traveler(family_id));
create policy travelers_secondary_delete on travelers as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(family_id));

-- Passport and license numbers: not readable at all by somebody tagging along.
create policy documents_secondary_all on traveler_documents as restrictive for all to authenticated
  using (not public.is_secondary_traveler(public.traveler_family(traveler_id)))
  with check (not public.is_secondary_traveler(public.traveler_family(traveler_id)));

-- Points, miles and card numbers: likewise.
create policy rewards_secondary_all on rewards_programs as restrictive for all to authenticated
  using (not public.is_secondary_traveler(family_id))
  with check (not public.is_secondary_traveler(family_id));

-- Read-only for the rest: visible where it already was, writable by nobody
-- tagging along.
create policy prefs_secondary_write on travel_preferences as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(family_id));
create policy prefs_secondary_update on travel_preferences as restrictive for update to authenticated
  using (not public.is_secondary_traveler(family_id))
  with check (not public.is_secondary_traveler(family_id));
create policy prefs_secondary_delete on travel_preferences as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(family_id));

create policy pets_secondary_write on pets as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(family_id));
create policy pets_secondary_update on pets as restrictive for update to authenticated
  using (not public.is_secondary_traveler(family_id))
  with check (not public.is_secondary_traveler(family_id));
create policy pets_secondary_delete on pets as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(family_id));

create policy templates_secondary_all on packing_templates as restrictive for all to authenticated
  using (not public.is_secondary_traveler(family_id))
  with check (not public.is_secondary_traveler(family_id));

create policy template_items_secondary_all on packing_template_items as restrictive for all to authenticated
  using (
    not public.is_secondary_traveler(
      (select family_id from packing_templates pt where pt.id = template_id)
    )
  )
  with check (
    not public.is_secondary_traveler(
      (select family_id from packing_templates pt where pt.id = template_id)
    )
  );

create policy trip_travelers_secondary_insert on trip_travelers as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy trip_travelers_secondary_update on trip_travelers as restrictive for update to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)))
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy trip_travelers_secondary_delete on trip_travelers as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

create policy trip_pets_secondary_insert on trip_pets as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy trip_pets_secondary_update on trip_pets as restrictive for update to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)))
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy trip_pets_secondary_delete on trip_pets as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

create policy notes_secondary_read on trip_notes as restrictive for select to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or public.on_trip(trip_id)
  );
create policy notes_secondary_insert on trip_notes as restrictive for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy notes_secondary_update on trip_notes as restrictive for update to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)))
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));
create policy notes_secondary_delete on trip_notes as restrictive for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

create policy families_secondary_update on families as restrictive for update to authenticated
  using (not public.is_secondary_traveler(id))
  with check (not public.is_secondary_traveler(id));
