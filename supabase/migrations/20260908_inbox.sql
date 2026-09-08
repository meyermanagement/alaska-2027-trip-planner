-- The inbox that catches booking confirmations forwarded to the family.
--
-- With alyeska.app registered, every family gets an address of the form
-- <slug>@trips.alyeska.app that Postmark catches and POSTs to the app's own
-- webhook. The mail lands in one place -- this table -- and the family reads
-- it from the /inbox screen, decides which trip each message belongs to, and
-- files it. The parse into itinerary_items is a follow-up commit; this
-- migration only covers the plumbing that gets the mail to the door.
--
-- The address itself is a short opaque slug rather than a family name. Names
-- collide (a second Meyer family will join eventually) and losing your inbox
-- to a naming clash is the kind of thing a household product must never do.
-- Six base32 characters give a billion combinations and are short enough to
-- type from memory once saved to contacts. The slug is generated at family
-- creation, not chosen -- a friendly alias on top of it is a follow-up.

-- 1. The address itself, hung off the family it belongs to.
--
-- Unique across every family, ever. Case-insensitive at the database level so
-- MEYER123 and meyer123 cannot both exist -- the webhook lowercases before it
-- looks anyone up. Backfilled below for the one family that already exists.
alter table public.families
  add column if not exists inbox_local_part text;

comment on column public.families.inbox_local_part is
  'The local part of the family''s forwarding address at trips.alyeska.app. A short opaque slug generated at family creation. Unique across the app, case-insensitive.';

create unique index if not exists families_inbox_local_part_key
  on public.families (lower(inbox_local_part));

-- Backfill anybody who was created before this column existed. The generator
-- lives in the application code, so this migration only needs to guarantee
-- every existing row gets a value that satisfies the unique index. It uses
-- the same 6-character base32 alphabet the app helper uses.
do $$
declare
  r record;
  candidate text;
  alphabet text := 'abcdefghjkmnpqrstuvwxyz23456789';  -- 31 chars, no 0/1/i/l/o
  n integer;
  attempts integer;
begin
  for r in select id from public.families where inbox_local_part is null loop
    attempts := 0;
    loop
      candidate := '';
      for n in 1..6 loop
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      begin
        update public.families set inbox_local_part = candidate where id = r.id;
        exit;
      exception when unique_violation then
        attempts := attempts + 1;
        if attempts > 20 then
          raise exception 'Could not generate a unique inbox_local_part after 20 attempts';
        end if;
      end;
    end loop;
  end loop;
end$$;

-- The column is meant to be always-present from here on. Making it NOT NULL
-- now, after the backfill, keeps future family creations honest.
alter table public.families
  alter column inbox_local_part set not null;

-- 2. Known-good forwarders.
--
-- Almost nobody forwards from the same email they sign in with. Mark signs in
-- with a personal Gmail; the hotel confirmation he wants to forward arrived
-- at his work Outlook. Without an escape valve, every such message would
-- quarantine and the feature would feel broken.
--
-- Each row links one sender address to one traveler on the family, so a
-- message arriving from that address inherits that traveler's attribution.
-- Added_by is the primary who trusted the address; the timestamp is when.
create table if not exists public.family_forwarders (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  email text not null,
  traveler_id uuid not null references public.travelers (id) on delete cascade,
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

comment on table public.family_forwarders is
  'Extra sender addresses the family has decided belong to one of their travelers. A message from an address on this list is attributed to that traveler.';

-- The same address can only be trusted once per family; a second attempt to
-- add it should update the traveler_id it links to, not double-write.
create unique index if not exists family_forwarders_family_email_key
  on public.family_forwarders (family_id, lower(email));

create index if not exists family_forwarders_traveler_idx
  on public.family_forwarders (traveler_id);

alter table public.family_forwarders enable row level security;

drop policy if exists family_forwarders_all on public.family_forwarders;
create policy family_forwarders_all on public.family_forwarders
  for all
  to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

-- 3. The mail itself.
--
-- One row per received message. Written by the webhook under the service role,
-- read by the family through RLS. Attachments hang off the row below.
--
-- classification is the webhook's guess at who sent it, made once at write
-- time so the inbox screen does not have to recompute it on every render:
--   traveler   -- sender email matches a person on the family
--   forwarder  -- sender email is on family_forwarders
--   unknown    -- neither; the primary has to attribute it before filing
-- attributed_traveler_id is set on traveler/forwarder classifications and
-- null on unknown; the /inbox screen fills it in when the primary chooses.
--
-- status is where the message is in its life:
--   pending    -- new, in the inbox, awaiting a decision
--   filed      -- the primary picked a trip; the message is attached there
--   deleted    -- the primary threw it out; the row stays for audit and the
--                 storage bytes are removed. Not surfaced anywhere.
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,

  -- What Postmark handed us. Kept even after filing so the message can be
  -- re-parsed later without going back to the mail provider.
  postmark_message_id text,
  received_at timestamptz not null default now(),
  from_email text not null,
  from_name text,
  subject text,
  text_body text,
  html_body text,

  -- The webhook's classification.
  classification text not null check (classification in ('traveler', 'forwarder', 'unknown')),
  attributed_traveler_id uuid references public.travelers (id) on delete set null,

  -- Where the message is in its life.
  status text not null default 'pending' check (status in ('pending', 'filed', 'deleted')),
  filed_trip_id uuid references public.trips (id) on delete set null,
  filed_at timestamptz,
  filed_by uuid references auth.users (id)
);

