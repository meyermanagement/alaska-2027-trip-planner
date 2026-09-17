-- Reading the spending, without pulling it into the app.
--
-- model_usage is one row per model call, which is the right shape to write and
-- the wrong shape to read: a month of a busy beta is tens of thousands of rows,
-- and a screen that asks for all of them to add them up in JavaScript is a screen
-- that gets slower every week it is left alone. The adding up happens here, where
-- the rows already are, and the app receives a few dozen rows instead.
--
-- Three questions, three functions: what each feature spent, what each model
-- spent, and what the whole account spent day by day. All three take the same
-- window in days so the screen's range switch is one argument.
--
-- SECURITY INVOKER, which is the default and is said out loud because it matters:
-- these read a table whose policy is own-rows-only, so a signed-in person calling
-- them sees their own calls and nothing else. The admin screen reaches them with
-- the service key, which is the only way the whole account's spending is visible,
-- and the page behind that key checks the allowlist before it asks.

create or replace function public.model_usage_by_feature(days integer default 30)
returns table (
  feature text,
  calls bigint,
  failed bigint,
  grounded bigint,
  searches bigint,
  prompt_tokens bigint,
  candidates_tokens bigint,
  thoughts_tokens bigint,
  cached_tokens bigint,
  tool_tokens bigint,
  total_tokens bigint,
  ms_median integer,
  models text[]
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    u.feature,
    count(*) as calls,
    count(*) filter (where u.ok is not true) as failed,
    count(*) filter (where u.grounded) as grounded,
    coalesce(sum(u.searches), 0) as searches,
    coalesce(sum(u.prompt_tokens), 0) as prompt_tokens,
    coalesce(sum(u.candidates_tokens), 0) as candidates_tokens,
    coalesce(sum(u.thoughts_tokens), 0) as thoughts_tokens,
    coalesce(sum(u.cached_tokens), 0) as cached_tokens,
    coalesce(sum(u.tool_tokens), 0) as tool_tokens,
    coalesce(sum(u.total_tokens), 0) as total_tokens,
    -- The median rather than the mean, because one 40-second grounded answer
    -- drags an average far enough to stop describing the ordinary call.
    (percentile_cont(0.5) within group (order by u.ms))::integer as ms_median,
    array_agg(distinct u.model order by u.model) as models
  from public.model_usage u
  where u.at >= now() - make_interval(days => greatest(days, 1))
  group by u.feature
  order by total_tokens desc, calls desc;
$$;

create or replace function public.model_usage_by_model(days integer default 30)
returns table (
  model text,
  calls bigint,
  failed bigint,
  total_tokens bigint,
  ms_median integer
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    u.model,
    count(*) as calls,
    count(*) filter (where u.ok is not true) as failed,
    coalesce(sum(u.total_tokens), 0) as total_tokens,
    (percentile_cont(0.5) within group (order by u.ms))::integer as ms_median
  from public.model_usage u
  where u.at >= now() - make_interval(days => greatest(days, 1))
  group by u.model
  order by total_tokens desc, calls desc;
$$;

-- One row per day that had a call. Days with nothing are absent rather than
-- zero-filled: the screen knows the window it asked for and can draw the gaps,
-- and a generated calendar here would be a second definition of "today" living
-- in the database, disagreeing with the app's own on the far side of midnight.
create or replace function public.model_usage_daily(days integer default 30)
returns table (
  day date,
  calls bigint,
  failed bigint,
  total_tokens bigint
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    (u.at at time zone 'America/Chicago')::date as day,
    count(*) as calls,
    count(*) filter (where u.ok is not true) as failed,
    coalesce(sum(u.total_tokens), 0) as total_tokens
  from public.model_usage u
  where u.at >= now() - make_interval(days => greatest(days, 1))
  group by 1
  order by 1;
$$;

-- The window is always "the last N days", so every one of these scans by time
-- first and groups second.
create index if not exists model_usage_at_idx on public.model_usage (at desc);
