-- What leaves the room with you, on the day it leaves.
--
-- The suitcase list answers "is it on the trip". It has never answered the
-- question the family actually asks at eight in the morning: what goes in the
-- backpack today. Those are different lists. Binoculars live in the case for
-- eleven days and matter on the one morning the boat goes looking for whales,
-- and a rain shell that is ticked as packed is not therefore on your back.
--
-- Deliberately not packing rows, and the reason is the tick. A packing row's
-- is_packed means "it is in the case", and a day pack row means "it is on me
-- today" -- the same object needs both, and one boolean cannot hold two claims.
-- The moment they share a table, ticking the shell for Thursday tells the
-- suitcase list the shell has been packed for the trip, which is how a list
-- stops being trusted. So: its own table, its own tick, and a suitcase row is
-- left exactly as it was.
--
-- A null item_date is not missing data. It is the "every day" set: sunscreen,
-- the water bottle, Veda's inhaler -- the things that go in whatever bag is
-- being carried, on every day of the trip. One row, shown on every day.

create table if not exists day_pack_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips (id) on delete cascade,
  -- The day this comes out of the case for. Null means every day of the trip.
  item_date date,
  item text not null,
  -- Why it is on the list, in the app's own words or the tip's. The reason is
  -- what makes a day pack readable rather than a second inventory: "showers from
  -- 2pm, open deck boat" is the difference between a line you trust and a line
  -- you delete.
  why text,
  assignee text not null default 'Shared',
  is_packed boolean not null default false,
  packed_by uuid,
  packed_at timestamptz,
  -- Where the line came from: the family typed it, Aly worked it out, or it was
  -- a pro tip filed onto a day. Kept because a family clearing Aly's guesses
  -- should never lose a line they wrote themselves.
  source text not null default 'you',
  from_tip_id uuid references pro_tips (id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint day_pack_items_item_check check (length(btrim(item)) > 0),
  constraint day_pack_items_source_check check (source in ('you', 'aly', 'tip'))
);

comment on table day_pack_items is
  'What the family carries on one day of a trip, or on every day when item_date is null. Separate from packing_items because a day pack tick means "on me today" and a packing tick means "in the case".';
comment on column day_pack_items.item_date is
  'The day this is for. Null is the every-day set, shown on every day of the trip.';

create index if not exists day_pack_items_trip_day_idx
  on day_pack_items (trip_id, item_date, sort_order);

-- One line per thing per day. Aly runs more than once, a tip can be accepted
-- twice on two devices, and neither should produce two boxes to tick for one
-- object. Coalesced because a unique index treats every null as distinct, which
-- would leave the every-day set unprotected.
create unique index if not exists day_pack_items_one_per_day
  on day_pack_items (
    trip_id,
    coalesce(item_date, '1900-01-01'::date),
    lower(btrim(item))
  );

alter table day_pack_items enable row level security;

drop policy if exists day_pack_all on day_pack_items;
create policy day_pack_all on day_pack_items
  for all
  to authenticated
  using (public.is_family_member(public.trip_family(trip_id)))
  with check (public.is_family_member(public.trip_family(trip_id)));

-- A secondary traveler -- a child, or a friend along for the ride -- may read and
-- tick their own lines and the shared ones, and may not write or destroy any.
-- Wider than the packing rule on purpose: a day pack is mostly Shared by nature,
-- and a thirteen-year-old who cannot tick the dry bag off is being shown a list
-- she has no way to use. Narrower in the other direction for the same reason
-- packing is: what goes on the list is the household's call.
create policy day_pack_secondary_read on day_pack_items as restrictive
  for select to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and (
        assignee = 'Shared'
        or assignee = public.my_traveler_name(public.trip_family(trip_id))
      )
    )
  );

create policy day_pack_secondary_update on day_pack_items as restrictive
  for update to authenticated
  using (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and (
        assignee = 'Shared'
        or assignee = public.my_traveler_name(public.trip_family(trip_id))
      )
    )
  )
  with check (
    not public.is_secondary_traveler(public.trip_family(trip_id))
    or (
      public.on_trip(trip_id)
      and (
        assignee = 'Shared'
        or assignee = public.my_traveler_name(public.trip_family(trip_id))
      )
    )
  );

create policy day_pack_secondary_insert on day_pack_items as restrictive
  for insert to authenticated
  with check (not public.is_secondary_traveler(public.trip_family(trip_id)));

create policy day_pack_secondary_delete on day_pack_items as restrictive
  for delete to authenticated
  using (not public.is_secondary_traveler(public.trip_family(trip_id)));

