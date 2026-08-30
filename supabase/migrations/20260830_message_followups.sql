-- The next questions Aly offered with an answer, kept with the answer.
--
-- Without this, reopening a conversation tomorrow shows what she said and none of
-- the ways on from it -- the same reason the place cards are stored on the row.
alter table public.chat_messages
  add column if not exists followups jsonb;

comment on column public.chat_messages.followups is
  'Short questions offered under an assistant reply, as a JSON array of strings. Questions only; pressing one sends a message and saves nothing.';
