-- Review release only. No automatic seeding and no changes to other trips.
begin;
create table public.packing_base_onboarding (
  family_id uuid primary key references public.families(id) on delete cascade,
  first_trip_id uuid,
  retired_at timestamptz
);
alter table public.packing_base_onboarding enable row level security;
revoke all on public.packing_base_onboarding from public,anon,authenticated;
grant select on public.packing_base_onboarding to authenticated;
grant all on public.packing_base_onboarding to service_role;
create policy packing_base_onboarding_read on public.packing_base_onboarding
  for select to authenticated using (public.account_session_allowed()
    and private.is_family_member(family_id) and not private.is_secondary_traveler(family_id));

create function public.packing_base(p_trip uuid,p_action text,p_items jsonb default '[]')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare fid uuid; tid uuid; tpl jsonb; rows jsonb; v jsonb; source packing_items%rowtype;
  person text; name text; category_name text; pet uuid; qty text; late boolean;
  intro boolean; added integer=0; trip_added integer=0; previous jsonb; source_rows jsonb;
begin
  if auth.uid() is null or public.account_session_allowed() is not true
    then raise exception 'Please sign in again.' using errcode='42501'; end if;
  if p_trip is not null then
    select family_id into fid from trips where id=p_trip and status<>'draft';
  else
    select family_id into fid from family_members where user_id=auth.uid() order by family_id limit 1;
  end if;
  if fid is null or private.is_family_member(fid) is not true or private.is_secondary_traveler(fid) is not false
    then raise exception 'Not permitted.' using errcode='42501'; end if;
  if p_action is null or p_action not in ('state','dismiss','remember','essentials','source','copy')
    or p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500
    then raise exception 'Invalid packing request.'; end if;
  -- Serializes these saves and their retries across tabs and household members.
  perform 1 from families where id=fid for update;
  if p_trip is not null then perform 1 from trips where id=p_trip for share; end if;
  insert into packing_base_onboarding(family_id,first_trip_id)
    select fid,id from trips where family_id=fid and status<>'draft' order by created_at,id limit 1
    on conflict(family_id) do nothing;
  select id into tid from packing_templates
    where family_id=fid and is_base and pet_id is null order by created_at,id limit 1;

  if p_action='dismiss' then
    insert into packing_base_onboarding(family_id,retired_at) values(fid,now())
      on conflict(family_id) do update set retired_at=coalesce(packing_base_onboarding.retired_at,excluded.retired_at);
  elsif p_action='source' then
    if p_trip is null or jsonb_array_length(p_items)<>1 then raise exception 'Choose a previous trip.'; end if;
    if not exists(select 1 from trips old join trips current on current.id=p_trip
      where old.id=(p_items->>0)::uuid and old.family_id=fid and old.id<>p_trip
        and old.status<>'draft' and old.created_at<=current.created_at)
      then raise exception 'Previous trip not found.' using errcode='42501'; end if;
    select coalesce(jsonb_agg(to_jsonb(i) order by category,sort_order,item),'[]'::jsonb)
      into source_rows from packing_items i where i.trip_id=(p_items->>0)::uuid and i.stashed_at is null;
  elsif p_action in ('remember','essentials','copy') then
    if jsonb_array_length(p_items)=0 then raise exception 'Choose at least one item.'; end if;
    if p_action in ('remember','copy') and p_trip is null then raise exception 'Choose a trip.'; end if;
    for v in select value from jsonb_array_elements(p_items) loop
      if p_action in ('remember','copy') then
        select * into source from packing_items where id=(v#>>'{}')::uuid
          and stashed_at is null and (
            (p_action='remember' and trip_id=p_trip) or
            (p_action='copy' and trip_id in (
              select old.id from trips old join trips current on current.id=p_trip
              where old.family_id=fid and old.id<>p_trip and old.status<>'draft'
                and old.created_at<=current.created_at
            ))) for share;
        if not found then raise exception 'An item changed or is no longer on this trip. Review the list again.'; end if;
        name:=source.item; person:=coalesce(source.assignee,'Shared');
        category_name:=coalesce(source.category,'General'); pet:=source.pet_id;
        qty:=source.quantity; late:=coalesce(source.last_minute,false);
      else
        name:=v->>'item'; person:=btrim(v->>'assignee'); pet:=null; qty:=null;
        -- Do not trust arbitrary category/content coming through a direct RPC.
        category_name:=case
          when name in ('Underwear','Socks','Sleepwear') then 'Clothing'
          when name in ('Toothbrush','Toothpaste','Deodorant') then 'Toiletries'
          when name in ('Phone charger','Charging cable') then 'Electronics' else null end;
        late:=name in ('Toothbrush','Phone charger','Charging cable');
        if category_name is null or person is null or not (
          lower(person)='shared' or exists(select 1 from travelers t where t.family_id=fid
            and lower(btrim(t.name))=lower(person) and t.is_person))
          then raise exception 'Choose essentials and a household traveler.'; end if;
        if lower(person)='shared' then person:='Shared'; end if;
      end if;
      if tid is null then
        insert into packing_templates(family_id,name,is_base,created_by)
          values(fid,'Base packing list',true,auth.uid()) returning id into tid;
      end if;
      if not exists(select 1 from packing_template_items i where i.template_id=tid
        and lower(regexp_replace(btrim(i.item),'\s+',' ','g'))=lower(regexp_replace(btrim(name),'\s+',' ','g'))
        and lower(btrim(coalesce(i.assignee,'Shared')))=lower(btrim(person))
        and i.pet_id is not distinct from pet) then
        insert into packing_template_items(template_id,item,category,assignee,pet_id,quantity,last_minute,sort_order,created_by)
          values(tid,name,category_name,person,pet,qty,late,999,auth.uid());
        added:=added+1;
      end if;
      if p_action in ('essentials','copy') and p_trip is not null and not exists(
        select 1 from packing_items i where i.trip_id=p_trip and i.stashed_at is null
          and lower(regexp_replace(btrim(i.item),'\s+',' ','g'))=lower(regexp_replace(btrim(name),'\s+',' ','g'))
          and lower(btrim(coalesce(i.assignee,'Shared')))=lower(btrim(person)) and i.pet_id is not distinct from pet
      ) then
        insert into packing_items(trip_id,item,category,assignee,pet_id,quantity,last_minute,is_packed,from_template,sort_order,created_by)
          values(p_trip,name,category_name,person,pet,qty,late,false,true,999,auth.uid());
        trip_added:=trip_added+1;
      end if;
    end loop;
    -- Successful save only. Invalid rows roll back the whole transaction.
    insert into packing_base_onboarding(family_id,retired_at) values(fid,now())
      on conflict(family_id) do update set retired_at=coalesce(packing_base_onboarding.retired_at,excluded.retired_at);
  end if;
  select to_jsonb(t) into tpl from packing_templates t where id=tid;
  select coalesce(jsonb_agg(to_jsonb(i) order by category,sort_order,item),'[]'::jsonb)
    into rows from packing_template_items i where template_id=tid;
  -- Existing base lists count as completed, even if created through Aly/Edit.
  if jsonb_array_length(rows)>0 then
    insert into packing_base_onboarding(family_id,retired_at) values(fid,now())
      on conflict(family_id) do update set retired_at=coalesce(packing_base_onboarding.retired_at,excluded.retired_at);
  end if;
  intro:=p_trip is not null and exists(select 1 from packing_base_onboarding where family_id=fid
      and first_trip_id=p_trip and retired_at is null)
    and exists(select 1 from trips t where t.id=p_trip and (t.end_date is null or t.end_date>=current_date)
      and t.id=(select id from trips where family_id=fid and status<>'draft' order by created_at,id limit 1));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into previous
    from (select old.id,old.name,old.start_date,old.created_at from trips old join trips current on current.id=p_trip
      where old.family_id=fid and old.id<>p_trip and old.status<>'draft' and old.created_at<=current.created_at
        and exists(select 1 from packing_items i where i.trip_id=old.id and i.stashed_at is null)
      order by old.created_at desc limit 50) t;
  return jsonb_build_object('template',tpl,'items',rows,'showIntro',coalesce(intro,false),
    'previousTrips',previous,'sourceItems',coalesce(source_rows,'[]'::jsonb),'added',added,'tripAdded',trip_added);
end $$;
revoke all on function public.packing_base(uuid,text,jsonb) from public,anon;
grant execute on function public.packing_base(uuid,text,jsonb) to authenticated;
commit;
