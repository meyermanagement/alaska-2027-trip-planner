-- One phone, one subscription row.
--
-- The endpoint a push service hands a browser is rotated periodically and on
-- every reinstall, so upserting on it cannot stop one device from accumulating
-- rows -- and each row means the same fare alert signed and sent again. The
-- browser now keeps an identifier of its own and sends it with the subscription,
-- which is the only claim of "same phone" that can be trusted: two iPhones of
-- the same model and iOS version share a user-agent string exactly.
--
-- Nullable on purpose. Rows written before this column existed have none, and a
-- browser in private mode may refuse to keep one; both must keep working.

alter table public.push_subscriptions
  add column if not exists device_id text;

comment on column public.push_subscriptions.device_id is
  'Identifier the browser keeps for itself, so a rotated endpoint replaces its own row instead of adding one.';

create index if not exists push_subscriptions_device
  on public.push_subscriptions (user_id, device_id);
