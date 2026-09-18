-- Presentation preference only. Keep the tip active on its trip/wallet.
-- Existing family RLS and secondary-traveler write restrictions still apply.
alter table public.pro_tips
  add column if not exists header_hidden_at timestamptz;
comment on column public.pro_tips.header_hidden_at is
  'Hidden from household header notices only; does not resolve the tip.';
