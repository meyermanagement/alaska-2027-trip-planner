-- Auto-filed marker on inbox messages.
--
-- When a forwarded booking parses cleanly, points at exactly one of the
-- family's trips by date, and every item comes back with high confidence,
-- the receive path files it and promotes its parsed items without waiting
-- for the primary to click. That is a big win in the common case -- the
-- Delta confirmation for a trip that already exists is filed by the time
-- the person opens /inbox -- but it makes a mistake more expensive, because
-- the mistake landed on the itinerary without anyone in the loop.
--
-- Two columns let the app say "I did this on my own" and "here is the
-- window during which I will let you undo it": auto_filed marks the row so
-- the /inbox card can offer the Undo button, and auto_filed_at bounds the
-- window (24 hours in code, kept out of the schema so the ceiling can
-- change without a migration). filed_by is already recorded on the row and
-- is set to the family's inbox user id in the auto case so the audit trail
-- is honest about who did it.
alter table public.inbox_messages
  add column if not exists auto_filed boolean not null default false,
  add column if not exists auto_filed_at timestamp with time zone;

comment on column public.inbox_messages.auto_filed is
  'True when the message was filed by the receive path rather than by a person clicking File it. Pairs with auto_filed_at to bound an Undo window in the UI.';

-- Partial index for the /inbox banner query, which asks "show me the
-- messages this family auto-filed recently". Very small table in practice
-- and the filter is on a boolean, so the index is cheap and the query
-- avoids the seq scan the alternative would need every render.
create index if not exists inbox_messages_auto_filed_idx
  on public.inbox_messages (family_id, auto_filed_at desc)
  where auto_filed = true;
