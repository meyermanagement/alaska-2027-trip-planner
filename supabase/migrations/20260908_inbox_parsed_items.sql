-- Parsed itinerary rows staged from a forwarded booking confirmation.
--
-- The webhook writes each message and its attachments (see 20260908_inbox.sql).
-- After the row lands, a fire-and-forget call feeds the body plus any
-- extracted attachment text into Gemini with the schema in
-- lib/inbox/parser.js, and the returned items are written here rather than
-- straight into itinerary_items. The primary reviews the staged rows on the
-- /inbox card next to the source message; approving them promotes each row to
-- a real itinerary_items entry on the trip the message is filed to. Rejecting
-- one deletes just that row and leaves the rest.
--
-- Staging rather than direct itinerary writes because a garbled confirmation
-- would otherwise plant confidently-wrong flight numbers into the trip
-- overnight, and undoing that is much worse than approving a small list once.
-- The parser's confidence per item is stored here so the UI can hide the
-- low-confidence guesses behind a "show more" without silently dropping them.

-- Two new columns on the message itself so /inbox knows what state each card
-- is in without joining. parse_status is a small enum; parse_error is only
-- set when parse_status = 'failed' and holds a short human-readable reason.
alter table public.inbox_messages
  add column if not exists parse_status text
    not null
    default 'pending'
    check (parse_status in ('pending', 'running', 'succeeded', 'failed', 'skipped')),
  add column if not exists parse_error text,
  add column if not exists parse_model text,
  add column if not exists parsed_at timestamp with time zone;

comment on column public.inbox_messages.parse_status is
  'Where the extractor is with this message. pending until the fire-and-forget kicks off; running while the model call is in flight; succeeded/failed after; skipped for messages the extractor decided not to run on (empty body, wrong classification, no relevant content).';

-- The staged items. Every row belongs to a message; family_id is denormalized
-- so RLS can join on family_members without traversing inbox_messages.
create table if not exists public.inbox_parsed_items (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,

  -- The same categories itinerary_items accepts. Kept as a check rather than
  -- an FK enum so the two tables stay in lockstep by convention rather than
  -- machinery; if a new category is added to itinerary_items it has to be
  -- added here too, which is the right amount of friction.
  category text not null
    check (category in (
      'flight', 'lodging', 'cruise', 'excursion',
      'dining', 'transport', 'activity', 'note'
    )),

  title text not null,
  location text,
  item_date date,
  end_date date,
  start_time time without time zone,
  confirmation_number text,
  notes text,

  -- Attribution the parser proposed, either from the sender's traveler or
  -- from a passenger-name match against the family's travelers. Null means
  -- the parser could not decide; the primary picks on approval.
  attributed_traveler_id uuid references public.travelers (id) on delete set null,

  -- How sure the parser was, so the UI can group high/medium and quietly
  -- fold low behind a disclosure.
  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),

  -- Which pass produced this row. 'body' = read from the email body;
  -- 'attachment' = read from an attachment's extracted text; 'vision' will
  -- be used by a later commit that adds Gemini-vision fallback for
  -- image-only PDFs. Not restricted by check so the future addition does not
  -- need another migration.
  source text not null default 'body',

  -- Sort order the parser proposed within one message, so a multi-leg
  -- itinerary lands in the order the model wrote it. Not sacred: on approval
  -- the trip's own sort_order takes over.
  sort_order integer not null default 0,

  -- Approval trail. status is what the /inbox card reads; approved_item_id
  -- points at the itinerary_items row created on approve, so re-approving is
  -- a no-op and revoking would have somewhere to look.
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_item_id uuid references public.itinerary_items (id) on delete set null,
  approved_at timestamp with time zone,
  approved_by uuid,

  created_at timestamp with time zone not null default now()
);

create index if not exists inbox_parsed_items_message_idx
  on public.inbox_parsed_items (message_id, sort_order);
create index if not exists inbox_parsed_items_family_pending_idx
  on public.inbox_parsed_items (family_id) where status = 'pending';

alter table public.inbox_parsed_items enable row level security;

-- Read/write is gated on family membership, exactly like inbox_messages.
-- Direct writes come only from server routes running under the user; the
-- webhook and the parser use the admin client, which bypasses RLS.
create policy inbox_parsed_items_select
  on public.inbox_parsed_items for select
  using (public.is_family_member(family_id));

create policy inbox_parsed_items_insert
  on public.inbox_parsed_items for insert
  with check (public.is_family_member(family_id));

create policy inbox_parsed_items_update
  on public.inbox_parsed_items for update
  using (public.is_family_member(family_id))
  with check (public.is_family_member(family_id));

create policy inbox_parsed_items_delete
  on public.inbox_parsed_items for delete
  using (public.is_family_member(family_id));
