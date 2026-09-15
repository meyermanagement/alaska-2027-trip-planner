-- The fast path: something with a deadline, and a way to say so before it passes.
--
-- Everything the app has said until now could wait until seven in the morning. A
-- fare that has to be bought today cannot, and neither can a sign-up bonus whose
-- window shuts on Friday. This migration adds the three tables that let the app
-- interrupt somebody, and only about things that are genuinely running out.
--
-- Two decisions are worth stating.
--
-- The app is not buying a fare feed. Every deadline watched here came off a row
-- the family already put in: the book-by date on a fare somebody pasted, the end
-- date on an offer somebody recorded. Nothing is polled, nothing is scraped, and
-- no price is ever produced by the app itself. That is a licence decision as much
-- as a cost one -- the fare APIs that publish a price either forbid building a
-- watcher on top of them or will not quote a small product at all -- and it keeps
-- the promise on the card: a number the app cannot say where it got is worthless.
--
-- Push, not text messages. A web push costs nothing per message and goes through
-- Apple's and Google's own services; an SMS costs about a cent and would eat a
-- household's whole share of the subscription in a few hundred alerts. The price
-- of push is paid in engineering instead: on an iPhone it only works once the site
-- has been added to the Home Screen, which is why the setup panel says so.

-- Where to send a push, once somebody has agreed to receive one.
--
-- One row per browser, not per person: the same person on a phone and a laptop is
-- two subscriptions, and revoking permission in one of them must not silence the
-- other. The endpoint is the address the push service gave us and is unique on its
-- own, so a browser that re-subscribes lands on the row it already had rather than
-- collecting duplicates that would each deliver the same notification.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid (),
  family_id uuid not null references families (id) on delete cascade,
  -- Who it belongs to, when the app can tell. Nullable because the subscription is
  -- still worth keeping for the household if the traveler row is later removed.
  traveler_id uuid references travelers (id) on delete set null,
  user_id uuid,
  endpoint text not null unique,
  -- The two halves of the browser's public key, base64url as the Push API gives
  -- them. Stored as text because that is the form the sender needs them in.
  p256dh text not null,
  auth text not null,
  -- What asked for it, so a stale row can be recognised in a list.
  label text,
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_error text,
  -- How many sends in a row have failed. A push service answering 404 or 410 means
  -- the subscription is dead and the row is deleted outright; anything else is
  -- counted here so a browser that is merely offline is not thrown away.
  failures integer not null default 0,
  enabled boolean not null default true
);

comment on table push_subscriptions is
  'One row per browser that agreed to receive alerts. Deleted, not disabled, when a push service says the subscription is gone.';

create index if not exists push_subscriptions_family
  on push_subscriptions (family_id, enabled);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_all on push_subscriptions;

create policy push_subscriptions_all on push_subscriptions
  for all
  to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

-- What has already been said, so it is not said twice.
--
-- This is the table that makes the watcher safe to run on any schedule at all. A
-- fare three days from its book-by date is worth one notification, not one every
-- time the job wakes up, and the unique index below is what enforces that rather
-- than a comparison of timestamps that would drift. Each subject can produce one
-- alert per stage: one when the deadline comes into view, one on the last day.
create table if not exists deadline_alerts (
  id uuid primary key default gen_random_uuid (),
  family_id uuid not null references families (id) on delete cascade,
  -- 'fare' or 'offer'. Text rather than an enum so a third kind of deadline does
  -- not need a migration to be watched.
  subject_kind text not null,
  subject_id uuid not null,
  stage text not null check (stage in ('soon', 'last_call')),
  -- The date the alert was about, kept so a deadline that later moves can be
  -- recognised as a different thing to warn about.
  deadline_on date,
  sent_at timestamptz not null default now(),
  -- 'push', 'email', or 'none' when there was nowhere to send it. Recorded even
  -- when nothing was delivered: the family still should not be told twice, and the
  -- gap is worth being able to see.
  channel text not null default 'push',
  detail jsonb,
  constraint deadline_alerts_kind_check
    check (subject_kind in ('fare', 'offer'))
);

comment on table deadline_alerts is
  'One row per warning already given. The unique index is what stops a watcher on any cadence from saying the same thing twice.';

create unique index if not exists deadline_alerts_once
  on deadline_alerts (subject_id, stage, deadline_on);

create index if not exists deadline_alerts_family
  on deadline_alerts (family_id, sent_at desc);

alter table deadline_alerts enable row level security;

drop policy if exists deadline_alerts_read on deadline_alerts;

create policy deadline_alerts_read on deadline_alerts
  for select
  to authenticated
  using (is_family_member (family_id));

-- What happened the last time the watcher ran.
--
-- Deliberately not reminder_runs. That table answers one question -- did this
-- morning's email go out -- and the screen that reads it treats any row for today
-- as evidence that the morning happened. A watcher writing into it would answer
-- that question wrongly every afternoon.
create table if not exists watch_runs (
  id uuid primary key default gen_random_uuid (),
  family_id uuid references families (id) on delete cascade,
  ran_at timestamptz not null default now(),
  source text not null default 'cron',
  -- How many deadlines were in view, how many warnings went out, how many failed.
  considered integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  -- How many fares were retired for having passed their book-by date. Separate
  -- from sent: nobody is told about it, the list just stops lying.
  expired integer not null default 0,
  error text,
  detail jsonb
);

comment on table watch_runs is
  'The deadline watcher''s own ledger. Separate from reminder_runs so an afternoon run cannot be mistaken for the morning email.';

create index if not exists watch_runs_recent on watch_runs (ran_at desc);

alter table watch_runs enable row level security;

drop policy if exists watch_runs_read on watch_runs;

create policy watch_runs_read on watch_runs
  for select
  to authenticated
  using (family_id is null or is_family_member (family_id));

-- A fare whose book-by date has passed is not open, and it is not something the
-- family turned down either. It ran out. Without a state of its own it would sit in
-- the open list at the top of the screen claiming to be a live offer, which is the
-- one thing this feature cannot afford to do.
alter table flight_deals
  drop constraint if exists flight_deals_status_check;

alter table flight_deals
  add constraint flight_deals_status_check
    check (status in ('open', 'dismissed', 'taken', 'expired'));
