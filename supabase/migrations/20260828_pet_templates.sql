-- A pet's packing template.
--
-- Every animal gets its own add-on template rather than sharing one "Pets"
-- list, because a cat's things and a Labrador's things overlap by about two
-- lines. Binding it to the pet means it is editable on the Templates screen
-- like any other add-on, and Aly's existing template tools already work on it.
--
-- The template is a normal add-on (is_base false); pet_id is what makes it
-- somebody's. One template per pet, and it goes when the pet goes.

alter table public.packing_templates
  add column if not exists pet_id uuid
    references public.pets (id) on delete cascade;

create unique index if not exists packing_templates_pet_id_key
  on public.packing_templates (pet_id)
  where pet_id is not null;

comment on column public.packing_templates.pet_id is
  'When set, this add-on template belongs to that pet and is applied to a trip''s packing list whenever the pet is coming.';
