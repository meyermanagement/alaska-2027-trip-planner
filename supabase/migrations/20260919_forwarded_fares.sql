-- Fares that arrived by email rather than by paste.
--
-- The household already forwards booking confirmations to its trips.alyeska.app
-- address. This lets the same address carry the deal newsletters they already
-- subscribe to -- Thrifty Traveler and its neighbors -- and turns the fares in
-- them into rows on the bucket list, but only the fares that are actually about
-- this family. Two small changes make that honest.
--
-- First, a fare gets to say which email it came out of. source_name already
-- credits the newsletter, which is what the card shows and what a person clicks
-- to check the price before spending anything. message_id is the stronger claim:
-- this exact row was read out of that exact message, which is still sitting in
-- inbox_messages with its subject and its body. When a forwarded fare turns out
-- to be wrong, that is the difference between "the parse was bad" and "the parse
-- was bad and here is the text it was reading".
--
-- Second, a newsletter is not a booking, and until now a message could only be
-- pending, filed onto a trip, or thrown out as junk. A fare alert is none of the
-- three: nothing about it belongs on a trip, and it was not junk -- it was read,
-- and what it was worth was taken out of it. Leaving it pending would mean the
-- inbox filled up with mail nobody has a decision to make about, which is the
-- one thing that makes reaching zero in there stop working. So it gets a status
-- of its own, and the put-away drawer says what happened to it.

alter table public.flight_deals
  add column if not exists message_id uuid
    references public.inbox_messages (id) on delete set null;

comment on column public.flight_deals.message_id is
  'The forwarded email this fare was read out of, when it arrived that way. Null for a fare somebody pasted in.';

create index if not exists flight_deals_message_idx
  on public.flight_deals (message_id) where message_id is not null;

alter table public.inbox_messages
  drop constraint if exists inbox_messages_status_check;

alter table public.inbox_messages
  add constraint inbox_messages_status_check
    check (status in ('pending', 'filed', 'deleted', 'noted'));
