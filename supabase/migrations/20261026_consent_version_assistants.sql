-- Consent version 2026-09-26: the privacy policy adds "Assistants you connect".
--
-- Every consent check in the database reads this one function (see
-- 20261018_consent_version_luna.sql), so this is the whole database side of the
-- bump. It ships with lib/beta/agreement.js moving AGREEMENT_VERSION and
-- PRIVACY_VERSION to the same date.
--
-- Transition: until an account re-accepts, adult invitations, the parent-opened
-- trip view, parent key recovery and minor review treat its consent as not
-- current, as the app's own gate does. Apply right after the deploy is live.

create or replace function private.beta_consent_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-09-26'::text $$;
