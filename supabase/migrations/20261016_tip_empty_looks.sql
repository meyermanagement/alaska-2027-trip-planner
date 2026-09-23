-- Remember, per place on a trip, the brief that last came back with no tips.
--
-- lib/tips/emptyLooks.js skips the model for a place whose brief has not changed
-- since it last answered with nothing, inside a week (or the same day when the
-- trip starts within two weeks). One jsonb column on the trip's own facts row,
-- so it sits under trip_facts' existing row-level security, and one function so
-- the four places a trip look asks at once each change their own key rather
-- than rewriting the whole object over one another.
--
-- The function runs as the caller: it can only reach a trip_facts row the
-- signed-in person could already update.

alter table public.trip_facts
  add column if not exists empty_looks jsonb not null default '{}'::jsonb;

create or replace function public.note_empty_look(p_trip_id uuid, p_place text, p_value jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.trip_facts
     set empty_looks = case
           when p_value is null then coalesce(empty_looks, '{}'::jsonb) - p_place
           else coalesce(empty_looks, '{}'::jsonb) || jsonb_build_object(p_place, p_value)
         end
   where trip_id = p_trip_id;
$$;

revoke all on function public.note_empty_look(uuid, text, jsonb) from public, anon;
grant execute on function public.note_empty_look(uuid, text, jsonb) to authenticated;
