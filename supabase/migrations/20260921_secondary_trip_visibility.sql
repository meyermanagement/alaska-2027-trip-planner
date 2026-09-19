-- Secondary travelers: explicitly rostered, never drafts.
-- Keep this helper in the non-API private schema. CREATE OR REPLACE preserves
-- its existing policy references, owner and grants.
begin;

create or replace function private.can_access_trip(p_trip_id uuid)
returns boolean
language sql stable security definer
set search_path = public, private, pg_temp
as $$
  select exists (
    select 1 from public.trips t
    join public.family_members fm on fm.family_id = t.family_id
    where t.id = p_trip_id and fm.user_id = auth.uid()
      and (
        not private.is_secondary_traveler(t.family_id)
        or (t.status is distinct from 'draft' and private.on_trip(t.id))
      )
  );
$$;

drop policy if exists trips_secondary_read on public.trips;
create policy trips_secondary_read on public.trips
as restrictive for select to authenticated
using (private.can_access_trip(id));

-- Some related tables had only household-level policies. A hidden trip must
-- not reappear as an itinerary, reminder, insight, roster, or shared chat.
-- Nullable trip references preserve existing access to non-trip records.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'chat_conversations', 'chat_messages', 'day_pack_items', 'flight_deals',
    'item_insights', 'itinerary_items', 'lessons', 'packing_items',
    'predeparture_tasks', 'pro_tips', 'someday_places', 'trip_basic_history',
    'trip_costs', 'trip_facts', 'trip_insurance_policies', 'trip_notes',
    'trip_pets', 'trip_templates', 'trip_travelers'
  ] loop
    execute format('drop policy if exists trip_visibility_read on public.%I', tbl);
    execute format(
      'create policy trip_visibility_read on public.%I as restrictive for select to authenticated using (trip_id is null or private.can_access_trip(trip_id))',
      tbl
    );
  end loop;
end $$;

-- A message may omit trip_id while its conversation still names a trip.
drop policy if exists conversation_trip_visibility_read on public.chat_messages;
create policy conversation_trip_visibility_read on public.chat_messages
as restrictive for select to authenticated
using (conversation_id is null or exists (
  select 1 from public.chat_conversations c where c.id = chat_messages.conversation_id
));

commit;
