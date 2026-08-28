-- Which pet a packing line is about, kept apart from who is responsible for it.
--
-- The first cut put the animal's name in `assignee`, which made the animal the
-- owner of its own luggage. That is wrong twice over: a dog does not carry
-- anything, and the family lost the ability to say who does. Somebody has to be
-- on the hook for the horse's feed, and that somebody is a person or Shared.
--
-- So the pet becomes an attribute of the line and `assignee` goes back to
-- meaning what it means everywhere else in the app. That also fixes the set-aside
-- and bring-back behavior, which can now key on an id instead of matching a name
-- in free text.

alter table public.packing_items
  add column if not exists pet_id uuid
    references public.pets (id) on delete set null;

alter table public.packing_template_items
  add column if not exists pet_id uuid
    references public.pets (id) on delete cascade;

create index if not exists packing_items_pet_id_idx
  on public.packing_items (pet_id)
  where pet_id is not null;

create index if not exists packing_template_items_pet_id_idx
  on public.packing_template_items (pet_id)
  where pet_id is not null;

comment on column public.packing_items.pet_id is
  'The pet this line is about. Who packs it is still assignee — a person or Shared.';
comment on column public.packing_template_items.pet_id is
  'The pet this template line is about. Who packs it is still assignee — a person or Shared.';

-- Backfill: the rows written while the pet's name was the assignee. Match by
-- name against the family's own pets, move the pet onto pet_id, and hand the
-- responsibility to Shared, which is the honest answer until somebody claims it.
update public.packing_items as pi
   set pet_id = p.id,
       assignee = 'Shared'
  from public.pets as p,
       public.trips as t
 where pi.trip_id = t.id
   and t.family_id = p.family_id
   and pi.pet_id is null
   and lower(btrim(pi.assignee)) = lower(btrim(p.name));

update public.packing_template_items as pti
   set pet_id = pt.pet_id,
       assignee = 'Shared'
  from public.packing_templates as pt
 where pti.template_id = pt.id
   and pt.pet_id is not null
   and pti.pet_id is null;
