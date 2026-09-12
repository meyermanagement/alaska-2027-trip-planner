-- Which suitcase line a day pack row is really about.
--
-- A day pack is mostly not new stuff. The rain shell, the binoculars and the
-- water bottles are already on the trip's packing list; what the family is
-- deciding at eight in the morning is which of those things comes out of the
-- case today. Aly could only ever offer a new line, so "carry the rain shell"
-- read as a second, unrelated object, and nobody could tell whether the shell
-- being carried was the shell that was packed.
--
-- The rule the family settled on is that nothing is carried on a day without
-- also being on the trip's list, so this ends up set on almost every row: the
-- app finds the matching packing line, and writes one when there is none. Null
-- survives only for rows written before this existed.
--
-- Cascade, not set null, and that is the asymmetry on purpose. Taking something
-- out of the case means it is not on the trip at all, so it cannot be on
-- somebody's back on Wednesday either -- the day pack line goes with it, and the
-- screen warns before it happens. Going the other way is a question, not a
-- consequence: dropping the binoculars from Wednesday does not mean leaving them
-- at home, so that direction asks first and is handled in the app.
alter table day_pack_items
  add column if not exists from_packing_id uuid
  references packing_items (id) on delete set null;

alter table day_pack_items
  drop constraint if exists day_pack_items_from_packing_id_fkey;

alter table day_pack_items
  add constraint day_pack_items_from_packing_id_fkey
  foreign key (from_packing_id) references packing_items (id) on delete cascade;

comment on column day_pack_items.from_packing_id is
  'The packing row this is the same object as. Set whenever the thing carried is on the trip list, which is meant to be always. Deleting the packing row deletes this line with it.';

create index if not exists day_pack_items_from_packing_idx
  on day_pack_items (from_packing_id)
  where from_packing_id is not null;
