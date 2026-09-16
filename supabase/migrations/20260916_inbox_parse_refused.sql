-- A terminal state for a message nobody was allowed to read.
--
-- Until today the forwarded-mail parser had no consent check at all: a test on
-- September 15 watched an email body reach Gemini forty-nine seconds after the
-- tester turned Aly off. The fix asks the household's consent before the first
-- model call, which means there is now a fourth way for a parse to end, and it
-- is not 'failed'.
--
-- The distinction is worth a migration. 'failed' means Aly tried and could not
-- read it, and the /inbox card offers to keep the message on the trip so a person
-- can read it there. 'refused' means the household turned the reading off, the
-- body was never sent anywhere, and the answer is a switch in Settings rather
-- than a retry. Collapsing the two would make a working feature look broken to
-- the family and make a consent refusal invisible to anyone auditing the table.
--
-- 'skipped' is not the right home either: it already means the extractor looked
-- and decided there was nothing to do -- an empty body, a fare newsletter with no
-- fares -- which is a decision about the mail, not about permission.

alter table public.inbox_messages
  drop constraint if exists inbox_messages_parse_status_check;

alter table public.inbox_messages
  add constraint inbox_messages_parse_status_check
  check (
    parse_status in (
      'pending',
      'running',
      'succeeded',
      'failed',
      'skipped',
      'refused'
    )
  );

comment on column public.inbox_messages.parse_status is
  'pending: waiting for the extractor. running: a parse is in flight. succeeded: parsed, items staged. failed: the extractor tried and could not read it; parse_error holds a short reason. skipped: nothing worth staging (empty body, a newsletter with no fares). refused: the household has AI assistance or forwarded-mail reading turned off, so the body was never sent to a model; parse_error holds the sentence shown on the inbox card.';
