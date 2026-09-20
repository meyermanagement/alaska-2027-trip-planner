-- Read-only, own-assignment day packs in the parent-opened itinerary.
-- Preserve all existing consent, identity, roster, draft and expiry gates.
create or replace function public.parent_trip_view_data(view_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  with allowed as (
    select c.id,c.name,c.family_id,coalesce(cp.skin,p.skin,'aurora') as skin,p.text_size
    from public.parent_trip_views g join public.travelers c on c.id=g.traveler_id
    left join public.profiles p on p.id=c.user_id
    left join public.child_view_preferences cp on cp.traveler_id=c.id
    where g.token_hash=view_hash and g.closed_at is null and g.expires_at>now()
      and g.notice_version='2026-09-19-parent-view-2'
      and g.family_id=c.family_id and g.child_dob=c.date_of_birth
      and g.child_user_id is not distinct from c.user_id
      and private.parent_may_open_trip_view(g.guardian_user_id,c.id)
  ), visible as (
    select distinct t.id,t.name,t.destination,t.start_date,t.end_date,t.status,t.cover_image_url,t.cover_image_alt
    from public.trips t join public.trip_travelers roster on roster.trip_id=t.id
    join allowed c on c.id=roster.traveler_id and c.family_id=t.family_id
    where t.status is not null and t.status<>'draft'
  )
  select jsonb_build_object('enabled',exists(select 1 from allowed),
    'skin',(select skin from allowed),'text_size',(select text_size from allowed),
    'trips',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'name',v.name,'destination',v.destination,'start_date',v.start_date,'end_date',v.end_date,
      'status',v.status,'cover_image_url',v.cover_image_url,'cover_image_alt',v.cover_image_alt,
      'itinerary',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.id,'item_date',i.item_date,'end_date',i.end_date,'start_time',i.start_time,
        'title',i.title,'category',i.category,'location',i.location,'status',i.status
      ) order by i.item_date,i.start_time,i.sort_order) from public.itinerary_items i where i.trip_id=v.id),'[]'::jsonb),
      'packing',coalesce((select jsonb_agg(jsonb_build_object(
        'id',p.id,'category',p.category,'item',p.item,'quantity',p.quantity,'is_packed',p.is_packed
      ) order by p.category,p.sort_order,p.item) from public.packing_items p
      where p.trip_id=v.id and p.stashed_at is null and p.pet_id is null
        and exists(select 1 from allowed c where lower(trim(p.assignee))=lower(trim(c.name))
        and not exists(select 1 from public.travelers duplicate join allowed c on c.family_id=duplicate.family_id
          where duplicate.is_person and duplicate.id<>c.id and lower(trim(duplicate.name))=lower(trim(c.name))))),'[]'::jsonb),
      'day_pack',coalesce((select jsonb_agg(jsonb_build_object(
        'id',d.id,'item_date',d.item_date,'item',d.item,'is_packed',d.is_packed
      ) order by d.item_date nulls first,d.sort_order,d.item,d.id)
      from public.day_pack_items d
      join public.packing_items p on p.id=d.from_packing_id and p.trip_id=d.trip_id
      where d.trip_id=v.id and p.stashed_at is null and p.pet_id is null
        and exists(select 1 from allowed c where lower(trim(d.assignee))=lower(trim(c.name))
          and not exists(select 1 from public.travelers duplicate
            where duplicate.family_id=c.family_id and duplicate.is_person and duplicate.id<>c.id
              and lower(trim(duplicate.name))=lower(trim(c.name))))),'[]'::jsonb)
    ) order by v.start_date,v.name) from visible v),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on function public.parent_trip_view_data(text) from public,anon,authenticated;
grant execute on function public.parent_trip_view_data(text) to service_role;
