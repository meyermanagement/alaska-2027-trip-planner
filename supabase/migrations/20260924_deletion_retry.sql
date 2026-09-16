-- A deletion that failed halfway needs somewhere to say so.
--
-- On September 15 the first real deletion attempt failed and the receipt sat in
-- deletion_requests with a null completed_at. Nothing read that row again, so
-- nobody except the tester watching the screen would ever have known -- and the
-- promise is that the data is gone within 30 days, which cannot survive a failure
-- nobody sees. The retry needs three things this adds: how many times it has been
-- tried, when it was last tried, and whether anybody has been told.

alter table public.deletion_requests
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists alerted_at timestamptz;

comment on column public.deletion_requests.attempts is
  'How many times the deletion has been run for this request, including the first. The retry job increments it.';
comment on column public.deletion_requests.last_attempt_at is
  'When the deletion was last attempted. The retry job leaves a row alone for an hour after its last attempt.';
comment on column public.deletion_requests.alerted_at is
  'When somebody was emailed about this request failing repeatedly. Set once, so a stuck row does not send a message every night.';

-- The first attempt is the route's own run, so rows written before this migration
-- have had exactly one.
update public.deletion_requests
  set attempts = 1, last_attempt_at = coalesce(completed_at, requested_at)
  where attempts = 0;

create index if not exists deletion_requests_open_idx
  on public.deletion_requests (requested_at)
  where completed_at is null;
