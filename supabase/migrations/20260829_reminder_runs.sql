-- A record of every morning run, whether or not it sent anything.
--
-- The reason this exists: on the morning of 29 August a task was due, the server
-- had every setting it needed, and no email arrived. There was no way to tell
-- which of two completely different things had happened -- the scheduler never
-- called us, or it called us and Gmail refused the send -- because the only trace
-- a run left behind was a row in task_reminder_emails, and that row is
-- deliberately deleted again when a send fails so tomorrow will retry it. A
-- failed morning and a morning that never happened looked identical: an empty
-- table.
--
-- So the run itself gets a row, written whatever the outcome. Nobody has to read
-- a log or hold a secret to find out what happened at seven o'clock; the app can
-- say so on its own screen. One row per invocation rather than one per day: two
-- runs in a morning is a fact worth being able to see, and a unique constraint on
-- the date would have hidden the second one.

create table if not exists reminder_runs (
  id uuid primary key default gen_random_uuid(),
  -- Nullable, because a run that fell over before it read anything still needs
  -- recording, and at that point we may not know whose family it was for.
  family_id uuid references families (id) on delete cascade,
  -- The date the run was reasoning about, in the household's own zone -- not the
  -- server's idea of the date, which is what makes a 7am run look like the day
  -- before to anybody reading in UTC.
  ran_for date not null,
  ran_at timestamptz not null default now(),
  -- 'cron' is the scheduler. 'test' is somebody pressing the button on the
  -- Family tab, which sends the same email to themselves and is the fastest way
  -- to find out whether the mailer works at all.
  source text not null default 'cron',
  -- How many people the rules said had work due, how many were emailed, how many
  -- refused. considered is the one that separates "nothing to say" from "could
  -- not say it".
  considered integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  -- The first refusal, in the mailer's own words. This is the field that would
  -- have answered the question in one look.
  error text,
  -- Who was emailed and who was not, for a run somebody wants to read closely.
  detail jsonb,
  constraint reminder_runs_source_check
    check (source in ('cron', 'test'))
);

comment on table reminder_runs is
  'One row per morning-reminder run, written whatever the outcome, so a silent morning can be told apart from a morning that never happened.';

create index if not exists reminder_runs_ran_at_idx
  on reminder_runs (ran_at desc);

alter table reminder_runs enable row level security;

-- Anybody in the household may read their own runs: this is the evidence behind
-- a line on the Reminders page saying whether this morning's email went out, and
-- a person who is waiting for an email is entitled to know it was not sent.
-- Nobody may write one from a browser -- the rows come from the route, which
-- either holds the scheduler's secret or is acting for the person pressing the
-- test button, and in the second case it writes with the service key rather than
-- the visitor's own so a run cannot be forged into existence.
drop policy if exists reminder_runs_read on reminder_runs;
create policy reminder_runs_read on reminder_runs
  for select
  to authenticated
  using (family_id is null or is_family_member(family_id));
