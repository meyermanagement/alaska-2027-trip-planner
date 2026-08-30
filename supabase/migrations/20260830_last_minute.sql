-- Items that cannot be packed in advance.
--
-- A packing list is mostly things you can put in a bag a week early. A few things
-- you physically cannot: the medications somebody is still taking, the toothbrush
-- and the razor, the retainer, the phone charger that is in the wall until the
-- moment you leave. Those items sit unticked on the list for the whole run-up,
-- which trains the family to read an unfinished list as finished -- and then the
-- one that mattered is the one still on the bathroom shelf.
--
-- So the distinction is recorded rather than remembered. A flag on the item, not a
-- separate list, because it is a property of the thing and it has to survive being
-- copied into a template and back out into the next trip.
--
-- Default false on purpose: every item already on both tables is one nobody has
-- thought about this way yet, and false is the honest reading of that. Not null,
-- because a three-state flag here would mean nothing useful -- an item either has
-- to wait for the last morning or it does not.

alter table public.packing_items
  add column if not exists last_minute boolean not null default false;

alter table public.packing_template_items
  add column if not exists last_minute boolean not null default false;

comment on column public.packing_items.last_minute is
  'True when the item cannot be packed ahead -- medications, toiletries, chargers in the wall. Surfaced as its own section on the packing screen as departure gets close.';

comment on column public.packing_template_items.last_minute is
  'Carried onto every item this template creates, so the distinction survives from one trip to the next.';
