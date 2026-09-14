-- What a beta tester agreed to, and when, and to which version of it.
--
-- The beta screens ask four things that are not preferences: that this is
-- unfinished software and may lose data, that the person is old enough to
-- accept that on their own behalf, that they have read what the app collects,
-- and -- separately and explicitly -- that what they type may be sent to a
-- third-party AI provider. Apple's guideline 5.1.2(i) wants that last one
-- disclosed and permitted before it happens, not buried in a policy, so it is
-- stored as its own answer with its own timestamp rather than folded into
-- "accepted the terms".
--
-- One row per account, not per acceptance. What matters at any moment is
-- whether this person is currently covered, and a table with four half-answers
-- in it cannot say. The history that a lawyer would actually want -- what
-- changed, when, from what -- lives in beta_consent_events below, which is
-- append-only, so the current row can be rewritten freely without losing the
-- record of what it used to say.
--
-- The version columns are why the gate can be reopened. Reissuing the
-- agreement means bumping AGREEMENT_VERSION in lib/beta/agreement.js; every
-- row still naming the old one stops matching, and those testers walk the
-- screens again. Nothing here has to be deleted to make that happen.
--
-- Not family-scoped, deliberately. Consent is a person's own answer and one
-- household member must not be able to accept on behalf of another -- that is
-- the whole point of asking. family_id rides along so the beta desk can tell
-- which household a tester was in, and is not part of any policy here.

create table if not exists public.beta_consents (
  -- The account, and the primary key.
  user_id uuid primary key references auth.users (id) on delete cascade,

  -- Whose household they were in when they answered. Context, never a
  -- permission.
  family_id uuid references public.families (id) on delete set null,

  -- Which agreement and which privacy policy they were shown. Compared against
  -- the constants in lib/beta/agreement.js on every request; a mismatch sends
  -- them back through the screens.
  agreement_version text not null,
  privacy_version text not null,

  -- The build they accepted on, so a bug report and a consent record can be
  -- lined up against the same software.
  app_build text,

  -- They said they are old enough to agree to this themselves. Stored rather
  -- than assumed: a family app hands accounts to teenagers, and an adult has to
  -- be the one accepting a liability waiver.
  age_confirmed boolean not null default false,

  -- They have read what the app collects and why. Separate from the agreement
  -- because it is a separate screen making a separate claim.
  data_acknowledged boolean not null default false,

  -- The third-party AI answer. False is a real, supported answer -- the app
  -- runs without Aly rather than refusing to open -- which is what makes it a
  -- choice rather than a toll gate.
  ai_processing boolean not null default false,

  -- Who they were told the processor is, in the words they were shown. If the
  -- provider changes, this is the column that proves the old consent was not
  -- consent to the new one.
  ai_provider text,

  -- When the AI answer was last given, which is not when the agreement was
  -- accepted: turning Aly off in Settings six weeks later moves this and leaves
  -- accepted_at alone.
  ai_decided_at timestamptz,

  -- The optional parts they opted into on the way in -- booking email, day
  -- reminders, location, documents, calendar -- keyed by the ids in
  -- lib/beta/agreement.js. Every one of them defaults to off, and the app has a
  -- working shape without each.
  features jsonb not null default '{}'::jsonb,

  -- They were told that what they put in is visible to the rest of their
  -- household, and that entering somebody else's passport or itinerary is a
  -- thing they need that person's say-so for.
  sharing_acknowledged boolean not null default false,

  -- Crash and timing diagnostics. On by default and turn-off-able, because it
  -- is the one collection here that exists for the developer rather than for
  -- the family.
  diagnostics boolean not null default true,

  -- When the agreement was accepted. Never moved by a later change to the
  -- toggles above.
  accepted_at timestamptz not null default now(),

  -- Consent taken back wholesale. Set, and the person is treated as having
  -- never agreed: the gate reopens on their next navigation. Kept as a stamp
  -- rather than a deletion so the record of having once agreed survives.
  withdrawn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.beta_consents is
  'One beta tester''s current consent state. Versions are compared against lib/beta/agreement.js; a mismatch reopens the consent screens. History lives in beta_consent_events.';
comment on column public.beta_consents.ai_processing is
  'Explicit permission for third-party AI processing (Apple App Review 5.1.2(i)). False is supported: Aly is unavailable and the rest of the app works.';
comment on column public.beta_consents.withdrawn_at is
  'Consent taken back. Treated as never agreed, and the screens reopen. Never deleted, so the earlier acceptance stays on the record.';

create index if not exists beta_consents_accepted_idx
  on public.beta_consents (accepted_at desc);

-- The history, append-only.
--
-- Separate table because the two want opposite things: the row above is
-- rewritten every time a toggle moves, and a consent record is worth nothing if
-- it can be rewritten. So every write up there lands a row down here, and
-- nothing -- not the tester, not the app's own key -- has a policy that lets it
-- change or remove one.
create table if not exists public.beta_consent_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,

  -- 'accepted', 'updated', 'withdrawn'. Plain words rather than an enum so a
  -- later kind of change does not need a migration to be recordable.
  action text not null,

  -- The whole consent row as it stood after the change, so a reader never has
  -- to replay every event to know what was true.
  state jsonb not null,

  at timestamptz not null default now()
);

comment on table public.beta_consent_events is
  'Append-only history of consent changes. Written by a trigger on beta_consents; no update or delete policy exists for anybody.';

create index if not exists beta_consent_events_user_idx
  on public.beta_consent_events (user_id, at desc);

create or replace function public.beta_consent_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  insert into public.beta_consent_events (user_id, action, state)
  values (
    new.user_id,
    case
      when new.withdrawn_at is not null
        and (tg_op = 'INSERT' or old.withdrawn_at is null) then 'withdrawn'
      when tg_op = 'INSERT' then 'accepted'
      else 'updated'
    end,
    to_jsonb(new)
  );
  return new;
end;
$$;

drop trigger if exists beta_consent_log_trg on public.beta_consents;
create trigger beta_consent_log_trg
  before insert or update on public.beta_consents
  for each row execute function public.beta_consent_log();

alter table public.beta_consents enable row level security;
alter table public.beta_consent_events enable row level security;

-- Your own answer, and nobody else's, in either direction. No family clause:
-- the primary traveler in a household does not get to read or move the consent
-- of the teenager testing alongside them.
drop policy if exists beta_consents_own_read on public.beta_consents;
create policy beta_consents_own_read on public.beta_consents
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists beta_consents_own_write on public.beta_consents;
create policy beta_consents_own_write on public.beta_consents
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists beta_consents_own_change on public.beta_consents;
create policy beta_consents_own_change on public.beta_consents
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy, on purpose. Erasing an account erases its consent by
-- cascade, which is the only way this row should ever disappear.

-- The tester can read their own history -- that is the receipt screen -- and
-- write nothing. The trigger above inserts as definer, so it is not blocked by
-- the absence of an insert policy.
drop policy if exists beta_consent_events_own_read on public.beta_consent_events;
create policy beta_consent_events_own_read on public.beta_consent_events
  for select to authenticated
  using (user_id = auth.uid());
