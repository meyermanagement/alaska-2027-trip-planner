-- Stage 1C, second half: the guard triggers point at `private` too.
--
-- The first migration moved nine policy helpers into `private` and widened the
-- search_path of the three trigger functions that call them. That was not enough,
-- and a smoke test found it within a minute: updating a packing list as a real
-- signed-in owner failed with 42883, no function matches the given name.
--
-- The reason is that these three bodies do not rely on search_path at all. They
-- name the schema outright -- `public.trip_family(new.trip_id)` -- which was good
-- practice right up until the function stopped living in `public`. A widened
-- search_path cannot rescue a call that already says which schema to look in.
--
-- So the bodies are rewritten to say `private.`, and search_path goes back to the
-- narrow `public, pg_temp`: with every helper call qualified there is nothing left
-- for `private` on the path to resolve, and a shorter path is one less place for a
-- shadowing object to hide.
--
-- Worth writing down, because it is the second time in two days that reading the
-- code would have missed it: a permission change that looks complete in the
-- migration is not verified until something exercises the write path. The
-- migration's own assertions all passed. Editing a packing list is what failed.

create or replace function public.secondary_may_only_check_off()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fid uuid;
  mine text;
begin
  fid := private.trip_family(new.trip_id);
  if not private.is_secondary_traveler(fid) then
    return new;
  end if;

  mine := private.my_traveler_name(fid);
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
end
$$;

create or replace function public.day_pack_secondary_may_only_check_off()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  fid uuid;
begin
  fid := private.trip_family(new.trip_id);
  if not private.is_secondary_traveler(fid) then
    return new;
  end if;
  if new.trip_id is distinct from old.trip_id
    or new.item is distinct from old.item
    or new.item_date is distinct from old.item_date
    or new.why is distinct from old.why
    or new.assignee is distinct from old.assignee
    or new.source is distinct from old.source
    or new.from_tip_id is distinct from old.from_tip_id
    or new.sort_order is distinct from old.sort_order
  then
    raise exception
      'You can check things off the day pack, but not change what is on it.'
      using errcode = '42501';
  end if;
  return new;
end
$$;

create or replace function public.travelers_secondary_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not private.is_secondary_traveler(new.family_id) then
    return new;
  end if;

  -- Their own row is the only one the policy let through, but a trigger that
  -- assumes that is a trigger that breaks the day the policy changes.
  if old.user_id is distinct from auth.uid() then
    raise exception 'A secondary traveler can only edit their own About Me.'
      using errcode = '42501';
  end if;

  -- Every column except the one, compared as a whole rather than named one at a
  -- time. A list of columns is a list that goes stale: the day somebody adds a
  -- column to travelers, a blacklist quietly makes it writable by a secondary and
  -- nobody notices. Subtracting about_me from both rows and comparing what is
  -- left says "this and nothing else" once, permanently.
  if to_jsonb(new) - 'about_me' is distinct from to_jsonb(old) - 'about_me' then
    raise exception 'A secondary traveler can only change their own About Me.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- No function anywhere may still be calling a helper at its old address. This is
-- the assertion the first migration should have carried.
do $$
declare
  offenders text;
begin
  select string_agg(ns.nspname || '.' || p.proname, ', ') into offenders
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname in ('public', 'private')
    and p.prosrc ~ 'public\.(is_family_member|is_secondary_traveler|can_access_trip|on_trip|shares_family_with|can_see_conversation|my_traveler_name|traveler_family|trip_family)\s*\(';
  if offenders is not null then
    raise exception 'still calling a moved helper at public.: %', offenders;
  end if;
end $$;

notify pgrst, 'reload schema';
