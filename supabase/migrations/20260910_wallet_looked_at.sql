-- When the family last had a pro-tips look run on the Wallet.
--
-- The trip page has run its own look on open, once a day, since
-- 20260909_trip_facts_looked_at, and it gates that on trip_facts.looked_at.
-- The Wallet needs the same behavior and has nowhere to keep the same
-- stamp: a wallet tip belongs to the family rather than to a trip, and
-- trip_facts is keyed by trip.
--
-- So the stamp lives on the family. It moves every time /api/tips/wallet
-- answers successfully, whichever of the two wallet questions was asked --
-- the programs they hold, or the welcome offers on cards they do not --
-- because the question the Wallet screen asks on open is "did we look at
-- all today", not "did that particular half of the look succeed".
--
-- Deliberately not derived from the newest wallet pro_tips row. A look that
-- ran and honestly found nothing writes no tip, and reading the tips would
-- make that family re-run two grounded model calls on every single open of
-- the Wallet -- which is the exact bug the trip migration was written to
-- fix.
alter table public.families
  add column if not exists wallet_looked_at timestamp with time zone;

-- The closest proxy this app has for "we last looked at the Wallet on" is
-- the newest wallet-scope tip already on file. Copied across so a family
-- who looked earlier today does not have the look fire again the first
-- time they open the Wallet after this lands.
update public.families f
   set wallet_looked_at = t.newest
  from (
        select family_id, max(created_at) as newest
          from public.pro_tips
         where scope in ('wallet', 'offers')
         group by family_id
       ) t
 where t.family_id = f.id
   and f.wallet_looked_at is null;

comment on column public.families.wallet_looked_at is
  'Timestamp of the most recent successful pro-tips look on the Wallet, whether or not it found anything. The Wallet screen uses this column to gate its once-a-day look on open, the same way the trip page uses trip_facts.looked_at.';
