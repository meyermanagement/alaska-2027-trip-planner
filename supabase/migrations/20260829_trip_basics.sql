-- The six things a trip is made of, and the right to be vague about when.
--
-- A trip was already carrying two of the six: destination is where, and the date
-- range is when. The other four -- how you get there, where you sleep, what you
-- do, how you get around -- had nowhere to live at the baseline level, so a trip
-- being worked out held either nothing about them or a full itinerary row that
-- claimed more certainty than anybody had.
--
-- They are text, and that is the point. "Probably fly into Kona" is a real answer
-- and a flight number is not required to have one. Detail arrives later on the
-- screens built for it; these columns hold the shape of the trip.

alter table trips add column if not exists getting_there text;
alter table trips add column if not exists staying text;
alter table trips add column if not exists doing text;
alter table trips add column if not exists getting_around text;

comment on column trips.getting_there is
  'Baseline answer to "how do you get there?" in the family''s own words -- "fly into Kona", "drive, nine hours". Not a booking; reservations live in their own table.';
comment on column trips.staying is
  'Baseline answer to "where do you stay?" -- "a condo with a kitchen". Not a booking.';
comment on column trips.doing is
  'Baseline answer to "what do you want to do there?" -- one or two things they would be sorry to miss. The itinerary is built from this, not replaced by it.';
comment on column trips.getting_around is
  'Baseline answer to "how do you get around once there?" -- "rent a car", "trains and walking". Read alongside the family''s saved transportation preferences.';

-- When, for a trip that does not have a when yet.
--
-- start_date and end_date were already nullable, so a draft could omit them --
-- but then the trip knew nothing at all about when, and "spring break next year"
-- is not nothing. It fixes the season, the school holiday, the weather and most
-- of the prices. date_note holds what the family actually said.
alter table trips add column if not exists date_note text;

comment on column trips.date_note is
  'When, in the family''s own words, for a trip with no settled dates: "spring break next year", "ten days sometime next summer". Read in preference to start_date/end_date on a draft, because the dates under it may be a guess written down to make a calendar work.';

-- And the flag that says a date range is a guess.
--
-- Distinct from date_note on purpose. A draft can have both: "spring break next
-- year" as the words, and 2027-03-13..2027-03-20 underneath so the trip can be
-- ordered on a list and counted down from. Without this flag the app cannot tell
-- that range from a booked one, which is how a guess ends up on a countdown as
-- though somebody had bought a ticket.
alter table trips
  add column if not exists dates_approximate boolean not null default false;

comment on column trips.dates_approximate is
  'True when start_date/end_date are an estimate rather than settled. The app must not count down to, or claim, an approximate date without saying so.';

-- A booked trip cannot have approximate dates: that is the one combination that
-- would put a guess in front of somebody as a fact on the screen where they are
-- least likely to question it.
alter table trips drop constraint if exists trips_approximate_not_booked;
alter table trips
  add constraint trips_approximate_not_booked
  check (not (dates_approximate and status = 'booked'));

-- Finding the drafts that still need work, without reading every trip.
create index if not exists trips_draft_idx
  on trips (family_id, status)
  where status = 'draft';
