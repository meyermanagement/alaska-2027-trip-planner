-- About Me: what somebody is actually like on a trip, in their own words.
--
-- Everything else the app knows about a person is a fact -- a birthday, a
-- passport, a carrier, a mobility aid -- and facts make the advice correct
-- without making it theirs. Two families with identical facts get identical
-- recommendations, which is the failure mode of every travel app there is. This
-- column is the one place somebody says what they are like: sunsets and a book
-- on a beach, or zip lines and something they have never seen before. It is what
-- lets the advice be specific on the first day, before a trip is booked or a
-- single preference has been ticked.
--
-- Deliberately one free-text column rather than a table of tagged traits. The
-- reader is a language model, and a paragraph in somebody's own voice carries
-- more than a list of checkboxes would -- including the things nobody thought to
-- make a checkbox for. It sits on travelers rather than on the family because
-- two people on the same trip want different afternoons.
--
-- There is a separate `notes` column already, and it stays: notes are for
-- whoever is booking ("aisle seat, no shellfish"), and this is for whoever is
-- advising. Keeping them apart means a dietary note does not turn into a
-- personality, and a love of hiking does not turn up in a hotel request.

alter table travelers
  add column if not exists about_me text;

comment on column travelers.about_me is
  'What this person is like on a trip, in their own words. Read by Aly and by the pro tips briefs. Not a booking note -- see travelers.notes for those.';

-- Your own paragraph is yours to write.
--
-- A secondary traveler cannot touch the travelers table at all today, which is
-- right for every other column on it: they should not be renaming people,
-- changing an email that grants sign-in, or editing somebody else's passport
-- facts. But About Me is the one field whose whole value comes from the person
-- describing themselves, and a new secondary is exactly the first-time user this
-- was built for. So the blanket refusal on UPDATE gains one hole -- their own
-- row, matched on user_id -- and a column guard closes everything else in it.
--
-- The guard is the same shape as packing_secondary_guard and tasks_secondary_guard:
-- the policy decides which rows, the trigger decides which columns, and neither
-- is trusted to do the other's job. Written as a whitelist of the one column that
-- may change rather than a blacklist of the rest, so a column added next year is
-- refused by default instead of quietly becoming writable.
drop policy if exists travelers_secondary_update on travelers;
create policy travelers_secondary_update on travelers
  as restrictive
  for update
  to authenticated
  using (
    not is_secondary_traveler(family_id)
    or user_id = auth.uid()
  )
  with check (
    not is_secondary_traveler(family_id)
    or user_id = auth.uid()
  );

create or replace function travelers_secondary_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_secondary_traveler(new.family_id) then
    return new;
  end if;

  -- Their own row is the only one the policy let through, but a trigger that
  -- assumes that is a trigger that breaks the day the policy changes.
  if old.user_id is distinct from auth.uid() then
    raise exception 'A secondary traveler can only edit their own About Me.'
      using errcode = '42501';
  end if;

  -- Every column except the one, compared as a whole rather than named one at a
  -- time. A list of columns is a list that goes stale: the day somebody adds a
  -- column to travelers, a blacklist quietly makes it writable by a secondary and
  -- nobody notices. Subtracting about_me from both rows and comparing what is
  -- left says "this and nothing else" once, permanently.
  if to_jsonb(new) - 'about_me' is distinct from to_jsonb(old) - 'about_me' then
    raise exception 'A secondary traveler can only change their own About Me.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists travelers_secondary_guard on travelers;
create trigger travelers_secondary_guard
  before update on travelers
  for each row
  execute function travelers_secondary_guard();
