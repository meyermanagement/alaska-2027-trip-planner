-- How big a person wants the words, kept beside the skin they chose.
--
-- The app's type is one ladder of eight steps multiplied by --text-scale, and
-- this column decides which of three values that multiplier takes: see
-- lib/textsize.js and the html[data-text] blocks in globals.css. It is a
-- preference and nothing else -- nothing is granted or refused on the strength
-- of it -- which is why middleware is allowed to cache it in a readable cookie
-- for the script that runs before the first paint.
--
-- Defaulted to regular rather than left null so a row read by middleware answers
-- the question instead of leaving it to a fallback, and checked against the same
-- three names the module knows so a typo in a future caller fails at the write
-- rather than quietly painting the default.
alter table public.profiles
  add column if not exists text_size text not null default 'regular';

alter table public.profiles
  drop constraint if exists profiles_text_size_check;

alter table public.profiles
  add constraint profiles_text_size_check
  check (text_size in ('regular', 'large', 'largest'));
