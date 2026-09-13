-- Nothing is carried on a day unless it is on the trip's packing list.
--
-- This was already how every write behaved, but only because each write path
-- remembered to behave that way. A read that failed, a permission error, an
-- import written later, or a path somebody adds next year could all produce a
-- carried line tied to nothing, and nothing would say so: the row simply sat
-- there, on somebody's back on Wednesday and absent from the trip. The one place
-- that noticed was the removal question, which had to match by name to guess at
-- what the row should have been pointing at all along.
--
-- So the database holds the rule now. A day pack line must name a packing line,
-- and that packing line must be on the same trip -- the second half matters
-- because a plain reference only checks the row exists, and a link across trips
-- would cascade a deletion from one family holiday into another.
--
-- The pairing needs something to point at, so packing_items gains a unique key on
-- (trip_id, id). It is redundant with the primary key by design; a composite
-- foreign key cannot be written without it.
alter table packing_items
  add constraint packing_items_trip_id_id_key unique (trip_id, id);

-- Written before the column is made mandatory, so any row that predates the tie
-- fails the fill rather than the constraint, and the error names the row.
update day_pack_items d
set from_packing_id = p.id
from packing_items p
where d.from_packing_id is null
  and p.trip_id = d.trip_id
  and p.stashed_at is null
  and lower(btrim(p.item)) = lower(btrim(d.item));

alter table day_pack_items
  drop constraint if exists day_pack_items_from_packing_id_fkey;

alter table day_pack_items
  add constraint day_pack_items_from_packing_id_fkey
  foreign key (trip_id, from_packing_id)
  references packing_items (trip_id, id) on delete cascade;

alter table day_pack_items
  alter column from_packing_id set not null;

comment on column day_pack_items.from_packing_id is
  'The packing row this is the same object as, on the same trip. Required: nothing is carried on a day without also being on the trip list. Deleting the packing row deletes this line with it.';
