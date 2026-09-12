-- The beta survey: one sheet per tester, editable for as long as the beta runs.
--
-- One row per person, not per submission. A tester opens this the week they
-- start, answers what they have an opinion about, and comes back after their
-- first real trip to change the price they named and rate the parts they had
-- not opened yet. Versioning that would mean the desk had to decide which of
-- four half-finished sheets was the person's actual view, and the answer is
-- always the newest one -- so the newest one is the only one kept.
--
-- Answers live in a single jsonb object keyed by question id rather than a row
-- per answer. The questions are defined in lib/beta/survey.js, which is also
-- what validates a write, so this column holds no key that file does not know.
-- Nothing here is ever queried by one question across everybody without also
-- wanting the rest of that person's answers for context, so a row per answer
-- would buy a join and no query.
--
-- Not family-scoped. A survey answer is one person's opinion and Steph should
-- not read Mark's before writing her own -- that is how a household of three
-- testers becomes one opinion agreed at the kitchen table. family_id rides
-- along so the desk can tell whether two sheets came from the same house, and
-- is deliberately not part of any policy here.

create table if not exists public.beta_survey_responses (
  -- The account, and the primary key. One person, one sheet.
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Whose household they were in when they answered. Context for reading the
  -- replies, never a permission: see the policies below, which are about the
  -- account and nothing else.
  family_id uuid references public.families (id) on delete set null,

  -- Question id to answer. Scales are integers 1 to 5 or the string 'not-used';
  -- choices are the option's own words; prices and free writing are text.
  answers jsonb not null default '{}'::jsonb,

  -- When they said they were done. Null means still being written, which is a
  -- normal and permanent state for somebody who keeps editing -- so it marks a
  -- sheet as worth reading rather than closing it. Answers stay editable after
  -- it is set, and a later edit does not clear it.
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.beta_survey_responses is
  'One beta tester''s survey answers, edited in place for the length of the beta. Questions and validation live in lib/beta/survey.js.';
comment on column public.beta_survey_responses.answers is
  'Question id to answer. Written only through /api/beta/survey, which drops any key the question file does not know.';
comment on column public.beta_survey_responses.submitted_at is
  'When the tester said they were done. Answers remain editable afterwards; a later edit leaves this set.';

-- The desk reads every sheet newest-first, and that is the only listing query
-- there is.
create index if not exists beta_survey_responses_updated_idx
  on public.beta_survey_responses (updated_at desc);

alter table public.beta_survey_responses enable row level security;

-- Your own sheet, and nobody else's, in either direction. No family clause and
-- no secondary-traveler clause: a teenager testing the app has opinions about
-- it, and the one row they are allowed to touch is their own.
--
-- The beta desk does not use these policies at all. It reads with the
-- service-role key, the way it reads codes and usage events, because a survey is
-- exactly the kind of thing a person should be able to write frankly without
-- another signed-in account being able to list it.
drop policy if exists beta_survey_own_read on public.beta_survey_responses;
create policy beta_survey_own_read on public.beta_survey_responses
  for select to authenticated
  using (user_id = auth.uid ());

drop policy if exists beta_survey_own_write on public.beta_survey_responses;
create policy beta_survey_own_write on public.beta_survey_responses
  for all to authenticated
  using (user_id = auth.uid ())
  with check (user_id = auth.uid ());
