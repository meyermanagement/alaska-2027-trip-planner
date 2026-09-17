-- A refused welcome offer is not a cleared tip.
--
-- Turning a card down used to write the tip that carried it to 'cleared', which
-- filed one decision in two places: the offer landed under "Offers you turned
-- down" with its terms and the day, and the sentence that announced it landed
-- under "Tips you have cleared" as though somebody had merely read it. Reading
-- something and refusing it on those terms are different facts, and the record
-- has to be able to tell them apart.
--
-- So a tip may now be 'declined': off the live list, out of the cleared record,
-- and still in the table where the next look reads it to avoid saying the same
-- thing twice. The status is set by the offer route beside the refusal itself,
-- never by the tip route, so the two rows cannot disagree.

alter table public.pro_tips drop constraint if exists pro_tips_status_check;

alter table public.pro_tips
  add constraint pro_tips_status_check
  check (status = any (array['active'::text, 'cleared'::text, 'ignored'::text, 'declined'::text]));

-- The debris of the bug. Every wallet tip that was cleared while its offer was
-- being refused is really a refusal, and belongs on the offers side of the
-- record rather than in both halves of it.
update public.pro_tips as t
set status = 'declined'
from public.card_offers as o
where o.tip_id = t.id
  and o.status = 'declined'
  and t.status = 'cleared';
