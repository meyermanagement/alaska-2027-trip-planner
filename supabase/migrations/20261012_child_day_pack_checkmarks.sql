-- Only the checkmark on a currently authorized own day-pack item may change.
-- Separate from suitcase packing; no parent/child account attribution invented.
create function public.set_child_day_pack(view_hash text,item_id uuid,packed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child_id uuid; trip uuid; case_id uuid; projection jsonb;
begin
  child_id := private.lock_child_trip_view(view_hash);
  if packed is null or item_id is null then raise exception 'Invalid change.' using errcode='42501'; end if;
  select trip_id,from_packing_id into trip,case_id from public.day_pack_items where id=item_id for update;
  perform 1 from public.packing_items where id=case_id for share;
  perform 1 from public.trips where id=trip for share;
  perform 1 from public.trip_travelers where trip_id=trip and traveler_id=child_id for share;
  projection := public.parent_trip_view_data(view_hash);
  if not exists (
    select 1 from jsonb_array_elements(projection->'trips') t,
      jsonb_array_elements(t->'day_pack') d where d->>'id'=item_id::text
  ) then raise exception 'Item unavailable.' using errcode='42501'; end if;
  update public.day_pack_items set is_packed=packed,
    packed_at=case when packed then now() else null end,packed_by=null,
    updated_at=now(),updated_by=null where id=item_id;
  return jsonb_build_object('id',item_id,'is_packed',packed);
end $$;
revoke all on function public.set_child_day_pack(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_child_day_pack(text,uuid,boolean) to service_role;
