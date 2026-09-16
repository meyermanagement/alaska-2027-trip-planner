-- The guard that kept somebody in charge of a household also made the household
-- impossible to delete.
--
-- travelers_keep_a_primary refuses to remove the last primary traveler, which is
-- right when somebody is editing their family and wrong when the family itself is
-- being deleted. Deleting a family cascades to travelers, the travelers go one row
-- at a time, and whichever primary happens to go last has no other primary behind
-- it -- so the guard raised, the statement rolled back, and the account-deletion
-- route reported that it could not finish. Every household hit this, not an unusual
-- arrangement of one: there is always a last traveler.
--
-- Found by performing a deletion on a seeded household rather than by reading the
-- route, which is the same way the Stage 1C trigger regression was found. The
-- route's own behavior on failure was correct -- it aborted before removing
-- anything and wrote the reason into deletion_requests -- so nothing was lost, but
-- the promise in the privacy policy was unmet.
--
-- The fix is to stand the guard down when the family row is already gone. Inside
-- the cascade the parent delete has been applied in this same command, so the
-- lookup finds nothing and the guard has nothing left to protect. Outside the
-- cascade -- somebody removing a traveler by hand -- the family is still there and
-- the guard behaves exactly as before.

create or replace function public.travelers_keep_a_primary()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  others integer;
begin
  -- The household is going away. Nothing to keep in charge of it.
  --
  -- Deleting a family cascades here, and by the time this runs the families row
  -- has already been deleted by the same command, so this finds no row. An
  -- ordinary traveler delete still sees its family and falls through to the
  -- check below.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.families f where f.id = old.family_id) then
    return old;
  end if;

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
end
$$;

-- The guard still guards. A household with one primary traveler and its family
-- row intact must still refuse the delete, or this migration has traded a broken
-- deletion for a household nobody can administer.
do $$
declare
  fam uuid;
  solo uuid;
  blocked boolean := false;
begin
  insert into public.families (name, invite_code)
  values ('Guard assertion family', upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)))
  returning id into fam;

  insert into public.travelers (family_id, name, is_person, access_level)
  values (fam, 'Only Primary', true, 'primary')
  returning id into solo;

  begin
    delete from public.travelers where id = solo;
  exception when check_violation then
    blocked := true;
  end;

  if not blocked then
    raise exception 'the guard no longer refuses removing the last primary traveler';
  end if;

  -- And the family, deleted whole, must now succeed.
  delete from public.families where id = fam;

  if exists (select 1 from public.families where id = fam) then
    raise exception 'deleting the family did not remove it';
  end if;
  if exists (select 1 from public.travelers where family_id = fam) then
    raise exception 'deleting the family left its travelers behind';
  end if;
end $$;

notify pgrst, 'reload schema';
