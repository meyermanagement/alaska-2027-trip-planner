alter table public.flight_deals add column if not exists award_pricing jsonb;
alter table public.flight_deals alter column price drop not null;
alter table public.flight_deals drop constraint if exists flight_deals_pricing_present;
alter table public.flight_deals add constraint flight_deals_pricing_present
  check (case when award_pricing is null then price is not null
    when jsonb_typeof(award_pricing->'options') = 'array'
      then price is null and jsonb_array_length(award_pricing->'options') > 0
    else false end);
comment on column public.flight_deals.award_pricing is
  'Source-backed award booking options: miles/points plus cash fees and explicit one-way/round-trip basis. Never compare fees alone with a cash fare budget.';
