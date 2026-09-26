-- PROPOSED, NOT APPLIED. Needs Mark's explicit go-ahead before it runs.
-- Ship with CONSENT_SURFACE_VERSION 2026-10-23 (child packing for parents,
-- the packing, day pack and reminder check-offs, and adding packing items,
-- reminders and bucket-list places).
update public.assistant_oauth_clients
set purpose_summary = 'Reads your trips, daily plans, packing and day packs (your children''s too), reminders, preferences, budget, wallet, document and pet expiration dates, insurance, bucket list, fare alerts, and past reviews so Claude can answer questions about your travel. It can check off packing, day pack items and reminders, and add packing items, reminders and bucket-list places. It can''t delete or reword anything, or change your itinerary, budget or preferences.'
where client_id = 'a53e5071-421c-41e6-a40e-040ae4592331';
