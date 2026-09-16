-- A calendar address that stops working on its own.
--
-- The subscription URL is the whole credential: a calendar app cannot sign in, so
-- the token in the path is what stands between a stranger and the household's
-- itinerary. Until now that token was forever. Forever is the wrong length for a
-- bearer credential that gets pasted into a phone, a work laptop and a shared
-- family iPad, and it is the part of the design counsel asked about (07 item 11).
--
-- So every feed now has an end date. Six months, renewable in one press from the
-- Trips screen, and the feed route refuses an expired token the same way it
-- refuses an unknown one. Rotating still exists and is the immediate off switch;
-- this is the slow one that runs even when nobody remembers to press anything.
--
-- Existing rows get six months from when they were made, but never less than
-- thirty days from today: a live subscription must not go quiet because a
-- migration ran.

alter table public.calendar_feeds
  add column if not exists expires_at timestamptz;

update public.calendar_feeds
set expires_at = greatest(
      coalesce(created_at, now()) + interval '180 days',
      now() + interval '30 days'
    )
where expires_at is null;

alter table public.calendar_feeds
  alter column expires_at set default (now() + interval '180 days');

alter table public.calendar_feeds
  alter column expires_at set not null;

comment on column public.calendar_feeds.expires_at is
  'When this subscription address stops being answered. Six months by default, renewable from the Trips screen. The feed route refuses an expired token with 404, so an address that leaks or is forgotten dies on its own.';
