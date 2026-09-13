-- The three text sizes moved down a rung. What the app first shipped at is now
-- called Small, the step above it is Regular and is what the app opens at, and
-- the step above that is Large. The ids change with the names, so every saved
-- row is moved down the same rung: a person reading at the old "large" keeps the
-- exact same words at the same pixels, now spelled "regular".
alter table public.profiles drop constraint if exists profiles_text_size_check;

update public.profiles
set text_size = case text_size
  when 'largest' then 'large'
  when 'large' then 'regular'
  when 'regular' then 'small'
  else 'regular'
end;

alter table public.profiles alter column text_size set default 'regular';

alter table public.profiles
  add constraint profiles_text_size_check
  check (text_size in ('small', 'regular', 'large'));
