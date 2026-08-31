-- A horse's paperwork is not a dog's.
--
-- The pets table had rabies_expiration and health_certificate_expiration, which
-- between them cover a dog, a cat and a ferret. They do not cover a horse: the
-- document that turns a rig around at a state line or a show gate is a negative
-- Coggins test for equine infectious anemia, usually good for twelve months from
-- the draw. The app had nowhere to put one, so it asked for a rabies certificate
-- instead and warned about the wrong thing.
--
-- Nullable, and only asked for on species that have one -- see lib/pets/species.js.

alter table pets add column if not exists coggins_expiration date;

comment on column pets.coggins_expiration is
  'Negative Coggins (EIA) test valid through. Equines only; the document checked at a state line or a show gate.';
