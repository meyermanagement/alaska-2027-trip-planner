-- APPLIED 2026-09-25 with Mark's go-ahead.
-- Updates the purpose line Claude's consent screen shows, to match the
-- household-context tools. Ship together with CONSENT_SURFACE_VERSION
-- 2026-10-22, which asks everyone who already allowed Claude to allow it again.
update public.assistant_oauth_clients
set purpose_summary = 'Reads your trips, daily plans, packing and day packs, reminders, preferences, budget, wallet, document and pet expiration dates, insurance, bucket list, fare alerts, and past reviews so Claude can answer questions about your travel. It can''t change anything.'
where client_id = 'a53e5071-421c-41e6-a40e-040ae4592331';
