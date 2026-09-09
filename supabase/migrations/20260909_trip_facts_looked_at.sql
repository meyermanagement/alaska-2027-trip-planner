-- When the family last had a pro-tips look run on this trip.
--
-- Separate from checked_at, which means something different. checked_at
-- is the timestamp of the last time the model actually re-researched the
-- destination and rewrote the fact sheet; it moves on the order of once
-- a week because the sheet has a seven-day freshness window. The trip
-- page's decision about whether to auto-run a look on open is a
-- different question -- "did we look at all today, whether the research
-- step had to fire or not" -- and it was reading checked_at, so any trip
-- whose fact sheet was more than a day old auto-ran a look every single
-- time the trip was opened. On a well-known destination like Walt
-- Disney World, whose sheet holds for the whole week, that is every
-- open.
--
-- looked_at moves every time /api/tips/refresh returns a successful
-- answer, whether or not the fact sheet was re-researched, and every
-- time it hands back a slow step. It is what the trip page reads for
-- the once-a-day gate. checked_at keeps its old meaning so
-- factsAreStale can still say "the fact sheet itself is old" without
-- being tricked by a look that ran off the fresh sheet.
alter table public.trip_facts
  add column if not exists looked_at timestamp with time zone;

-- Existing trip_facts rows already have a checked_at, which is the closest
-- proxy the app has for "we last looked at this trip on". Copied across so
-- the once-a-day gate does not fire on the first open of every trip after
-- this migration lands.
update public.trip_facts
   set looked_at = checked_at
 where looked_at is null
   and checked_at is not null;

comment on column public.trip_facts.looked_at is
  'Timestamp of the most recent successful pro-tips look on this trip, whether or not the fact sheet had to be re-researched. Distinct from checked_at, which is only bumped when the sheet itself was re-written. The trip page uses this column to gate the once-a-day auto-look.';