-- And the columns that update may touch. The policy above says which rows; this
-- says which fields, because a row a secondary may tick is not a row they may
-- rewrite. Its own function rather than the shared one packing uses, whose first
-- act is to refuse any row that is not assigned to the reader by name -- which is
-- exactly the Shared lines a day pack is made of.
create or replace function public.day_pack_secondary_may_only_check_off()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fid uuid;
begin
  fid := public.trip_family(new.trip_id);
  if not public.is_secondary_traveler(fid) then
    return new;
  end if;

  if new.trip_id is distinct from old.trip_id
    or new.item is distinct from old.item
    or new.item_date is distinct from old.item_date
    or new.why is distinct from old.why
    or new.assignee is distinct from old.assignee
    or new.source is distinct from old.source
    or new.from_tip_id is distinct from old.from_tip_id
    or new.sort_order is distinct from old.sort_order
  then
    raise exception
      'You can check things off the day pack, but not change what is on it.'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists day_pack_secondary_guard on day_pack_items;
create trigger day_pack_secondary_guard
  before update on day_pack_items
  for each row execute function public.day_pack_secondary_may_only_check_off();

-- ---------------------------------------------------------------------------
-- Advice that belongs to a day rather than to the trip
-- ---------------------------------------------------------------------------

-- A trip shows three tips at most, and that cap is the whole reason the feature
-- works: three things worth reading beat twelve nobody reads. It also means a
-- pair of binoculars was competing with Veda's passport window for the same
-- slot. Day-carry advice is not trip advice -- it is one line on one morning --
-- so it gets a scope of its own and moves off the Tips screen onto the day it is
-- about, where the Tips screen says where it went.
alter table pro_tips
  drop constraint if exists pro_tips_scope_check;
alter table pro_tips
  add constraint pro_tips_scope_check
  check (scope in ('trip', 'item', 'packing', 'daypack', 'wallet', 'offers'));

-- The day the advice is for, which is not act_by. act_by is a deadline -- book by
-- the first of October -- and this is the morning the thing is carried.
alter table pro_tips
  add column if not exists for_date date;

comment on column pro_tips.for_date is
  'The day a daypack-scoped tip is about, which is the day it is shown on. Not a deadline; act_by is the deadline.';

alter table pro_tips
  drop constraint if exists pro_tips_daypack_has_a_day;
alter table pro_tips
  add constraint pro_tips_daypack_has_a_day
  check (scope <> 'daypack' or (trip_id is not null and for_date is not null));

create index if not exists pro_tips_daypack_idx
  on pro_tips (trip_id, for_date)
  where scope = 'daypack';

-- ---------------------------------------------------------------------------
-- Moving the advice that was already filed in the wrong place
-- ---------------------------------------------------------------------------

-- Three of the trip's live tips are day-carry advice that has been sitting in
-- the trip and packing lists since it was written: what to strip out of the
-- daypacks before Katmai, what the floatplane's weight limit does to it, and the
-- physical licenses Denali wants carried. They are moved rather than copied, so
-- the Tips screen gets its slots back.
--
-- Two tests, both narrow, because a wrong move here is a tip the family cannot
-- find. The title has to name carrying or wearing -- a day pack, a backpack,
-- wear, carry, bring -- which excludes "pack festive outfits for the sailing",
-- correctly: that is a suitcase instruction with a date near it, not a thing for
-- one morning. And the day has to be resolvable to exactly one date on the
-- trip's own itinerary, either from the booking the tip hangs off or from a date
-- the tip says out loud in words the itinerary agrees with. Anything ambiguous
-- is left exactly where it is.
with candidate as (
  select
    p.id,
    p.trip_id,
    coalesce(p.title, '') || ' ' ||
      coalesce(p.body, '') || ' ' ||
      coalesce(p.because, '') as said,
    i.item_date as booking_day
  from pro_tips p
  left join itinerary_items i on i.id = p.itinerary_item_id
  where p.status = 'active'
    and p.trip_id is not null
    and p.scope in ('trip', 'item', 'packing')
    and p.title ~* '\y(day ?packs?|daypacks?|backpacks?|wear|wearing|carry|bring)\y'
),
trip_day as (
  select distinct trip_id, item_date
  from itinerary_items
  where item_date is not null
),
spoken as (
  select c.id, d.item_date
  from candidate c
  join trip_day d on d.trip_id = c.trip_id
  where c.said ilike '%' || to_char(d.item_date, 'FMMonth FMDD') || '%'
     or c.said ilike '%' || to_char(d.item_date, 'FMMon FMDD') || '%'
     or c.said like '%' || to_char(d.item_date, 'YYYY-MM-DD') || '%'
),
resolved as (
  select
    c.id,
    coalesce(
      c.booking_day,
      case
        when (select count(distinct s.item_date) from spoken s where s.id = c.id) = 1
        then (select min(s.item_date) from spoken s where s.id = c.id)
      end
    ) as for_date
  from candidate c
)
update pro_tips p
set scope = 'daypack',
    for_date = r.for_date,
    -- The fingerprint carries the scope, so a moved tip keeps its identity only
    -- if it is rewritten. Left stale, the next look would generate the same
    -- advice again, find no collision, and file a second copy.
    fingerprint = 'daypack:' || p.trip_id::text ||
      ':' || left(btrim(regexp_replace(lower(p.title), '[^a-z0-9]+', ' ', 'g')), 70)
from resolved r
where p.id = r.id and r.for_date is not null;
