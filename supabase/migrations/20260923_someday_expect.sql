-- What to expect, kept on the bucket-list place it is about.
--
-- The months on one of these rows already get an answer with a reason and a date
-- beside it. This is the other question a wish list cannot answer on its own:
-- what would this place actually be like for this household, what will it cost to
-- get there from their own airports, how far ahead does it have to be booked, and
-- is there something about it that quietly rules it out. A place name cannot say
-- any of that, and a family looking at eleven names has no way to tell the
-- realistic one from the fantasy.
--
-- Three columns rather than a table, and the same three the months already use,
-- because the answer belongs to exactly one row and dies with it.
--
-- expect holds the whole panel as it was said: the verdict, the seven checks
-- against what the family has written down with a sentence each, the cost line,
-- what the trip is really like, the booking lead time, and anything that rules it
-- out. Held as jsonb rather than as fifteen columns because none of it is ever
-- queried -- it is read back whole, by the one screen that asked for it.
--
-- expect_sources is what she read to say it, so the cost and season claims can be
-- checked by a person before anybody spends money on them.
--
-- expect_said_at is the load-bearing one. A fare expectation read off the web in
-- September is a claim about September, and this is a list people keep for years.
-- Undated, it would age into confident nonsense. Dated, the screen can say how old
-- it is and the family can decide whether to trust it or ask again.
--
-- Nothing here is what a fare gets judged against. The months, the airfare ceiling
-- and the traveler list still are, and they are still only ever written by a
-- person or by a person accepting a proposal. This is Aly's read on a place, and
-- storing it changes nothing except how long the family waits to see it again.

alter table public.someday_places
  add column if not exists expect jsonb,
  add column if not exists expect_sources jsonb,
  add column if not exists expect_said_at timestamptz;

comment on column public.someday_places.expect is
  'Aly''s read on this place, as one panel: verdict, the checks against the household record, cost, what it is like, booking lead time, and anything that rules it out. Read back whole; never queried.';

comment on column public.someday_places.expect_sources is
  'What she read to say it. Titles and urls, so a cost or season claim can be checked before anybody spends money on it.';

comment on column public.someday_places.expect_said_at is
  'When she said it. A fare expectation ages, and this list is kept for years, so the screen can say how old the answer is.';
