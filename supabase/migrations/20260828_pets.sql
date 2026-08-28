-- Pets, and what happens to them when the family travels.
--
-- Pets are their own table rather than rows in `travelers` because almost
-- nothing useful about a travelling pet is a person field. What a hotel, an
-- airline and a trail want to know is the species, the weight, whether it fits
-- under a seat, and whether its rabies shot is still current on the return date.
-- None of that belongs on a passport-holder, and `travelers.is_person` already
-- means something else here: it is what keeps the "Shared" bucket off the
-- People page.
--
-- The two dates are on the pet rather than in `traveler_documents` because they
-- are the two that drive a warning. A rabies certificate that lapses mid-trip
-- and a health certificate that has to be issued inside a narrow window before
-- departure are the things that actually stop a pet at a counter.

create table if not exists public.pets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text not null,
  -- Free text on purpose. A validated list lives in lib/pets/pets.js, where it
  -- can grow without a migration; the column should not be the thing that stops
  -- somebody adding a ferret.
  species text not null default 'dog',
  breed text,
  color text,
  sort_order integer not null default 0,
  date_of_birth date,
  -- Pounds, because that is what US airline and hotel limits are written in.
  -- The under-the-seat cutoff most carriers use lands around 20 lb combined
  -- with the carrier, so a tenth of a pound is enough precision.
  weight_lb numeric(5, 1),
  -- How this animal actually travels: in the cabin, as cargo, only by car, or
  -- not at all. Drives whether flying is even on the table.
  travel_style text,
  carrier_size text,
  -- A trained service animal is not a pet in law and not a pet to an airline or
  -- a hotel: no fee, no weight limit, no breed rule, and it may go where pets
  -- may not. Kept as its own flag so Aly never quotes a pet policy at one.
  is_service_animal boolean not null default false,
  microchip_number text,
  rabies_expiration date,
  health_certificate_expiration date,
  vet_name text,
  vet_phone text,
  medications text,
  dietary_notes text,
  temperament_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pets_family_idx on public.pets (family_id, sort_order);

-- Which pets a trip involves, and what is happening to each one. A pet that is
-- staying behind is still part of planning: somebody has to book the boarding
-- and it belongs on the pre-departure list, so "not coming" is an arrangement
-- rather than an absent row.
create table if not exists public.trip_pets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  arrangement text not null default 'coming',
  arrangement_notes text,
  created_at timestamptz not null default now(),
  unique (trip_id, pet_id)
);

create index if not exists trip_pets_trip_idx on public.trip_pets (trip_id);

alter table public.pets enable row level security;
alter table public.trip_pets enable row level security;

-- Same shape as travelers and trip_travelers, and granted to `authenticated`
-- rather than `public` so it matches the newer policies rather than the eight
-- older ones that still need normalizing.
drop policy if exists pets_all on public.pets;
create policy pets_all on public.pets for all to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

drop policy if exists trip_pets_family on public.trip_pets;
create policy trip_pets_family on public.trip_pets for all to authenticated
  using (
    exists (
      select 1
      from public.trips tr
      join public.family_members fm on fm.family_id = tr.family_id
      where tr.id = trip_pets.trip_id
        and fm.user_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1
      from public.trips tr
      join public.family_members fm on fm.family_id = tr.family_id
      where tr.id = trip_pets.trip_id
        and fm.user_id = auth.uid ()
    )
  );

drop trigger if exists pets_touch_updated_at on public.pets;
create trigger pets_touch_updated_at before update on public.pets
  for each row execute function public.touch_updated_at ();
