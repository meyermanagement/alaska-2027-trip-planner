-- Naming the object on day tips that were written before the column existed.
--
-- carry_item arrived null on every tip already in the table, which reads them all
-- as advice. That is the safe default and it is also wrong for the ones that do
-- name a thing, so those are promoted by hand rather than by a pattern: the whole
-- point of the column is that no regex can tell "pack physical driver licenses"
-- from "pare down day pack gear", both of which begin with an instruction to do
-- something with the bag and only one of which puts an object in it.
--
-- Matched on the title rather than on an id so this can run anywhere, and scoped
-- to daypack tips that have no object yet so it cannot overwrite a value the
-- model has since supplied. Only titles that name one object are here. The three
-- Katmai tips are deliberately left as notes: paring gear down, clearing snacks
-- out, and carrying only plain water are all instructions about what does not go
-- in the bag, and there is nothing in any of them to tick off.

update pro_tips
set carry_item = 'Physical driver licenses'
where scope = 'daypack'
  and carry_item is null
  and title = 'Pack physical driver licenses in your daypack for Denali';
