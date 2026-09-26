-- PROPOSED, NOT APPLIED. Needs Mark's explicit go-ahead before it runs.
-- Ship with CONSENT_SURFACE_VERSION 2026-10-24: every assistant change is
-- shown to the person and confirmed before it saves (lib/mcp/confirm.js).
update public.assistant_oauth_clients
set purpose_summary = 'Reads your trips, daily plans, packing and day packs (your children''s too), reminders, preferences, budget, wallet, document and pet expiration dates, insurance, bucket list, fare alerts, and past reviews so Claude can answer questions about your travel. It can check off packing, day pack items and reminders; add packing items, reminders and bucket-list places; and create and change trips, itinerary items, wallet programs, packing templates, day packs, budgets, fares, home airports, pet plans and adults'' travel preferences. Before any change saves, you''re shown what it will change and asked to confirm. It can''t delete anything except taking an add-on packing template off a trip when you ask.'
where client_id = 'a53e5071-421c-41e6-a40e-040ae4592331';
