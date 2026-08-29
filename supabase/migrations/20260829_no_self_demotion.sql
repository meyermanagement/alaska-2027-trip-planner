-- Nobody demotes themselves.
--
-- What happened: a primary traveler tapped the "Secondary traveler" pill on his
-- own row. It was allowed -- there was another primary in the family, so the
-- keep-a-primary rule was satisfied -- and the tap immediately closed the Family
-- tab to him, which is the only screen the pill lives on. One tap, no
-- confirmation, and the way back was gone. The only remedy was the other primary,
-- or somebody with database access.
--
-- travelers_keep_a_primary already stops the household from having nobody in
-- charge. It cannot stop this, because from its point of view the family is fine:
-- the count is what it protects, not the person doing the counting.
--
-- So this is the second half of the same idea. Changing your own level is refused
-- outright, in either direction, and the switch is something another primary does
-- to you. That makes a hand-over a deliberate two-person act -- promote the other
-- person, and let them demote you -- and it makes a self-lockout unreachable
-- rather than merely discouraged. Refused in the database rather than only in the
-- screen, because the screen is where the bug was.

create or replace function public.travelers_no_self_demotion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.access_level is not distinct from old.access_level then
    return new;
  end if;

  -- A service-role backfill or a migration has no auth.uid(), and neither has
  -- anything running outside a request. Those are not somebody changing their own
  -- level, so they pass.
  if auth.uid() is null then
    return new;
  end if;

  if old.user_id is distinct from auth.uid() then
    return new;
  end if;

  raise exception
    'You cannot change your own access. Another primary traveler has to do it, so that nobody can lock themselves out of their own trips.'
    using errcode = '42501';
end $$;

drop trigger if exists travelers_no_self_demotion on travelers;
create trigger travelers_no_self_demotion
  before update on travelers
  for each row execute function public.travelers_no_self_demotion();
