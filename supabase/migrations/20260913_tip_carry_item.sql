-- The difference between advice about a day and a thing to carry on it.
--
-- A tip filed onto a day is shown inside that day's bag with a tick box, and
-- ticking it writes two rows: one in the bag and one on the trip's packing list.
-- That is right when the tip names an object -- "Pack a 10L dry bag for the
-- floatplane" becomes a dry bag you can tick. It is wrong when the tip is an
-- instruction about the bag rather than a thing in it: "Pare down day pack gear
-- for your Katmai floatplane flight" is good advice about a real weight limit,
-- and accepting it used to put that whole sentence on the packing list as an
-- item, permanently. Advice that says take less has no object to add at all.
--
-- So the model is now asked to name the object separately. carry_item null means
-- the tip is advice about the day and nothing else: it shows under the bag as
-- something worth knowing, with no tick box and nothing to accept, and it can be
-- cleared like any other tip. Non-null means it is a thing, and that short noun
-- phrase -- not the title -- is what goes in the bag and on the list, with the
-- tip's own sentence kept underneath as the reason it is there.
--
-- Tips written before this column existed have it null, which puts them in the
-- advice group. That is the safer default of the two: an object shown as advice
-- is a line somebody adds by hand, and a sentence shown as an object is a
-- sentence on the packing list forever.

alter table pro_tips
  add column if not exists carry_item text;

comment on column pro_tips.carry_item is
  'The single object this day-carry tip is about, as a short noun phrase, or null when the tip is advice about the day rather than a thing to put in the bag. Only ever set on scope = daypack.';

-- A noun phrase, not a sentence. The check is deliberately loose about content
-- and strict about length, because the failure this guards against is a
-- paragraph arriving in the column and being ticked onto the packing list.
alter table pro_tips
  drop constraint if exists pro_tips_carry_item_check;

alter table pro_tips
  add constraint pro_tips_carry_item_check check (
    carry_item is null
    or (length(btrim(carry_item)) between 2 and 60)
  );
