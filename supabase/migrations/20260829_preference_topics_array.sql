-- A preference can be about more than one thing.
--
-- The single free-text `topic` column forced a choice the data does not support:
-- "Prefer hotel has a spa or massage services" is about where we stay and about
-- what we do, and typing "Accommodations and Activities" to say so created a
-- heading of one sitting beside a heading of five that meant the same thing. So
-- topics become a list.
--
-- `topic` is deliberately kept and kept in step with the first entry, rather than
-- dropped. Several readers still print it — the packing generator, the tips brief,
-- the wallet, Aly's context — and a migration that breaks four callers to save one
-- column is not a tidy-up. Everything new reads `topics`.
--
-- The backfill splits on the words that were being used to cram two topics into
-- one field: " and ", "&", ",", "/". That is an edit to what somebody typed, and
-- the only one here: no spelling is corrected, nothing is merged, nothing is
-- renamed. "Restaurans" stays misspelled until a person presses the button.

alter table travel_preferences
  add column if not exists topics text[] not null default '{}';

-- Split the existing free text into its parts, trimmed, blanks dropped, and
-- de-duplicated case-insensitively while keeping the spelling as written and the
-- order it was typed in.
update travel_preferences
set topics = coalesce(
  (
    select array_agg(distinct_part order by first_seen)
    from (
      select
        min(ordinality) as first_seen,
        (array_agg(part order by ordinality))[1] as distinct_part
      from (
        select btrim(raw) as part, ordinality
        from regexp_split_to_table(
               coalesce(topic, ''),
               '\s+and\s+|\s*&\s*|\s*,\s*|\s*/\s*'
             ) with ordinality as t(raw, ordinality)
      ) as parts
      where part <> ''
      group by lower(part)
    ) as unique_parts
  ),
  '{}'
)
where topics = '{}';

-- Reading "give me every preference tagged Food" without a sequential scan.
create index if not exists travel_preferences_topics_idx
  on travel_preferences using gin (topics);

comment on column travel_preferences.topics is
  'Every topic this preference belongs to, as typed. The first entry is mirrored into the legacy `topic` column.';
