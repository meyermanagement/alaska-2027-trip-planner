-- Pro tips that belong to the Wallet rather than to a trip.
--
-- Two new scopes, and they are deliberately two rather than one:
--
--   'wallet'  advice about the programs the family already holds -- points about
--             to expire, a travel credit nobody has spent this year, an annual
--             fee coming round on a card whose perks are going unused.
--   'offers'  the welcome bonus on a card the family does NOT hold. A different
--             question, asked of the open web rather than of the family's own
--             rows, and worth its own three slots: sharing one set of three with
--             the advice above meant the interesting one always lost.
--
-- Both hang off family_id with trip_id null, which the table already allowed --
-- the column has always been nullable and nothing was using it that way yet.
--
-- 'about' is the program or card the tip concerns, written plainly: "Chase
-- Sapphire Preferred", "Alaska Mileage Plan". Today it does two things: it stops
-- the same card being suggested twice under two different titles, and it reads
-- well on the card. It is here mainly for later. If a referral arrangement ever
-- sits behind these suggestions, the join is by card name, and a column added
-- now costs nothing while a column added afterwards means every tip filed before
-- it is unattributable.

alter table pro_tips
  drop constraint if exists pro_tips_scope_check;

alter table pro_tips
  add constraint pro_tips_scope_check
  check (scope in ('trip', 'item', 'packing', 'wallet', 'offers'));

alter table pro_tips
  add column if not exists about text;

comment on column pro_tips.about is
  'The program, card or brand this tip concerns. Set on wallet and offers tips. '
  'The key any future referral or affiliate record would join on.';

-- A tip about the Wallet is not about a trip, and a tip about a trip is not
-- about the Wallet. Said out loud so a wallet tip cannot end up hanging off a
-- trip and appearing on that trip's page, where nothing explains it.
alter table pro_tips
  drop constraint if exists pro_tips_wallet_has_no_trip;

alter table pro_tips
  add constraint pro_tips_wallet_has_no_trip
  check (scope not in ('wallet', 'offers') or trip_id is null);

-- While we are here: pro_tips had one permissive family-wide policy for every
-- command, so a secondary traveler could clear the family's advice or file new
-- advice of their own. Neither is reachable from the app -- the strip and the
-- cards are not drawn for them at all -- but the app is not the boundary. Read
-- stays: nothing is read from these rows that a secondary is not already shown
-- elsewhere, and taking SELECT away would only make the header queries fail
-- rather than return nothing.
--
-- Restrictive and split per command, for the same reason as every other policy
-- in the access-level migration: a single FOR ALL policy is consulted only
-- through USING on a DELETE, so WITH CHECK would be dead weight and the delete
-- would go through.

drop policy if exists pro_tips_no_secondary_insert on pro_tips;
create policy pro_tips_no_secondary_insert on pro_tips
  as restrictive for insert to authenticated
  with check (not is_secondary_traveler(family_id));

drop policy if exists pro_tips_no_secondary_update on pro_tips;
create policy pro_tips_no_secondary_update on pro_tips
  as restrictive for update to authenticated
  using (not is_secondary_traveler(family_id))
  with check (not is_secondary_traveler(family_id));

drop policy if exists pro_tips_no_secondary_delete on pro_tips;
create policy pro_tips_no_secondary_delete on pro_tips
  as restrictive for delete to authenticated
  using (not is_secondary_traveler(family_id));