comment on table public.inbox_messages is
  'Booking confirmations forwarded to the family''s trips.alyeska.app address. Written by /api/inbox/receive under the service role and read by the family through RLS.';

create index if not exists inbox_messages_family_status_idx
  on public.inbox_messages (family_id, status, received_at desc);

create index if not exists inbox_messages_filed_trip_idx
  on public.inbox_messages (filed_trip_id) where filed_trip_id is not null;

-- Postmark message ids are opaque to us, but writing the same message twice
-- because Postmark retried the webhook would double-count the inbox. Unique
-- when present, freely null otherwise.
create unique index if not exists inbox_messages_postmark_key
  on public.inbox_messages (postmark_message_id) where postmark_message_id is not null;

alter table public.inbox_messages enable row level security;

-- Readable by anybody in the family. Writes go through the webhook (service
-- role, bypassing RLS) or through /api/inbox/* server routes -- either way,
-- clients never mutate this table directly, so no INSERT policy for anon
-- clients exists. UPDATE and DELETE are available to family members through
-- the routes that back the inbox UI's actions.
drop policy if exists inbox_messages_select on public.inbox_messages;
create policy inbox_messages_select on public.inbox_messages
  for select
  to authenticated
  using (is_family_member (family_id));

drop policy if exists inbox_messages_update on public.inbox_messages;
create policy inbox_messages_update on public.inbox_messages
  for update
  to authenticated
  using (is_family_member (family_id))
  with check (is_family_member (family_id));

drop policy if exists inbox_messages_delete on public.inbox_messages;
create policy inbox_messages_delete on public.inbox_messages
  for delete
  to authenticated
  using (is_family_member (family_id));

-- 4. Attachments.
--
-- Airline and hotel confirmations often ship the actual truth in a PDF
-- attachment; the email body is a summary. Attachments live in the existing
-- documents bucket under the family's namespace with an 'inbox' scope, so
-- the storage RLS the app already has continues to apply.
create table if not exists public.inbox_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  original_filename text,
  created_at timestamptz not null default now()
);

comment on table public.inbox_attachments is
  'Files attached to an inbox_messages row, stored in the documents bucket under <family_id>/inbox/<message_id>/.';

create index if not exists inbox_attachments_message_idx
  on public.inbox_attachments (message_id);

alter table public.inbox_attachments enable row level security;

drop policy if exists inbox_attachments_select on public.inbox_attachments;
create policy inbox_attachments_select on public.inbox_attachments
  for select
  to authenticated
  using (is_family_member (family_id));

drop policy if exists inbox_attachments_delete on public.inbox_attachments;
create policy inbox_attachments_delete on public.inbox_attachments
  for delete
  to authenticated
  using (is_family_member (family_id));
