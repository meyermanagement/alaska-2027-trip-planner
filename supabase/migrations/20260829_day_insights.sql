-- Today, on a trip: what each item needs, and where each item is.
--
-- Two additions, both caches of things that cost money or a public service's
-- goodwill to look up, and neither of them user-authored content.
--
-- 1. Coordinates on an itinerary item. Every distance, travel time and weather
--    lookup for a day needs a point, and geocoding the same six places on every
--    page load would be both slow and a poor way to treat a free geocoder. Stored
--    next to the item, with the string that produced them, so a corrected address
--    can be spotted as stale.
--
-- 2. item_insights: what Aly found out about a specific booking -- the dress code,
--    how early the operator wants you, the one thing worth knowing. Keyed to the
--    item and stamped with a fingerprint of the fields the answer depended on, so
--    that moving a dinner from 6:00 to 8:30 retires the advice instead of leaving
--    yesterday's answer on today's screen.

alter table itinerary_items
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  -- The exact text that was geocoded. When the location is edited this no longer
  -- matches, which is how we know the point below is about the old address.
  add column if not exists geo_query text,
  add column if not exists geo_at timestamptz;

create table if not exists item_insights (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  trip_id uuid not null references trips (id) on delete cascade,
  item_id uuid not null references itinerary_items (id) on delete cascade,

  -- title|date|time|location|category at the moment of research. A change means
  -- the advice was about a different plan.
  fingerprint text not null,

  -- What to wear, when the venue actually has an opinion. Null is the common and
  -- correct answer; inventing "smart casual" for a taco stand would teach the
  -- family to stop reading the line.
  dress_code text,

  -- How early to arrive, from the operator's own instruction rather than a rule of
  -- thumb, and the reason in their words.
  arrive_minutes integer check (arrive_minutes between 0 and 480),
  arrive_why text,

  -- The single thing that would spoil the plan if nobody knew it: cash only, no
  -- bags, sold out by ten, closes for lunch.
  heads_up text,

  -- What to have in hand. Kept separate from heads_up so the packing side can read
  -- it later without parsing prose.
  bring text,

  -- Where every claim above came from. An insight with no sources is a guess, and
  -- the screen says so rather than presenting it level with a cited one.
  sources jsonb not null default '[]'::jsonb,

  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (item_id)
);

create index if not exists item_insights_trip_idx on item_insights (trip_id);

alter table item_insights enable row level security;

-- Read and write for anyone in the family, secondary travellers included, which
-- differs on purpose from pro_tips and the rest.
--
-- Nothing in this table is written by a person. It is generated for whoever opens
-- the day, and the alternative -- letting Veda read insights but not create them --
-- means the feature silently does nothing on her phone and works on her parents'.
-- A cache that only some of the family can fill is a bug that looks like a
-- coincidence. There is also nothing here to protect: every column is overwritten
-- the moment the item's fingerprint changes.
drop policy if exists item_insights_family on item_insights;
create policy item_insights_family on item_insights
  for all to authenticated
  using (
    exists (
      select 1 from family_members fm
      where fm.family_id = item_insights.family_id
        and fm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from family_members fm
      where fm.family_id = item_insights.family_id
        and fm.user_id = auth.uid()
    )
  );

create or replace function touch_item_insights()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists item_insights_touch on item_insights;
create trigger item_insights_touch
  before update on item_insights
  for each row execute function touch_item_insights();
