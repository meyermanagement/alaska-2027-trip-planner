-- Which add-on packing templates a trip is built from.
--
-- Until now a trip could only ever be built from the base list. The new-trip
-- generator asked for `is_base = true` and nothing else, so an add-on had no
-- route onto a trip at creation at all. Propagation did handle several add-ons
-- at once, but it worked out which ones applied by looking at what the trip
-- already carried -- and a trip being created carries nothing, so no add-on
-- could ever reach it that way either.
--
-- That inference also has a failure the explicit link removes. It asks whether
-- 70% of an add-on's lines are already present, which was measured against the
-- 22- and 23-line add-ons where seven in ten means something. On the four-line
-- Cruise Add-ons list, three coincidences are a match: as of today it scores
-- 100% against the Disney resort trip and 50% against the actual Alaska cruise,
-- which is exactly backwards.
--
-- So a trip now says what it is. A trip can be a cruise and a Disney trip at
-- once, which is the case that could not be expressed before -- and it is why
-- "Alaska Cruise & Wildlife Add-ons" exists as one bundled list rather than an
-- Alaska list and a cruise list that compose.
--
-- The base list is deliberately NOT recorded here. Every trip starts from it,
-- so a row saying so would be a row that is always present and never means
-- anything. Only the add-ons are a choice.

create table if not exists public.trip_templates (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  template_id uuid not null references public.packing_templates (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (trip_id, template_id)
);

create index if not exists trip_templates_trip_idx
  on public.trip_templates (trip_id);

create index if not exists trip_templates_template_idx
  on public.trip_templates (template_id);

comment on table public.trip_templates is
  'The add-on packing templates a trip is built from. The base template is not listed: every trip starts from it. A trip with no rows here falls back to inferring its add-ons from the lines it already carries.';

-- Same shape as trip_pets, and granted to `authenticated` rather than `public`
-- so it matches the newer policies rather than the eight older ones that still
-- need normalizing before signup opens.
alter table public.trip_templates enable row level security;

drop policy if exists trip_templates_family on public.trip_templates;
create policy trip_templates_family on public.trip_templates for all to authenticated
  using (
    exists (
      select 1
      from public.trips tr
      join public.family_members fm on fm.family_id = tr.family_id
      where tr.id = trip_templates.trip_id
        and fm.user_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1
      from public.trips tr
      join public.family_members fm on fm.family_id = tr.family_id
      where tr.id = trip_templates.trip_id
        and fm.user_id = auth.uid ()
    )
  );

-- Whether anybody has decided this trip's add-ons at all.
--
-- Without this a trip that deliberately uses no add-ons is indistinguishable
-- from a trip nobody has been asked about, since both have no rows above -- so
-- clearing every add-on off a trip would silently hand it back to the guess and
-- the add-ons would return. The stamp is what makes "none" an answer.
alter table public.trips
  add column if not exists templates_chosen_at timestamptz;

comment on column public.trips.templates_chosen_at is
  'When this trip''s add-on packing templates were last decided. Null means nobody has been asked, and the app infers the add-ons from the lines the trip already carries.';
