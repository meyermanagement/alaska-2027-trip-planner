-- Three named tiers instead of five numbers.
--
-- A number from 1 to 5 asked the family to hold a scale in their heads and then
-- argue about whether a place was a 2 or a 3, which is an argument with no
-- answer and no consequence: nothing downstream reads the difference. High,
-- medium and low say the same thing out loud, and the word is legible on a card
-- where the bare number was not.
--
-- The column stays a smallint so nothing that reads it has to change shape: 1 is
-- high, 2 is medium, 3 is low, and null is still unranked. Existing rows are
-- folded in the only direction that keeps their order -- a 1 stays high, a 2 or
-- a 3 becomes medium, a 4 or a 5 becomes low -- so no place moves above another
-- place it was already behind.
-- One statement, so no row is folded twice: a second pass collapsing threes
-- would catch the fours and fives this one had just made into threes.
update someday_places
  set priority = case
    when priority <= 1 then 1
    when priority <= 3 then 2
    else 3
  end
  where priority is not null and priority > 2;

alter table someday_places
  drop constraint if exists someday_places_priority_check;

alter table someday_places
  add constraint someday_places_priority_check
    check (priority is null or (priority >= 1 and priority <= 3));

comment on column someday_places.priority is
  '1 high, 2 medium, 3 low. Null means nobody has ranked this place yet.';
