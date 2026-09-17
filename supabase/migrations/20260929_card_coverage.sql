-- Coverage that comes with a credit card, filed beside the coverage you bought.
--
-- A family that books a flight on a travel card is often insured twice and
-- knows it once. The bought policy arrives as a certificate they file; the card
-- coverage sits in a benefits guide nobody opens until the flight is cancelled,
-- and by then the question is whether the fare was even paid on that card.
--
-- Rather than build a second kind of record for it, a card benefit is filed as
-- what it is: a policy, with the card as the provider. Everything the app
-- already does with a policy then works on it -- the covers chips, the limits,
-- the claims number, the coverage window, and Aly reading all of that when
-- somebody asks what happens if the boat does not sail.
--
-- The one thing a card policy has that a bought one does not is the card it
-- comes with, because card coverage is nearly always conditional on the trip
-- having been paid for with that card. Naming the program lets the app say so
-- against a real wallet row instead of in the abstract.

alter table public.insurance_policies
  drop constraint if exists insurance_policies_kind_check;

alter table public.insurance_policies
  add constraint insurance_policies_kind_check
  check (kind in ('trip', 'annual', 'card'));

alter table public.insurance_policies
  add column if not exists rewards_program_id uuid
  references public.rewards_programs (id) on delete set null;

comment on column public.insurance_policies.kind is
  'trip is bought for one journey, annual is a multi-trip plan, card is coverage that comes with a credit card or loyalty program rather than being bought.';
comment on column public.insurance_policies.rewards_program_id is
  'The wallet row this coverage comes with, on card policies. Null on a policy the family bought.';

create index if not exists insurance_policies_program_idx
  on public.insurance_policies (rewards_program_id)
  where rewards_program_id is not null;

-- The staged half of the inbox has to accept the same word, or a benefits guide
-- forwarded to the trip address gets read correctly and then refused at insert.
alter table public.inbox_parsed_policies
  drop constraint if exists inbox_parsed_policies_kind_check;

alter table public.inbox_parsed_policies
  add constraint inbox_parsed_policies_kind_check
  check (kind in ('trip', 'annual', 'card'));
