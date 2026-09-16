-- Retention: the ledger the purges write to, and the mark on a stripped message.
--
-- The three retention promises in the privacy policy -- forwarded originals at 30
-- days, conversations with Aly at 90, diagnostics at 90 -- had nothing performing
-- them. A promise nothing performs is worse than no promise, so the jobs land
-- with a record: every pass writes a row here whether it deleted anything or not,
-- because "the purge found nothing old enough" and "the purge never ran" are the
-- two answers that look identical from a chair and mean opposite things.
--
-- Readable by the service role only. Nothing in here belongs to one household --
-- it is counts and cutoffs across all of them -- so no household should be able
-- to read it, and RLS with no policy is how that is said.

create table if not exists public.retention_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null,
  ran_at timestamptz not null default now(),
  -- Everything older than this was in scope on this pass. Stored so a run can be
  -- read back years later without having to guess what "90 days" meant on the day.
  cutoff timestamptz not null,
  scanned integer not null default 0,
  purged integer not null default 0,
  error text,
  detail jsonb not null default '{}'::jsonb,
  source text not null default 'cron'
);

create index if not exists retention_runs_job_ran_at_idx
  on public.retention_runs (job, ran_at desc);

alter table public.retention_runs enable row level security;
-- Deliberately no policies. The service role bypasses RLS; every other caller,
-- including a signed-in household member, gets nothing.

-- The forwarded original, once it is gone.
--
-- The row itself stays: a tester needs to be able to see that a confirmation
-- arrived on the 3rd and was filed onto a trip, and the booking read out of it
-- lives on the trip either way. What goes at 30 days is the stored copy of the
-- mail -- its body, its HTML, and the parse error text, which can quote the mail
-- back. This column is how the app knows the difference between a message whose
-- body was discarded on schedule and one that never had a body at all.
alter table public.inbox_messages
  add column if not exists original_purged_at timestamptz;

comment on column public.inbox_messages.original_purged_at is
  'When the stored original mail (text_body, html_body, parse_error) was discarded by the 30-day retention purge. Null means the original is still held.';
