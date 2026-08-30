-- Gender on a person, sex on an animal.
--
-- Two different facts that happen to share a word. On a person it is how they
-- describe themselves, so the column is free text with no check constraint: a
-- closed list would be a decision this app has no business making, and the app's
-- own list is offered in the form rather than enforced here. On an animal it is a
-- closed list, because every kennel form, health certificate and airline manifest
-- asks for exactly one of three things and a free-text answer there is a form
-- that has to be filled in again by hand.
--
-- Both are nullable and both stay nullable. Not knowing is the normal state of a
-- record somebody has not got round to, and a default would put an answer in the
-- prompt that nobody gave.

alter table travelers add column if not exists gender text;

comment on column travelers.gender is
  'How this person describes themselves. Free text; the app offers female, male, nonbinary and undisclosed, and stores anything else as typed. Null means not recorded, which is not the same as undisclosed.';

alter table pets add column if not exists sex text;
alter table pets add column if not exists is_sterilized boolean;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pets_sex_check'
  ) then
    alter table pets add constraint pets_sex_check
      check (sex is null or sex in ('female', 'male', 'unknown'));
  end if;
end $$;

comment on column pets.sex is
  'female, male or unknown. Asked for on kennel forms, health certificates and airline manifests. Null means nobody has recorded it; unknown means somebody looked and does not know.';

comment on column pets.is_sterilized is
  'Spayed or neutered. Every boarding kennel asks, and many require it. Null means not recorded.';
