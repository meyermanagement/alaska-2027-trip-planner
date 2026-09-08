-- Auto-generate families.inbox_local_part on insert.
--
-- The initial inbox migration backfilled every existing families row with a
-- unique slug, but that was a one-shot loop. Going forward, a families row
-- created without a slug (which is every insert, since the app never picks
-- the slug) needs one filled in before the row lands, or the NOT NULL
-- constraint would refuse the insert.
--
-- The trigger runs BEFORE INSERT and fills the column with a fresh 6-char
-- base32 slug from the same alphabet the backfill used, retrying on the
-- (statistically unlikely) collision. It gives up after 20 attempts so a
-- runaway loop cannot lock the insert forever.

create or replace function public.families_fill_inbox_local_part()
returns trigger
language plpgsql
as $$
declare
  candidate text;
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';
  n integer;
  attempts integer := 0;
  ok boolean := false;
begin
  if new.inbox_local_part is not null then
    return new;
  end if;

  while attempts < 20 and not ok loop
    candidate := '';
    for n in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;

    if not exists (
      select 1 from public.families where lower(inbox_local_part) = lower(candidate)
    ) then
      new.inbox_local_part := candidate;
      ok := true;
    end if;

    attempts := attempts + 1;
  end loop;

  if not ok then
    raise exception 'Could not generate a unique inbox_local_part after 20 attempts';
  end if;

  return new;
end$$;

drop trigger if exists families_inbox_local_part_bi on public.families;
create trigger families_inbox_local_part_bi
before insert on public.families
for each row
execute function public.families_fill_inbox_local_part();
