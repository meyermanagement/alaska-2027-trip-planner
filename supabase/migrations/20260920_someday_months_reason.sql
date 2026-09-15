-- Why those months, kept beside the months themselves.
--
-- The bucket list has always been able to hold twelve ticks and no explanation,
-- which is fine on the day somebody ticks them and useless eighteen months later
-- when a fare turns up in a month that is not ticked. Nobody remembers whether
-- March was left off because of the rain, because of school, or because nobody
-- got round to it, and the difference decides whether the fare is good news.
--
-- So when Aly proposes a window and somebody accepts it, the sentence she gave
-- for it is stored with the ticks, along with the pages she read to say it and the
-- day she said it. A tick with a reason can be argued with; a tick on its own can
-- only be trusted or ignored.
--
-- Nothing here is written unless a person presses the window. The columns are
-- null for every row somebody ticked by hand, and that absence is honest: it means
-- the family decided, not that the app forgot.

alter table someday_places
  -- One line, in Aly's words, for why these months and not the others. Never
  -- shown as the family's own writing: `why` is theirs, this is hers.
  add column if not exists months_reason text,
  -- The pages the grounded answer leaned on, as [{title, url}]. Kept so a tick
  -- made in September can still show what it rested on in March, by which time
  -- the answer may well have moved.
  add column if not exists months_sources jsonb not null default '[]'::jsonb,
  -- The day the reason was given, so a stale season claim can be spotted as
  -- stale rather than read as current.
  add column if not exists months_said_at timestamptz;

comment on column someday_places.months_reason is
  'Why these months, in Aly''s words, stored only when somebody accepted the window she proposed. Null means the family ticked the months themselves.';

comment on column someday_places.months_sources is
  'The pages the grounded season answer leaned on, as [{title, url}].';

comment on column someday_places.months_said_at is
  'When the reason was given, so an aging season claim can be read as aging.';
