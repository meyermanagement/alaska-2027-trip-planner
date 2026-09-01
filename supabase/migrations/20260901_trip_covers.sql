-- A picture behind every trip, drawn rather than borrowed.
--
-- The Field Journal look prints a photograph as a duotone behind each trip card
-- and each trip header. A photograph is the one thing this app cannot fetch
-- honestly: the family has no photographs of a place they have not been yet, and
-- a stock image of Alaska carries a licence, an attribution line and somebody
-- else's idea of what the trip looks like. So Aly draws one instead -- a flat,
-- two-tone illustration of the place, generated once per trip and kept.
--
-- Five columns, and each earns its place:
--
--   cover_image_url     where the file is. Public, because the card is behind
--                       the family's own login but the image element is not
--                       going to carry a signed URL that expires mid-week.
--   cover_image_status  none | drawing | ready | failed. A generation takes
--                       twenty to forty seconds, which is long enough that the
--                       screen has to be able to say what is happening.
--   cover_image_prompt  what was asked for. Kept so a cover that came out wrong
--                       can be looked at rather than guessed about, and so
--                       "draw it again, more winter" has something to start from.
--   cover_image_alt     what the picture shows, in words, for a screen reader
--                       and for the day the file is missing.
--   cover_image_at      when it was drawn. A trip whose dates move from August
--                       to February has the wrong light on it.
--
-- Nothing here is required. A trip with no cover falls back to the contour
-- drawing of its own coastline, which is the other half of the same look.

alter table trips
  add column if not exists cover_image_url text,
  add column if not exists cover_image_status text not null default 'none',
  add column if not exists cover_image_prompt text,
  add column if not exists cover_image_alt text,
  add column if not exists cover_image_at timestamptz;

-- Spelled out rather than left as free text, because four states that the screen
-- switches on is exactly the case a check constraint is for.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trips_cover_image_status_check'
  ) then
    alter table trips
      add constraint trips_cover_image_status_check
      check (cover_image_status in ('none', 'drawing', 'ready', 'failed'));
  end if;
end $$;

-- Where the files live. Public read, because these are drawings of Denali and
-- Willemstad rather than anybody's private photographs, and a public bucket is
-- the difference between an <img> tag and a signing round trip on every card.
-- Writes are the service role's alone: the generation runs on the server, so no
-- browser ever needs to be trusted with an upload here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-covers',
  'trip-covers',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Anyone may read a cover; nobody may write one from a browser.
drop policy if exists "trip covers are readable" on storage.objects;
create policy "trip covers are readable" on storage.objects
  for select using (bucket_id = 'trip-covers');

-- And where the trip is, as one point.
--
-- The contour drawing behind a trip is a real coastline, projected around the
-- place the trip is about, so it needs a latitude and a longitude. Itinerary
-- items already carry their own points, but only one trip in eight has any: the
-- geocoding of items happens on the day view, and a trip nobody has opened on
-- the day has nothing. A trip's destination string -- "Willemstad, Curacao" --
-- geocodes once and stands for the whole trip, which is exactly the resolution a
-- backdrop needs.
--
-- Same four columns as itinerary_items, and for the same reason: the text that
-- was looked up is kept beside the answer, so an edited destination can be seen
-- to have outrun its point.
alter table trips
  add column if not exists lat double precision,
  add column if not exists lon double precision,
  add column if not exists geo_query text,
  add column if not exists geo_at timestamptz;
