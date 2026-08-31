-- Which lines on a trip came off a packing template.
--
-- Needed because "take it off the template and off my upcoming trips" is only
-- safe if the app can tell a template line from a line somebody typed or the
-- model invented. Without it, propagating a removal would offer to delete the
-- eighty-odd generated lines on the Alaska list that were never on a template.

alter table public.packing_items
  add column if not exists from_template boolean not null default false;

comment on column public.packing_items.from_template is
  'True when this line was copied from a packing template. Only these lines are ever offered for removal when a template line is deleted; anything typed by hand or invented by the model is never touched.';

-- Labeled backfill. Every existing trip line whose name and owner still match a
-- current template line is marked as having come from one. This is a guess about
-- history, but it is the same guess the propagation planner would make anyway,
-- and it errs the safe way: a line matching nothing today stays false and can
-- never be removed automatically.
update public.packing_items p
set from_template = true
where p.from_template = false
  and exists (
    select 1
    from public.packing_template_items ti
    join public.packing_templates t on t.id = ti.template_id
    join public.trips tr on tr.id = p.trip_id
    where t.family_id = tr.family_id
      and lower(btrim(ti.item)) = lower(btrim(p.item))
      and lower(btrim(coalesce(ti.assignee, 'Shared')))
        = lower(btrim(coalesce(p.assignee, 'Shared')))
  );
