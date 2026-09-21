-- An offer that ended takes its sentence with it.
--
-- Card offers already had an 'expired' status and an end date, but only the offer
-- moved: the tip that carried the terms stayed active, so the app went on arguing
-- for a bonus nobody could claim any more. 'cleared' would be a lie (nobody read
-- and acted on it) and 'declined' would be another (nobody turned it down), so a
-- tip whose offer ran out is now 'expired': off the live list, out of the cleared
-- record, still in the table so the next look does not write the same sentence
-- again. Retention never deletes pro_tips, so nothing here changes what is kept.

alter table public.pro_tips drop constraint if exists pro_tips_status_check;

alter table public.pro_tips
  add constraint pro_tips_status_check
  check (status = any (array['active'::text, 'cleared'::text, 'ignored'::text, 'declined'::text, 'expired'::text]));

-- The tips left behind by offers that expired before this existed.
update public.pro_tips as t
set status = 'expired',
    resolved_at = coalesce(t.resolved_at, now())
from public.card_offers as o
where o.tip_id = t.id
  and o.status = 'expired'
  and t.status = 'active';
