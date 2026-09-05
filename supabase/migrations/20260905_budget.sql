-- What a trip is expected to cost, and what it actually cost.
--
-- Money hangs off the things it was spent on rather than living in a spreadsheet
-- of its own, so a flight, a hotel and a dinner each carry their own two numbers:
-- what we think it will cost, and what it came to in the end. The estimate is
-- allowed to be a guess -- that is the point of it during planning -- and the
-- final figure is only filled in once something is paid for.
--
-- trip_costs is for the money a trip spends that is not an event on any day:
-- groceries, gas, souvenirs, boarding the horse, the checked bags. Those belong
-- in the budget but would be noise on the itinerary.
--
-- The preferred budget on the trip is a target and never a limit. Nothing in the
-- app refuses a write for going over it; it exists so that the totals can be
-- compared with it and so Aly can say where the concessions are.

alter table trips add column if not exists budget_target numeric(12, 2);

comment on column trips.budget_target is
  'What the family would like the whole trip to cost, in dollars. A preference, not a cap -- nothing enforces it.';

alter table itinerary_items
  add column if not exists cost_estimate numeric(12, 2),
  add column if not exists cost_actual numeric(12, 2),
  add column if not exists cost_note text;

comment on column itinerary_items.cost_estimate is
  'What this is expected to cost for the whole party, in dollars. A planning guess, filled in early and often by Aly.';
comment on column itinerary_items.cost_actual is
  'What it actually came to, once paid. Blank until then.';
comment on column itinerary_items.cost_note is
  'Where the figure came from, or what it covers: "per night, 6 nights", "two adults, one child".';

create table if not exists trip_costs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  label text not null,
  category text not null default 'other',
  cost_estimate numeric(12, 2),
  cost_actual numeric(12, 2),
  cost_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz,
  updated_by uuid references auth.users (id)
);

comment on table trip_costs is
  'Money a trip spends that is not an event on any day: food, gas, souvenirs, pet boarding, bags.';

create index if not exists trip_costs_trip_idx on trip_costs (trip_id);

alter table trip_costs enable row level security;

-- The same access rule as the rest of a trip, with one difference: a secondary
-- traveler -- a minor, or a friend along for the ride -- does not see the money.
-- They can read the itinerary and check off their own packing, and they have no
-- business in the budget.
drop policy if exists trip_costs_all on trip_costs;
create policy trip_costs_all on trip_costs
  for all
  to authenticated
  using (
    can_access_trip (trip_id)
    and not is_secondary_traveler (trip_family (trip_id))
  )
  with check (
    can_access_trip (trip_id)
    and not is_secondary_traveler (trip_family (trip_id))
  );
