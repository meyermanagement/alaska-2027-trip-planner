-- Two things the offers pass has never been able to know.
--
-- First, when a card was opened, when it was closed, and when a welcome bonus
-- was last earned on it. Every issuer rule that would actually stop an
-- application is a rule about dates: five new accounts in twenty-four months,
-- one welcome bonus per card per forty-eight months, no second bonus ever on
-- some of them. Without these three dates the app could only ever say "here is
-- a rule that exists"; with them it can say whether the family is anywhere near
-- it. They are dates the family types, not dates anything infers.
--
-- Second, the offers themselves. A welcome offer is not a sentence in a tip --
-- it is a claim with a page behind it, a date it was read, terms that change
-- monthly and an end date that arrives. Keeping it as a row means an offer that
-- was turned down can be recognized when it comes round again, and left alone
-- unless the terms actually got better. terms_key is what makes that possible:
-- the bonus, the spend and the fee reduced to one string, so a genuinely new
-- offer on the same card is a new row and a rerun of the same offer is not.

alter table rewards_programs
  add column if not exists opened_on date,
  add column if not exists closed_on date,
  add column if not exists bonus_earned_on date;

comment on column rewards_programs.opened_on is
  'When this account was opened, as the family recorded it. Feeds new-account velocity rules.';
comment on column rewards_programs.closed_on is
  'When it was closed. A closed card is an inactive row that still counts against issuer rules.';
comment on column rewards_programs.bonus_earned_on is
  'When a welcome bonus was last earned on this card, for once-per-lifetime and lookback rules.';

create table if not exists card_offers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  -- The tip this offer was written up as, when there is one. Nulled rather than
  -- cascaded when the tip goes, because the offer and the decision about it
  -- outlive whatever card the advice was shown on.
  tip_id uuid references pro_tips (id) on delete set null,
  issuer text not null,
  card_name text not null,
  terms_key text not null,
  bonus_text text,
  -- The bonus as a number as well as a sentence, because the only way to know
  -- whether an offer they turned down has genuinely got better is to compare it.
  bonus_amount numeric,
  bonus_unit text,
  min_spend numeric,
  spend_window_days integer,
  annual_fee numeric,
  offer_ends_on date,
  source_url text,
  source_title text,
  verified_on date not null default current_date,
  first_seen_on date not null default current_date,
  status text not null default 'open'
    check (status in ('open', 'declined', 'taken', 'expired')),
  decided_on date,
  decided_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per family per set of terms. The upsert on the way in relies on this:
-- seeing the same offer again refreshes verified_on rather than filing a second
-- copy, and a decision already recorded against those terms survives it.
create unique index if not exists card_offers_family_terms
  on card_offers (family_id, terms_key);

create index if not exists card_offers_family_status
  on card_offers (family_id, status);

alter table card_offers enable row level security;

drop policy if exists card_offers_family on card_offers;
create policy card_offers_family on card_offers
  for all
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

-- The Wallet is closed to secondary travelers, and so is everything computed
-- from it. Same shape as the policy on rewards_programs.
drop policy if exists card_offers_no_secondary on card_offers;
create policy card_offers_no_secondary on card_offers
  for all
  using (not is_secondary_traveler (family_id))
  with check (not is_secondary_traveler (family_id));

drop trigger if exists card_offers_touch on card_offers;
create trigger card_offers_touch
  before update on card_offers
  for each row
  execute function touch_updated_at ();
