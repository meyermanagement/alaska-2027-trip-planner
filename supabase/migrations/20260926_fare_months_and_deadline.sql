-- The months a fare is good for, and what its sender said about the clock.
--
-- A fare alert nearly always states its travel window in month names -- "full
-- availability Oct - Feb, best in November and January" -- and almost never in
-- dates. The reader was told not to turn a month name into a date, correctly, so
-- travel_start and travel_end came back null, and with no dates the month check
-- had nothing to run against. The consequence was a card that called a July fare
-- to a place the family can only visit in July and August "a place on your list"
-- while sitting on the very sentence that decides it.
--
-- travel_months holds those month numbers as they were written, so the check can
-- run without anybody pretending to know a day. It is the same shape as the
-- months already on a bucket-list place, which is what it gets compared against.
--
-- The deadline is the other half. "We think this will last less than 24 hours" is
-- not a date and cannot honestly be stored as one without saying so, but it is
-- the most actionable line in the email. So it is kept twice: deadline_said is
-- the sender's own words, verbatim, and book_by_inferred marks a book_by that was
-- worked out from those words against the hour the mail arrived rather than read
-- off the page. The card reads the mark and changes its wording, because "the
-- sender expected it gone by Thursday" is true and "it has to be booked by
-- Thursday" would be this app inventing a deadline.

alter table public.flight_deals
  add column if not exists travel_months smallint[],
  add column if not exists deadline_said text,
  add column if not exists book_by_inferred boolean not null default false;

comment on column public.flight_deals.travel_months is
  'Months the fare is good for, 1-12, read from month names in the alert when no dates were written. Compared against someday_places.months.';
comment on column public.flight_deals.deadline_said is
  'The sender''s own words about how long the fare lasts, copied verbatim from the email. Never paraphrased and never turned into a claim of our own.';
comment on column public.flight_deals.book_by_inferred is
  'True when book_by was worked out from a stated horizon against the hour the mail arrived, rather than read as a date off the page.';
