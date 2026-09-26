-- Make the secondary-traveler rules on eight tables restrictive, as intended.
--
-- Each of these was written as a pair: a permissive "family member" policy and
-- a second policy meant to narrow it for secondary travelers. The second one
-- was created without `as restrictive`, so Postgres ORed it with the first
-- instead of ANDing it. `not is_secondary_traveler(family_id)` is true for any
-- signed-in account that is not a secondary traveler in that family, which
-- includes accounts in other households. The effect was that any signed-in
-- adult could read and write these rows in every household.
--
-- Verified read-only before this migration, as an invented account that
-- belongs to no household: 64 flight_deals, 9 home_airports, 22
-- someday_places, 3 house_tasks, 4 household_facts, 11 traveler_slots and 6
-- card_offers were visible, and 0 trips (the control).
--
-- Same expressions, now restrictive. The family policies still grant access;
-- these only take it away. Also closes secondary writes on favorite_moments
-- and trip_templates, which the app and the assistant already refuse.

begin;

drop policy if exists flight_deals_secondary_all on public.flight_deals;
create policy flight_deals_secondary_all on public.flight_deals
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

drop policy if exists home_airports_secondary_all on public.home_airports;
create policy home_airports_secondary_all on public.home_airports
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

drop policy if exists someday_places_secondary_all on public.someday_places;
create policy someday_places_secondary_all on public.someday_places
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

drop policy if exists house_tasks_secondary_all on public.house_tasks;
create policy house_tasks_secondary_all on public.house_tasks
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

drop policy if exists household_facts_secondary_all on public.household_facts;
create policy household_facts_secondary_all on public.household_facts
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

drop policy if exists traveler_slots_secondary_all on public.traveler_slots;
create policy traveler_slots_secondary_all on public.traveler_slots
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

drop policy if exists card_offers_no_secondary on public.card_offers;
create policy card_offers_no_secondary on public.card_offers
  as restrictive for all to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));

-- A secondary traveler opens the documents on a trip they are on, and nothing
-- else. Same expression as before, now narrowing item_documents_all.
drop policy if exists item_documents_secondary on public.item_documents;
create policy item_documents_secondary on public.item_documents
  as restrictive for all to authenticated
  using (
    not private.is_secondary_traveler(private.trip_family((select ii.trip_id from public.itinerary_items ii where ii.id = item_documents.itinerary_item_id)))
    or private.on_trip((select ii.trip_id from public.itinerary_items ii where ii.id = item_documents.itinerary_item_id))
  )
  with check (
    not private.is_secondary_traveler(private.trip_family((select ii.trip_id from public.itinerary_items ii where ii.id = item_documents.itinerary_item_id)))
    or private.on_trip((select ii.trip_id from public.itinerary_items ii where ii.id = item_documents.itinerary_item_id))
  );

-- Secondary travelers read moments and a trip's templates; they do not write them.
drop policy if exists favorite_moments_secondary_insert on public.favorite_moments;
create policy favorite_moments_secondary_insert on public.favorite_moments
  as restrictive for insert to authenticated
  with check (not private.is_secondary_traveler(family_id));
drop policy if exists favorite_moments_secondary_update on public.favorite_moments;
create policy favorite_moments_secondary_update on public.favorite_moments
  as restrictive for update to authenticated
  using (not private.is_secondary_traveler(family_id))
  with check (not private.is_secondary_traveler(family_id));
drop policy if exists favorite_moments_secondary_delete on public.favorite_moments;
create policy favorite_moments_secondary_delete on public.favorite_moments
  as restrictive for delete to authenticated
  using (not private.is_secondary_traveler(family_id));

drop policy if exists trip_templates_secondary_insert on public.trip_templates;
create policy trip_templates_secondary_insert on public.trip_templates
  as restrictive for insert to authenticated
  with check (not private.is_secondary_traveler(private.trip_family(trip_id)));
drop policy if exists trip_templates_secondary_update on public.trip_templates;
create policy trip_templates_secondary_update on public.trip_templates
  as restrictive for update to authenticated
  using (not private.is_secondary_traveler(private.trip_family(trip_id)))
  with check (not private.is_secondary_traveler(private.trip_family(trip_id)));
drop policy if exists trip_templates_secondary_delete on public.trip_templates;
create policy trip_templates_secondary_delete on public.trip_templates
  as restrictive for delete to authenticated
  using (not private.is_secondary_traveler(private.trip_family(trip_id)));

commit;
