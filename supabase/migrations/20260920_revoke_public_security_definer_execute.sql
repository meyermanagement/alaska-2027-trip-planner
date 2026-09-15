-- Stage 1B: nothing SECURITY DEFINER is callable by PUBLIC.
--
-- Applied to project iqpuwrmfmdndayphlngp on September 15, 2026, and written down
-- here afterwards so the next environment gets the same database rather than the
-- same intention.
--
-- Twenty-three functions in public run as SECURITY DEFINER, and twenty of them
-- carried the default grant, which is EXECUTE to PUBLIC. On a Supabase project
-- PUBLIC includes anon, and anon is a key shipped in the browser -- so anybody
-- holding it could call them at /rest/v1/rpc/<name>. Two of the twenty-three had
-- already been tightened by hand; the rest had never been thought about.
--
-- Three groups, and each gets a different answer:
--
--   Trigger functions (11) get nothing. Postgres checks EXECUTE when a trigger is
--   created, not when it fires, so the grant bought nothing except a REST endpoint.
--
--   RLS policy helpers (9) get authenticated. A policy is evaluated with the
--   privileges of whoever is querying, so without EXECUTE a signed-in read fails
--   with "permission denied for function" instead of returning their own rows.
--
--   The three RPCs the app calls by name get authenticated: redeem_signup_code
--   and claim_traveler_seat from the auth callback, join_family_with_code from the
--   join screen.
--
-- One of these was not hygiene. sync_trip_dates(uuid) is SECURITY DEFINER, takes
-- a trip id, and checks nothing about the caller, and it was granted to
-- authenticated -- so any signed-in tester could have rewritten the dates on
-- another household's trip through the REST API. It is only ever called from
-- inside two trigger functions, which run as the owner and never consult a grant.

-- 1. Take EXECUTE away from everybody, on all twenty-three.

revoke execute on function public.beta_consent_log() from public, anon, authenticated;
revoke execute on function public.can_access_trip(uuid) from public, anon, authenticated;
revoke execute on function public.can_see_conversation(uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_traveler_seat() from public, anon, authenticated;
revoke execute on function public.day_pack_secondary_may_only_check_off() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_family_member(uuid) from public, anon, authenticated;
revoke execute on function public.is_secondary_traveler(uuid) from public, anon, authenticated;
revoke execute on function public.itinerary_dates_changed() from public, anon, authenticated;
revoke execute on function public.join_family_with_code(text) from public, anon, authenticated;
revoke execute on function public.my_traveler_name(uuid) from public, anon, authenticated;
revoke execute on function public.on_trip(uuid) from public, anon, authenticated;
revoke execute on function public.redeem_signup_code(text) from public, anon, authenticated;
revoke execute on function public.secondary_may_only_check_off() from public, anon, authenticated;
revoke execute on function public.shares_family_with(uuid) from public, anon, authenticated;
revoke execute on function public.stamp_row_actor() from public, anon, authenticated;
revoke execute on function public.sync_trip_dates(uuid) from public, anon, authenticated;
revoke execute on function public.traveler_family(uuid) from public, anon, authenticated;
revoke execute on function public.travelers_keep_a_primary() from public, anon, authenticated;
revoke execute on function public.travelers_no_self_demotion() from public, anon, authenticated;
revoke execute on function public.travelers_secondary_guard() from public, anon, authenticated;
revoke execute on function public.trip_family(uuid) from public, anon, authenticated;
revoke execute on function public.trips_dates_auto_switched_on() from public, anon, authenticated;

-- 2. Hand it back to authenticated only where something calls the function:
--    nine helpers named inside RLS policies, and the three RPCs the app calls.

grant execute on function public.can_access_trip(uuid) to authenticated;
grant execute on function public.can_see_conversation(uuid, text) to authenticated;
grant execute on function public.claim_traveler_seat() to authenticated;
grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_secondary_traveler(uuid) to authenticated;
grant execute on function public.join_family_with_code(text) to authenticated;
grant execute on function public.my_traveler_name(uuid) to authenticated;
grant execute on function public.on_trip(uuid) to authenticated;
grant execute on function public.redeem_signup_code(text) to authenticated;
grant execute on function public.shares_family_with(uuid) to authenticated;
grant execute on function public.traveler_family(uuid) to authenticated;
grant execute on function public.trip_family(uuid) to authenticated;

-- 3. Thirteen policies that were written without a role clause.
--
-- No clause means the policy applies to PUBLIC, which after step 1 means an
-- anonymous request evaluates a helper it no longer has EXECUTE on and comes back
-- with "permission denied for function" instead of an empty result. Restricting
-- them to authenticated puts the role check before the function call, which is
-- where it belonged: none of these tables has anything to say to a caller with no
-- session. Nothing changes for a signed-in member.

alter policy card_offers_family on public.card_offers to authenticated;
alter policy card_offers_no_secondary on public.card_offers to authenticated;
alter policy chat_conversations_read on public.chat_conversations to authenticated;
alter policy chat_conversations_update on public.chat_conversations to authenticated;
alter policy chat_messages_own on public.chat_messages to authenticated;
alter policy chat_messages_shared_read on public.chat_messages to authenticated;
alter policy inbox_parsed_items_delete on public.inbox_parsed_items to authenticated;
alter policy inbox_parsed_items_insert on public.inbox_parsed_items to authenticated;
alter policy inbox_parsed_items_select on public.inbox_parsed_items to authenticated;
alter policy inbox_parsed_items_update on public.inbox_parsed_items to authenticated;
alter policy item_documents_all on public.item_documents to authenticated;
alter policy item_documents_secondary on public.item_documents to authenticated;
alter policy rewards_programs_family on public.rewards_programs to authenticated;

-- Still open after this, deliberately: the nine helpers remain reachable at
-- /rest/v1/rpc/<name> by any signed-in user, because PostgREST exposes every
-- callable function in the public schema and RLS needs them callable. They are
-- read-only booleans about the caller's own membership, so the exposure is
-- probing rather than damage. Closing it properly means moving them to a schema
-- PostgREST does not expose and repointing every policy that names them, which is
-- its own migration.
