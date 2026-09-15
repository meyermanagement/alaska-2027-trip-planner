-- The two things a family knows about travel before any trip exists.
--
-- Where they leave from, and where they would go if the price were right.
--
-- The app has held a home address for a while, which is enough to say what time
-- to leave the house. It is not enough to judge an airfare. A fare is attached to
-- an airport, and a household in Missouri has three plausible ones -- the field
-- twenty minutes away, the hub two hours away, and the one five hours away that
-- is only ever worth it for a transatlantic saving. Which of those count, and how
-- long the family is willing to sit in the car for each, is a fact about them
-- that nothing in the app could previously record. Straight-line distance cannot
-- answer it: the drive from this house to Chicago is a decision, not a number.
--
-- The someday list is the other half. Every travel product asks for a wish list
-- at signup and then never uses it again. This one is built to be used: a place
-- in the family's own words, the months it would work in, roughly how long they
-- would go for, and the most they would pay per person to fly there. That last
-- number is what turns a fare into a verdict instead of a headline -- without it
-- the app can only say "this is cheap", which is a claim about the market rather
-- than about this family.
--
-- Neither table holds a fare, a route or an offer. They are the standing facts
-- that a fare gets measured against, and both are typed by the family rather than
-- inferred, so nothing here can be quietly wrong on their behalf.

-- ----------------------------------------------------------- 1. home airports

create table if not exists home_airports (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- The three-letter code, which is how fares and the family both name an
  -- airport. Held uppercase by a check rather than by convention, because a row
  -- reading 'stl' would silently fail every comparison made against it.
  code text not null,
  -- Copied off the reference list at the moment it was chosen rather than joined
  -- at read time: the app ships the airport list as data, and a row that carries
  -- its own words still reads correctly if that list is ever trimmed.
  name text not null,
  city text,
  region text,
  lat double precision,
  lon double precision,
  -- How long the drive takes, as the family says it. Never computed: the app has
  -- a coordinate per airport and nothing about roads, and a made-up drive time is
  -- worse than a blank one because it looks like it was measured.
  drive_minutes integer,
  -- The one they mean when they say "the airport". Used as the default origin for
  -- anything priced or compared.
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint home_airports_code_check check (code ~ '^[A-Z]{3}$'),
  constraint home_airports_drive_check
    check (drive_minutes is null or (drive_minutes >= 0 and drive_minutes <= 1440))
);

comment on table home_airports is
  'The airports this household would actually leave from, with the drive each one costs. What an airfare gets judged against.';

-- One row per family per airport, so choosing the same one twice is a no-op
-- rather than a duplicate.
create unique index if not exists home_airports_family_code
  on home_airports (family_id, code);

-- Exactly one home base, said by the database rather than hoped for by the form.
create unique index if not exists home_airports_one_primary
  on home_airports (family_id)
  where is_primary;

alter table home_airports enable row level security;

drop policy if exists home_airports_all on home_airports;
create policy home_airports_all on home_airports
  for all
  to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

-- Same pair as household_facts: a secondary traveler reads their trip, not the
-- household's standing record.
drop policy if exists home_airports_secondary_all on home_airports;
create policy home_airports_secondary_all on home_airports
  for all
  to authenticated
  using (not is_secondary_traveler (family_id))
  with check (not is_secondary_traveler (family_id));

drop trigger if exists home_airports_touch on home_airports;
create trigger home_airports_touch
  before update on home_airports
  for each row
  execute function touch_updated_at ();

-- ---------------------------------------------------------- 2. someday places

create table if not exists someday_places (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- Their words for it, kept verbatim. 'Japan in cherry blossom season' is a
  -- better record than 'Japan' plus a month range, and the months below are for
  -- arithmetic rather than for reading back to them.
  place text not null,
  -- The country or state, for matching a fare or an article against the list.
  -- Written down separately because 'Banff' and 'Canada' are not the same string
  -- and a deal is announced in whichever of them the writer felt like using.
  region text,
  lat double precision,
  lon double precision,
  -- Why, in their own words. Never rewritten for tone, same rule as a preference.
  why text,
  -- The months it would work, as 1 through 12. Empty means any month, which is
  -- different from unknown only in that nobody has said otherwise -- so a fare in
  -- February is not refused on behalf of a family who never mentioned February.
  months smallint[] not null default '{}',
  -- Roughly how long they would go for, in nights.
  nights integer,
  -- The most they would pay per person for the flight before this stops being a
  -- deal. The number that lets the app give a verdict instead of a headline.
  fare_ceiling numeric,
  -- Who it is for. Empty means the household.
  traveler_ids uuid[] not null default '{}',
  -- Whether a fare to here should reach them, as opposed to sitting on the list
  -- as something they would like to do one day.
  watch boolean not null default true,
  status text not null default 'open'
    check (status in ('open', 'booked', 'retired')),
  -- The trip it became, once it becomes one. Nulled rather than cascaded: the
  -- wish outlives a draft that gets deleted.
  trip_id uuid references trips (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint someday_places_place_check check (length(btrim(place)) > 0),
  constraint someday_places_nights_check
    check (nights is null or (nights >= 1 and nights <= 365)),
  constraint someday_places_ceiling_check
    check (fare_ceiling is null or fare_ceiling >= 0),
  constraint someday_places_months_check
    check (months <@ array[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]::smallint[])
);

comment on table someday_places is
  'Places the household wants to go, with the months, length and per-person fare that would make each one worth doing. The wish list a deal is judged against.';

create index if not exists someday_places_family_status
  on someday_places (family_id, status);

alter table someday_places enable row level security;

drop policy if exists someday_places_all on someday_places;
create policy someday_places_all on someday_places
  for all
  to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

drop policy if exists someday_places_secondary_all on someday_places;
create policy someday_places_secondary_all on someday_places
  for all
  to authenticated
  using (not is_secondary_traveler (family_id))
  with check (not is_secondary_traveler (family_id));

drop trigger if exists someday_places_touch on someday_places;
create trigger someday_places_touch
  before update on someday_places
  for each row
  execute function touch_updated_at ();
