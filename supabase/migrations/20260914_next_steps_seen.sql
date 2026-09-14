-- When a household first read the four things worth doing next.
--
-- That screen is the last of the first-login walkthrough, and every screen in
-- the walkthrough is deliberately bare: no menu and no Ask Aly button, because
-- somebody being walked in for the first time is being asked to read one thing
-- and press one button, and a menu on the first screen of an app is an
-- invitation to leave before you have seen anything.
--
-- It is no longer only a walkthrough screen. The menu now marks the rows behind
-- whatever is still outstanding and offers a way back here, so the same page is
-- reached weeks later by somebody who is already living in the app -- and for
-- them a screen with no menu is a dead end that has to be escaped with the
-- browser's back button.
--
-- So the chrome is drawn from the second arrival onward, and this is how the
-- second arrival is known. The walkthrough stamp on the traveler cannot answer
-- it: welcomed_at is set two screens earlier, when the moments question is
-- finished, so it is already non-null by the time anybody reaches this page.
--
-- On the family rather than the traveler because this screen is the household
-- owner's, the same way all four of the things it asks for are.
alter table public.families
  add column if not exists next_steps_seen_at timestamp with time zone;

comment on column public.families.next_steps_seen_at is
  'When the four-things-worth-doing screen was first read. Null means nobody has seen it, and it renders bare as the last screen of the walkthrough; non-null means a revisit, and the page draws the menu and the Ask Aly button like every other screen.';

-- Backfilled, unlike the setup latch beside it, and for the opposite reason.
-- Every household already using the app has the walkthrough behind them, and
-- leaving their stamp null would hand them the bare walkthrough version once
-- more -- no menu on a page they reached from the menu -- before the app finally
-- agreed they had seen it. So a family whose owner finished the walkthrough is
-- stamped with the moment they finished it, which is the truest date available.
update public.families f
set next_steps_seen_at = w.first_welcomed
from (
  select family_id, min(welcomed_at) as first_welcomed
  from public.travelers
  where welcomed_at is not null
  group by family_id
) w
where w.family_id = f.id
  and f.next_steps_seen_at is null;
