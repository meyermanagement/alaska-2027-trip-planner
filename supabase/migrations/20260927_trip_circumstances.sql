-- The circumstances a trip was last planned against.
--
-- A trip is planned for a particular household: these people, these ages, this
-- one in a wheelchair, this dog coming and that one staying, home at this
-- address. None of that is a field on the trip, and all of it is editable
-- somewhere else -- so the trip goes on being a plan for a household that has
-- since changed, and nothing on the screen says so.
--
-- This column is the fingerprint of that household at the moment the trip was
-- last looked at. Every page draw takes the fingerprint again from the live rows
-- and compares. A difference is two sorted lists that no longer match; it is
-- never a model call, and it stops being true the moment the trip is looked at
-- again, because looking again rewrites this column.
--
-- Deliberately not backfilled. A trip with a null fingerprint has never recorded
-- an assumption, so there is nothing for the household to have broken, and the
-- band stays silent until the next look stamps it. Backfilling today's household
-- would have been the same silence bought with a write, and a guess at rows this
-- migration cannot see.
alter table public.trips
  add column if not exists circumstances jsonb,
  add column if not exists circumstances_at timestamp with time zone;

comment on column public.trips.circumstances is
  'Fingerprint of the household this trip was last planned against: the roster with ages, mobility aids, accessibility notes and limits, the animals coming and how they travel, and the home address. Written by a pro-tips look and by the trip screen''s own changes review. Compared against live rows on every draw to say what has drifted. Shape and version live in lib/trips/circumstances.js.';

comment on column public.trips.circumstances_at is
  'When the fingerprint above was taken. Shown as the date the trip was last planned against its household.';
