-- One-time reconciliation: where a trip line and its standing list disagree
-- about whose item it is, the list is right.
--
-- The generator was allowed to re-decide ownership. It wrote the line, and
-- assignee fell back to "Shared" whenever the model did not name somebody, so
-- base-list items belonging to a person landed on the trip as Shared. Because
-- the key that recognizes a template line includes its owner, the reassigned
-- line also stopped counting as a template line, which meant a later push added
-- the correctly-owned copy beside it and the list carried the same object twice.
--
-- Corrected only where the item name maps to exactly one owner across all family
-- templates. A name held by several people is a per-person item and the split is
-- right; the same name owned differently on two lists is a disagreement between
-- two standing lists, which no migration should settle. Pet lines are left out:
-- lib/pets/packing.js owns those and syncs them from whether the animal is
-- coming.
--
-- Idempotent. lib/packing/generate.js now settles ownership from the template
-- before writing, and lib/packing/propagate.js no longer treats an animal's line
-- as a family line, so neither fault can recur.

with unambiguous as (
  select lower(btrim(i.item)) as name,
         min(coalesce(nullif(btrim(i.assignee), ''), 'Shared')) as who
  from public.packing_template_items i
  join public.packing_templates t on t.id = i.template_id
  where t.pet_id is null and btrim(coalesce(i.item, '')) <> ''
  group by lower(btrim(i.item))
  having count(distinct lower(coalesce(nullif(btrim(i.assignee), ''), 'Shared'))) = 1
)
update public.packing_items p
set assignee = u.who
from unambiguous u
where lower(btrim(p.item)) = u.name
  and p.stashed_at is null
  and p.pet_id is null
  -- Only lines that came off a standing list. A line somebody typed themselves
  -- and deliberately gave to somebody else is theirs to own.
  and p.from_template = true
  and lower(coalesce(nullif(btrim(p.assignee), ''), 'Shared')) <> lower(u.who)
  -- And only where that person is actually on the trip.
  and (
    lower(u.who) = 'shared'
    or exists (
      select 1
      from public.trip_travelers tt
      join public.travelers tv on tv.id = tt.traveler_id
      where tt.trip_id = p.trip_id and lower(btrim(tv.name)) = lower(btrim(u.who))
    )
  );
