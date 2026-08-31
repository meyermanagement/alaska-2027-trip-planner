-- One-time backfill: record what each existing trip is built from.
--
-- Until now no trip said which add-on lists it used; the app worked it out from
-- the lines each list already carried, which cannot work for a trip that has no
-- lines yet and is why a new trip could only ever be built from the base list.
-- The guess is unambiguous on the trips that already exist -- Horse Show is 15
-- of 15 present on Des Moines, Disney Parks 22 of 22 on Disney, Caribbean 23 of
-- 23 on Curacao, Alaska Cruise & Wildlife 23 of 23 on Alaska, and no other
-- pairing reaches even half -- so it is worth writing down once, after which the
-- trips say it themselves and nothing is inferred again.
--
-- Only trips that have not finished are stamped. A complete trip's packing list
-- is a record of what was taken and nobody is going to rebuild it, so claiming a
-- decision was made about it would be inventing one.
--
-- The four-item Cruise Add-ons list is deliberately not assigned here. It scores
-- 25% against every trip including the actual Alaska cruise, because its lines
-- are assigned to Mark on the template and to Shared where they were typed by
-- hand, and identity includes whose an item is. There is no guess to preserve,
-- so whether a trip is a cruise is left to be said out loud.
insert into public.trip_templates (trip_id, template_id)
select t.id, tpl.id
from public.trips t
join public.packing_templates tpl
  on tpl.family_id = t.family_id
 and tpl.is_base = false
 and tpl.pet_id is null
where coalesce(t.status, '') not in ('complete', 'cancelled', 'canceled')
  and (
    (t.name = 'Des Moines Horse Show 2026' and tpl.name = 'Horse Show')
    or (t.name = 'Disney Thanksgiving 2026' and tpl.name = 'Disney Parks')
    or (t.name = 'Curaçao 2027' and tpl.name = 'Caribbean Beach & Sun Add-ons')
    or (t.name = 'Alaska 2027' and tpl.name = 'Alaska Cruise & Wildlife Add-ons')
  )
on conflict (trip_id, template_id) do nothing;

-- Stamped whether or not a row was written, because "no add-ons" is an answer
-- too: Portugal Spring 2027 matches nothing, and the stamp is what stops the
-- guess quietly filling that in later.
update public.trips
set templates_chosen_at = now()
where coalesce(status, '') not in ('complete', 'cancelled', 'canceled')
  and templates_chosen_at is null;
