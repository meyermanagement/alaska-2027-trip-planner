-- How much the household wants a place, on a list where every row is a want.
--
-- A bucket list with eleven places on it is eleven equal wants, which is the
-- same as no ranking at all: the family cannot see which one to book next and
-- Aly cannot tell a fare worth waking somebody for from a fare to the eleventh
-- place down. This is a number from 1 to 5 with 1 first, because the household
-- asked for a number rather than named tiers.
--
-- Nullable on purpose. Nothing forces a rank, and a place nobody has ranked is
-- not a five -- it is unranked, and it sorts after the ranked ones instead of
-- being quietly filed at the bottom of the scale.
alter table someday_places
  add column if not exists priority smallint;

alter table someday_places
  drop constraint if exists someday_places_priority_check;

alter table someday_places
  add constraint someday_places_priority_check
    check (priority is null or (priority >= 1 and priority <= 5));

comment on column someday_places.priority is
  '1 to 5, 1 first. Null means nobody has ranked this place yet.';
