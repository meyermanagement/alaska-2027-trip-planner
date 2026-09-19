-- Explicit cash-price basis; unknown remains unknown for older records.
alter table public.flight_deals
  add column if not exists price_basis text not null default 'unspecified'
  check (price_basis in ('one_way', 'round_trip', 'unspecified'));

-- Only an unambiguous email-wide declaration can backfill existing cash fares.
update public.flight_deals d
set price_basis = case
  when m.text_body ~* '\mall fares (are )?round[- ]?trip\M' then 'round_trip'
  else 'one_way' end
from public.inbox_messages m
where d.message_id = m.id and d.award_pricing is null
  and d.price_basis = 'unspecified'
  and (
    (m.text_body ~* '\mall fares (are )?round[- ]?trip\M'
      and m.text_body !~* '\mall fares (are )?one[- ]?way\M')
    or
    (m.text_body ~* '\mall fares (are )?one[- ]?way\M'
      and m.text_body !~* '\mall fares (are )?round[- ]?trip\M')
  );

-- Reading is personal. One household member opening an email must not clear
-- another member's new-fare badge.
create table if not exists public.flight_deal_reads (
  deal_id uuid not null references public.flight_deals(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seen_at timestamptz not null default now(),
  primary key (deal_id, user_id)
);
alter table public.flight_deal_reads enable row level security;
create policy flight_deal_reads_own on public.flight_deal_reads
  for all to authenticated
  using (user_id = auth.uid() and exists (
    select 1 from public.flight_deals d where d.id = deal_id
      and private.is_family_member(d.family_id)
      and not private.is_secondary_traveler(d.family_id)
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.flight_deals d where d.id = deal_id
      and private.is_family_member(d.family_id)
      and not private.is_secondary_traveler(d.family_id)
  ));
create index if not exists flight_deal_reads_user on public.flight_deal_reads(user_id);

-- One push per source email per browser, never one push for each route.
-- Service-role only; there are deliberately no client policies.
create table if not exists public.fare_arrival_pushes (
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (message_id, subscription_id)
);
alter table public.fare_arrival_pushes enable row level security;
