-- What we know about a person, and how we came to know it.
--
-- Aly can already save a travel preference, but the row she writes is
-- indistinguishable from one Mark typed himself: `body` and nothing else. That is
-- fine while every row is typed by hand and fatal the moment she starts writing
-- them, because a list that mixes "Steph told us: no loud rooms" with "we think
-- Veda would rather move than look" is a list nobody can trust, and a model given
-- both as identical free text will treat its own guess as a constraint.
--
-- Three things arrive here.
--
--   1. Provenance on a preference: where it came from, which question produced
--      it, and the person's own reason in their own words.
--   2. household_facts, for the things that are not taste at all -- an allergy, a
--      mile limit, which languages get read -- kept apart from preferences
--      precisely so a hard rule can never be softened into an opinion.
--   3. traveler_slots, the ledger. The list of things worth knowing about a
--      person, with a status per person, so an interview can be resumed, can stop
--      circling ground it has covered, and can end.
--
-- The slot ids themselves live in lib/travelers/slots.js rather than in a table.
-- They are a product decision that changes with the prompt that reads them, and a
-- migration to add a question is a migration nobody will write.

-- ---------------------------------------------------------------- 1. provenance

-- said     the person said it outright, in words, and we kept their words
-- derived  worked out from what they chose, and might be wrong
-- noticed  Aly spotted it across trips on its own, and nobody has confirmed it
alter table travel_preferences
  add column if not exists source text not null default 'said';

alter table travel_preferences
  drop constraint if exists travel_preferences_source_check;
alter table travel_preferences
  add constraint travel_preferences_source_check
    check (source in ('said', 'derived', 'noticed'));

-- Which slot this row answers, when it came out of an interview. Null for the
-- rows that were typed straight onto the page, which is most of them today.
alter table travel_preferences
  add column if not exists slot text;

-- The sentence under the row that says why. Not a paraphrase for display: the
-- person's own reason, which is usually worth more than the preference it
-- explains, because it generalizes to questions nobody asked.
alter table travel_preferences
  add column if not exists reason text;

comment on column travel_preferences.source is
  'said = told us outright and kept in their words; derived = worked out from their answers; noticed = Aly spotted it unprompted and nobody has confirmed it.';
comment on column travel_preferences.slot is
  'The ledger slot this row answers, when it came out of an interview. Null for a row typed straight onto the page.';
comment on column travel_preferences.reason is
  'Why, in the person''s own words. Kept verbatim; never rewritten for tone.';

-- ------------------------------------------------------------ 2. household facts

-- Not preferences. A nine-year-old, a mile limit, a shellfish allergy and a
-- reading knowledge of Spanish all change how a day is built before anybody's
-- taste is consulted, and none of them should ever be traded off against a nicer
-- restaurant. Kept in their own table so that Aly is given them as constraints
-- and so that deleting a preference can never take one out with it.
create table if not exists household_facts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- Null when it is true of the household rather than one person: the languages
  -- somebody in the car can read, the fact that there is a child at all.
  traveler_id uuid references travelers (id) on delete cascade,
  -- rule        must be obeyed. An allergy, a medical limit, a court order.
  -- capability  what a body can do today: stairs, distance, altitude, heat.
  -- fact        neither, but still worth never asking twice: languages, ages.
  kind text not null default 'fact',
  slot text,
  body text not null,
  source text not null default 'said',
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint household_facts_kind_check
    check (kind in ('rule', 'capability', 'fact')),
  constraint household_facts_source_check
    check (source in ('said', 'derived', 'noticed')),
  constraint household_facts_body_check check (length(btrim(body)) > 0)
);

comment on table household_facts is
  'The constraint layer under preferences: allergies, mobility, languages, ages. Facts and rules rather than taste, so a hard rule can never be softened into an opinion.';

create index if not exists household_facts_family_idx
  on household_facts (family_id, traveler_id);

alter table household_facts enable row level security;

drop policy if exists household_facts_all on household_facts;
create policy household_facts_all on household_facts
  for all
  to authenticated
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

-- A child with sign-in access reads their own trip; they do not edit the
-- household's medical and mobility record. Same pair of policies as house_tasks.
drop policy if exists household_facts_secondary_all on household_facts;
create policy household_facts_secondary_all on household_facts
  for all
  to authenticated
  using (not is_secondary_traveler(family_id))
  with check (not is_secondary_traveler(family_id));

-- ------------------------------------------------------------------ 3. the ledger

-- One row per person per slot, written only once that slot has been touched. An
-- absent row means open, which is why nothing has to be seeded when a person is
-- added.
create table if not exists traveler_slots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- Null for a slot that belongs to the household rather than a person.
  traveler_id uuid references travelers (id) on delete cascade,
  slot text not null,
  -- open      never asked, or asked and still unanswered
  -- asking    a question is out; here so a resumed interview does not repeat it
  -- settled   answered well enough to act on
  -- skipped   asked and waved off. Deliberately not the same as open: this axis
  --           does not divide this person, which is itself worth knowing and
  --           worth not asking again next month.
  status text not null default 'open',
  asked_count integer not null default 0,
  -- The exact wording last put to them, so a resumed interview can avoid asking
  -- the same thing in the same words and a person can see what they ducked.
  last_question text,
  -- Why it was skipped, when they said. A skip with a reason is the most useful
  -- kind of no.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint traveler_slots_status_check
    check (status in ('open', 'asking', 'settled', 'skipped')),
  constraint traveler_slots_slot_check check (length(btrim(slot)) > 0)
);

comment on table traveler_slots is
  'The interview ledger: what has been asked of whom, what was settled and what was waved off. The app owns this, not the model -- so an interview can resume, can stop circling, and can end.';

-- One row per person per slot. Two partial indexes because a null traveler_id is
-- distinct from itself in a plain unique index, so the household rows would
-- duplicate.
create unique index if not exists traveler_slots_person_idx
  on traveler_slots (traveler_id, slot)
  where traveler_id is not null;

create unique index if not exists traveler_slots_household_idx
  on traveler_slots (family_id, slot)
  where traveler_id is null;

alter table traveler_slots enable row level security;

drop policy if exists traveler_slots_all on traveler_slots;
create policy traveler_slots_all on traveler_slots
  for all
  to authenticated
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

drop policy if exists traveler_slots_secondary_all on traveler_slots;
create policy traveler_slots_secondary_all on traveler_slots
  for all
  to authenticated
  using (not is_secondary_traveler(family_id))
  with check (not is_secondary_traveler(family_id));
