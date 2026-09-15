-- A fare somebody found, kept long enough to be argued with.
--
-- This is the table the last two were built for. The home airports say where a
-- fare has to leave from, the someday list says what a place is worth to this
-- household, and a row here is one concrete offer to measure against both.
--
-- Three decisions are worth stating, because they are the difference between a
-- useful record and a deals blog.
--
-- The app never invents a row. Every fare here was pasted or forwarded by the
-- family, from a newsletter, a screenshot, an alert or a friend, and the source it
-- came from is stored with it and shown on the card. A price the app cannot say
-- where it got is worthless: nobody should book against a number an assistant
-- produced from memory, and this schema makes provenance a not-null column rather
-- than a convention.
--
-- The verdict is not stored. Whether a fare beats the ceiling, lands in a month
-- that works, leaves from an airport they use, has enough seats for the four of
-- them and clashes with the horse show is computed in code every time it is read,
-- from the rows that are true right now. Freezing a verdict here would mean the
-- card kept saying "$451 under budget" after the budget was raised, which is the
-- one thing this feature cannot afford to get wrong.
--
-- A dismissed deal is kept, not deleted. "Not for us" is an answer, and an app
-- that shows the same fare to Cancun for the fourth time has not been listening.

create table if not exists flight_deals (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- Where it leaves from, as a code, so it can be compared against the family's
  -- own airports without a lookup. Not constrained to their list: the point of
  -- storing an origin they do not use is being able to say so on the card.
  origin text not null,
  -- Where it goes, in the words of whoever announced it. 'Lisbon', 'Portugal',
  -- 'LIS' and 'Lisbon, Portugal' are all fares to the same place and the matching
  -- has to cope with all four, so the text is kept as written and a code is stored
  -- beside it when there was one.
  destination text not null,
  destination_code text,
  -- Per person, round trip, in dollars. The single number the whole feature turns
  -- on, so it is not null: a deal without a price is a rumour.
  price numeric not null,
  currency text not null default 'USD',
  cabin text not null default 'economy'
    check (cabin in ('economy', 'premium', 'business', 'first')),
  airline text,
  -- When the fare has to be bought by, which is usually the urgent part, and is
  -- separate from when the travel is. A mistake fare is measured in hours.
  book_by date,
  -- The travel window the fare is good for. Held as two dates rather than as prose
  -- so it can be checked against the months on the someday list and against the
  -- dates of trips that already exist.
  travel_start date,
  travel_end date,
  -- How many people can still get it at that price. Compared against how many are
  -- going: a fare with three seats is not a fare for a family of four, and finding
  -- that out at the checkout is the failure this column exists to prevent.
  seats integer,
  -- Where it came from. The name is what the card credits, and the link is what a
  -- person clicks to check it before spending anything. Never generated.
  source_name text not null,
  source_url text,
  -- Their own words about it, and anything the parse could not fit into a column.
  notes text,
  status text not null default 'open'
    check (status in ('open', 'dismissed', 'taken')),
  -- Why they said no, when they said no. Keeping the reason is what lets a later
  -- fare to the same place say "you passed on this in March because of the show"
  -- instead of asking the same question again.
  dismissed_reason text,
  -- The trip it was put on, once it becomes one.
  trip_id uuid references trips (id) on delete set null,
  -- The wish it answers, when it answers one. Nulled rather than cascaded so the
  -- fare survives the family tidying their list.
  someday_id uuid references someday_places (id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint flight_deals_origin_check check (origin ~ '^[A-Z]{3}$'),
  constraint flight_deals_dest_code_check
    check (destination_code is null or destination_code ~ '^[A-Z]{3}$'),
  constraint flight_deals_destination_check
    check (length(btrim(destination)) > 0),
  constraint flight_deals_source_check
    check (length(btrim(source_name)) > 0),
  constraint flight_deals_price_check check (price >= 0),
  constraint flight_deals_seats_check
    check (seats is null or (seats >= 1 and seats <= 99)),
  -- A window that ends before it starts is a parse that went wrong, and it would
  -- silently defeat every date comparison made against it.
  constraint flight_deals_window_check
    check (
      travel_start is null
      or travel_end is null
      or travel_end >= travel_start
    )
);

comment on table flight_deals is
  'Fares the family pasted in, with where each one came from. Judged against the home airports, the someday list and the trips they already have - never against a price the app made up.';

create index if not exists flight_deals_family_status
  on flight_deals (family_id, status, created_at desc);

alter table flight_deals enable row level security;

drop policy if exists flight_deals_all on flight_deals;
create policy flight_deals_all on flight_deals
  for all
  to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

-- Same pair as the two tables this one reads: a secondary traveler sees their own
-- trip, not the household's standing record of what it is shopping for.
drop policy if exists flight_deals_secondary_all on flight_deals;
create policy flight_deals_secondary_all on flight_deals
  for all
  to authenticated
  using (not is_secondary_traveler (family_id))
  with check (not is_secondary_traveler (family_id));

drop trigger if exists flight_deals_touch on flight_deals;
create trigger flight_deals_touch
  before update on flight_deals
  for each row
  execute function touch_updated_at ();
