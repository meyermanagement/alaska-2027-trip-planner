-- Every change to one of the six answers a trip is made of, kept.
--
-- The six -- where, when, how you get there, where you stay, what you do, how
-- you get around -- live as plain text columns on a trip, and a text column
-- remembers only its latest value. That was fine while the six were only ever a
-- sketch typed once at the start. It stopped being fine as soon as the sketch
-- started being overtaken by the trip itself.
--
-- The case that made this obvious: Portugal Spring 2027 said "One apartment in
-- Lisbon for the whole stay". Then two hotels went onto its days -- Herdade da
-- Malhadinha Nova in the Alentejo, then Vila Vita Parc in the Algarve -- and the
-- card carried on saying the apartment. Not an apartment, not Lisbon, not the
-- whole stay, and two places rather than one. Every word of it wrong, held up as
-- the current answer.
--
-- Overwriting it silently would have been worse. "One apartment in Lisbon" is a
-- real thing the family wanted, and the reason they wanted it survives being
-- outvoted by two hotels: it says they would rather not move, and they moved
-- anyway. That is worth being able to read back. So a change to one of the six
-- keeps what it replaced, and the draft screen can show the old answer struck
-- through under the new one instead of pretending the family never said it.
--
-- Deliberately not a general audit log. Six named fields on one table, written
-- where those fields are written, read by one screen. A trip's whole history is
-- a different and much larger idea, and this is not a down payment on it.

create table if not exists public.trip_basic_history (
  id uuid primary key default gen_random_uuid (),
  trip_id uuid not null references public.trips (id) on delete cascade,
  -- One of the six ids from lib/trips/basics.js: where, when, getting_there,
  -- staying, doing, getting_around. Text rather than an enum so adding a
  -- seventh question does not need a migration.
  basic text not null,
  -- What it said before, and what it says now. The old value is the point of
  -- the row; the new one is kept beside it so a history reads as a sequence of
  -- changes rather than a list of discarded strings needing the next row to
  -- make sense of it.
  previous_value text,
  new_value text,
  -- Who, when it was a person rather than a backfill. Null is honest for a
  -- change nobody can be attributed for.
  changed_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists trip_basic_history_trip_idx
  on public.trip_basic_history (trip_id, created_at desc);

comment on table public.trip_basic_history is
  'Every change to one of the six answers a trip is made of, so a draft can show what an answer replaced rather than only its latest value.';

alter table public.trip_basic_history enable row level security;

drop policy if exists trip_basic_history_family on public.trip_basic_history;
create policy trip_basic_history_family on public.trip_basic_history for all to authenticated
  using (
    exists (
      select 1
      from public.trips tr
      join public.family_members fm on fm.family_id = tr.family_id
      where tr.id = trip_basic_history.trip_id
        and fm.user_id = auth.uid ()
    )
  )
  with check (
    exists (
      select 1
      from public.trips tr
      join public.family_members fm on fm.family_id = tr.family_id
      where tr.id = trip_basic_history.trip_id
        and fm.user_id = auth.uid ()
    )
  );
