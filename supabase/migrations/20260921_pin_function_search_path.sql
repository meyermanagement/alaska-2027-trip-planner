-- Pin the search path on the five functions that still resolved names at call time.
--
-- None of these is SECURITY DEFINER, so none of them was a privilege-escalation
-- path on its own. The reason to pin them anyway is that a function which
-- resolves an unqualified name at call time resolves it against whatever the
-- caller's search_path happens to be. A schema the caller controls, placed ahead
-- of public, can shadow a table or a function this code means to reach. Pinning
-- removes that possibility and clears the advisor's remaining
-- function_search_path_mutable finding.
--
-- pg_temp is placed last, and only last, so a session-temporary object can never
-- shadow a real one. Every body was read first: all five reference only public
-- tables and built-ins, so public plus pg_temp is sufficient and nothing here
-- needs the extensions schema.

alter function public.touch_updated_at() set search_path = public, pg_temp;
alter function public.touch_item_insights() set search_path = public, pg_temp;
alter function public.families_fill_inbox_local_part() set search_path = public, pg_temp;
alter function public.gen_trip_public_id() set search_path = public, pg_temp;
alter function public.trip_key_length(bigint) set search_path = public, pg_temp;
