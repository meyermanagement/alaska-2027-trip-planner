-- HELD FOR REVIEW. Requires application release and fresh parent authorization.
-- Does not reactivate logins or grant authenticated/anon callers any new rights.
begin;
create table public.child_view_preferences (
  traveler_id uuid primary key references public.travelers(id) on delete cascade,
  skin text not null check (skin in ('aurora','daybreak','journal','frost','sodium'))
);
alter table public.child_view_preferences enable row level security;
revoke all on public.child_view_preferences from public,anon,authenticated;
grant all on public.child_view_preferences to service_role;

create or replace function public.open_parent_trip_view(parent_id uuid,child_id uuid,
  old_session_id uuid,view_hash text,notice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.travelers; prefs public.profiles; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  if notice is distinct from '2026-09-19-parent-view-2' or not private.parent_may_open_trip_view(parent_id,child_id)
    or not exists(select 1 from auth.sessions where id=old_session_id and user_id=parent_id)
    or not exists(select 1 from public.parent_view_keys where guardian_user_id=parent_id)
    or view_hash is null or view_hash !~ '^[a-f0-9]{64}$'
  then raise exception 'Parent access could not be verified.' using errcode='42501'; end if;
  select * into child from public.travelers where id=child_id;
  select * into prefs from public.profiles where id=parent_id;
  insert into public.parent_trip_views(token_hash,traveler_id,family_id,guardian_user_id,
    child_dob,child_user_id,parent_skin,parent_text_size,notice_version)
    values(view_hash,child.id,child.family_id,parent_id,child.date_of_birth,child.user_id,
      prefs.skin,prefs.text_size,notice);
  insert into private.handed_off_sessions(session_id,user_id) values(old_session_id,parent_id);
  delete from auth.refresh_tokens where session_id=old_session_id;
  delete from auth.sessions where id=old_session_id and user_id=parent_id;
  delete from public.parent_view_challenges where expires_at<now();
  select jsonb_build_object('skin',coalesce(cp.skin,p.skin,'aurora'),'text_size',p.text_size) into result
    from public.travelers c left join public.profiles p on p.id=c.user_id
    left join public.child_view_preferences cp on cp.traveler_id=c.id where c.id=child_id;
  return coalesce(result,'{}'::jsonb);
end $$;

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
          where duplicate.is_person and duplicate.id<>c.id and lower(trim(duplicate.name))=lower(trim(c.name))))),'[]'::jsonb)
    ) order by v.start_date,v.name) from visible v),'[]'::jsonb)) into result;
  return result;
end $$;

-- Serialize writes with closing this view. All access decisions are checked
-- again in the transaction; a cookie alone is never authorization.
create function private.lock_child_trip_view(view_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare child_id uuid; guardian_id uuid; fid uuid; projection jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  select traveler_id,guardian_user_id,family_id into child_id,guardian_id,fid
    from public.parent_trip_views where token_hash=view_hash for update;
  perform 1 from public.travelers where family_id=fid for share;
  perform 1 from public.beta_consents where user_id=guardian_id for share;
  perform 1 from auth.users where id=guardian_id for share;
  perform 1 from public.family_members where user_id=guardian_id and family_id=fid for share;
  projection := public.parent_trip_view_data(view_hash);
  if child_id is null or (projection->>'enabled')::boolean is distinct from true
  then raise exception 'View unavailable.' using errcode='42501'; end if;
  return child_id;
end $$;
revoke all on function private.lock_child_trip_view(text) from public,anon,authenticated;

create function public.set_child_packing(view_hash text,item_id uuid,packed boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child_id uuid; trip uuid; projection jsonb;
begin
  child_id := private.lock_child_trip_view(view_hash);
  if packed is null or item_id is null then raise exception 'Invalid change.' using errcode='42501'; end if;
  select trip_id into trip from public.packing_items where id=item_id for update;
  perform 1 from public.trips where id=trip for share;
  perform 1 from public.trip_travelers where trip_id=trip and traveler_id=child_id for share;
  projection := public.parent_trip_view_data(view_hash);
  if not exists (
    select 1 from jsonb_array_elements(projection->'trips') t,
      jsonb_array_elements(t->'packing') p where p->>'id'=item_id::text
  ) then raise exception 'Item unavailable.' using errcode='42501'; end if;
  update public.packing_items set is_packed=packed where id=item_id;
  return jsonb_build_object('id',item_id,'is_packed',packed);
end $$;
revoke all on function public.set_child_packing(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_child_packing(text,uuid,boolean) to service_role;

create function public.set_child_theme(view_hash text,chosen_skin text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare child_id uuid;
begin
  child_id := private.lock_child_trip_view(view_hash);
  if chosen_skin is null or chosen_skin not in ('aurora','daybreak','journal','frost','sodium')
  then raise exception 'Invalid theme.' using errcode='42501'; end if;
  insert into public.child_view_preferences(traveler_id,skin) values(child_id,chosen_skin)
    on conflict(traveler_id) do update set skin=excluded.skin;
  return jsonb_build_object('skin',chosen_skin);
end $$;
revoke all on function public.set_child_theme(text,text) from public,anon,authenticated;
grant execute on function public.set_child_theme(text,text) to service_role;
commit;
