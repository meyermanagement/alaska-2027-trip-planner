begin;

-- These records are server-only. A child browser receives one opaque token,
-- never an adult/child Supabase access or refresh token.
create table public.parent_view_keys (
  credential_id text primary key,
  guardian_user_id uuid not null unique references auth.users(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table public.parent_trip_views (
  token_hash text primary key,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  child_dob date not null,
  child_user_id uuid,
  parent_skin text,
  parent_text_size text,
  notice_version text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '2 hours',
  closed_at timestamptz
);
create table public.parent_view_challenges (
  id text primary key,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check(purpose in ('register','open','return')),
  challenge text not null,
  binding text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '5 minutes'
);
create table private.handed_off_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
do $$ declare t text; begin
  foreach t in array array['parent_view_keys','parent_trip_views','parent_view_challenges'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy server_only on public.%I for all to service_role using(true) with check(true)',t);
  end loop;
end $$;
revoke all on private.handed_off_sessions from public,anon,authenticated;

create function private.is_handed_off_session() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.handed_off_sessions s
    where s.session_id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid())
    or (nullif(auth.jwt()->>'session_id','') is not null and auth.uid() is not null
      and not exists(select 1 from auth.sessions s where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()));
$$;
revoke all on function private.is_handed_off_session() from public,anon;
grant execute on function private.is_handed_off_session() to authenticated,service_role;

create function public.account_session_allowed() returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and not private.is_handed_off_session()
    and not exists(select 1 from auth.users u where u.id=auth.uid() and u.banned_until>now());
$$;
revoke all on function public.account_session_allowed() from public,anon;
grant execute on function public.account_session_allowed() to authenticated;

-- Cached JWTs from the handed-off browser lose database access immediately.
do $$ declare t record; f record; definition text; begin
  for t in select schemaname,tablename from pg_tables
    where schemaname='public' or (schemaname='storage' and tablename='objects')
  loop
    execute format('create policy parent_handoff_lock on %I.%I as restrictive for all to authenticated using (not private.is_handed_off_session()) with check (not private.is_handed_off_session())',t.schemaname,t.tablename);
  end loop;
  -- Guard existing browser-callable definer RPCs as well as ordinary RLS.
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang
    where n.nspname='public' and p.prosecdef and l.lanname='plpgsql'
      and p.prorettype<>'trigger'::regtype and has_function_privilege('authenticated',p.oid,'execute')
  loop
    definition:=pg_get_functiondef(f.oid);
    definition:=regexp_replace(definition,'\mBEGIN\M',
      E'BEGIN\n IF private.is_handed_off_session() THEN RAISE EXCEPTION ''This session has been signed out.'' USING ERRCODE=''42501''; END IF;',
      'i');
    execute definition;
  end loop;
end $$;

-- Old child sign-in grants are retired, not repurposed into parent sessions.
update public.minor_review_grants set enabled=false,updated_at=now() where enabled;
revoke execute on function public.minor_trip_review() from authenticated;
revoke execute on function public.set_minor_review_access(uuid,boolean,boolean,text,text,text) from authenticated;

create function private.parent_may_open_trip_view(parent_id uuid, child_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.travelers c
    join public.travelers p on p.family_id=c.family_id
    join public.family_members m on m.family_id=c.family_id and m.user_id=p.user_id
    join public.beta_consents b on b.user_id=p.user_id
    join auth.users u on u.id=p.user_id
    where c.id=child_id and c.is_person and c.access_level='secondary'
      and c.date_of_birth<=current_date and c.date_of_birth>current_date-interval '18 years'
      and p.user_id=parent_id and p.is_person and p.access_level='primary'
      and p.date_of_birth<=current_date-interval '18 years'
      and not private.is_minor_account(parent_id)
      and (u.banned_until is null or u.banned_until<=now())
      and b.agreement_version='2026-09-22' and b.privacy_version='2026-09-22'
      and b.age_confirmed and b.data_acknowledged and b.withdrawn_at is null);
$$;
revoke all on function private.parent_may_open_trip_view(uuid,uuid) from public,anon,authenticated;

create function public.open_parent_trip_view(parent_id uuid,child_id uuid,
  old_session_id uuid,view_hash text,notice text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.travelers; prefs public.profiles; result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  if notice<>'2026-09-19-parent-view-1' or not private.parent_may_open_trip_view(parent_id,child_id)
    or not exists(select 1 from auth.sessions where id=old_session_id and user_id=parent_id)
    or not exists(select 1 from public.parent_view_keys where guardian_user_id=parent_id)
    or length(view_hash)<>64
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
  -- Delete expired challenges opportunistically; no child activity telemetry.
  delete from public.parent_view_challenges where expires_at<now();
  select jsonb_build_object('skin',p.skin,'text_size',p.text_size) into result
    from public.profiles p where p.id=child.user_id;
  return coalesce(result,'{}'::jsonb);
end $$;
revoke all on function public.open_parent_trip_view(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.open_parent_trip_view(uuid,uuid,uuid,text,text) to service_role;

create function public.parent_trip_view_data(view_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  with allowed as (
    select c.id,c.name,c.family_id,p.skin,p.text_size from public.parent_trip_views g
    join public.travelers c on c.id=g.traveler_id
    left join public.profiles p on p.id=c.user_id
    where g.token_hash=view_hash and g.closed_at is null and g.expires_at>now()
      and g.notice_version='2026-09-19-parent-view-1'
      and g.family_id=c.family_id and g.child_dob=c.date_of_birth
      and g.child_user_id is not distinct from c.user_id
      and private.parent_may_open_trip_view(g.guardian_user_id,c.id)
  ), visible as (
    select distinct t.id,t.name,t.destination,t.start_date,t.end_date from public.trips t
    join public.trip_travelers roster on roster.trip_id=t.id
    join allowed c on c.id=roster.traveler_id and c.family_id=t.family_id
    where t.status is not null and t.status<>'draft'
  )
  select jsonb_build_object('enabled',exists(select 1 from allowed),
    'skin',(select skin from allowed),'text_size',(select text_size from allowed),
    'trips',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'name',v.name,'destination',v.destination,'start_date',v.start_date,'end_date',v.end_date,
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
revoke all on function public.parent_trip_view_data(text) from public,anon,authenticated;
grant execute on function public.parent_trip_view_data(text) to service_role;

-- Disable all known minor accounts without deleting their profiles or data.
-- Retain the ban until an adult explicitly reviews eligibility; birthdays do
-- not silently reactivate a previously revoked account.
update auth.users set banned_until=greatest(coalesce(banned_until,now()),now()+interval '100 years'),
  updated_at=now() where private.is_minor_account(id);
delete from auth.refresh_tokens where user_id in
  (select id::text from auth.users where private.is_minor_account(id));
delete from auth.sessions where private.is_minor_account(user_id);
update public.push_subscriptions set enabled=false where private.is_minor_account(user_id);

-- Known minor email addresses cannot establish a new independent account.
create function private.block_known_minor_signin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.travelers t where t.is_person
    and (t.user_id=new.id or (t.email is not null and lower(t.email)=lower(new.email)))
    and t.date_of_birth<=current_date and t.date_of_birth>current_date-interval '18 years')
  then new.banned_until:=greatest(coalesce(new.banned_until,now()),now()+interval '100 years'); end if;
  return new;
end $$;
revoke all on function private.block_known_minor_signin() from public,anon,authenticated;
create trigger block_known_minor_signin before insert or update on auth.users
  for each row execute function private.block_known_minor_signin();

create function private.revoke_new_minor_login() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.is_person and new.date_of_birth<=current_date
    and new.date_of_birth>current_date-interval '18 years' then
    update auth.users set banned_until=greatest(coalesce(banned_until,now()),now()+interval '100 years'),updated_at=now()
      where id=new.user_id or (nullif(new.email,'') is not null and lower(email)=lower(new.email));
    delete from auth.refresh_tokens where user_id in (select id::text from auth.users
      where id=new.user_id or (nullif(new.email,'') is not null and lower(email)=lower(new.email)));
    delete from auth.sessions where user_id in (select id from auth.users
      where id=new.user_id or (nullif(new.email,'') is not null and lower(email)=lower(new.email)));
  end if;
  return new;
end $$;
revoke all on function private.revoke_new_minor_login() from public,anon,authenticated;
create trigger revoke_new_minor_login after insert or update of user_id,email,date_of_birth,is_person on public.travelers
  for each row execute function private.revoke_new_minor_login();

create function public.purge_parent_view_security_records() returns jsonb
language plpgsql security definer set search_path='' as $$
declare views_deleted integer; challenges_deleted integer; sessions_deleted integer;
begin
  if auth.role()<>'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  delete from public.parent_trip_views where created_at<now()-interval '30 days';
  get diagnostics views_deleted=row_count;
  delete from public.parent_view_challenges where expires_at<now();
  get diagnostics challenges_deleted=row_count;
  delete from private.handed_off_sessions where created_at<now()-interval '30 days';
  get diagnostics sessions_deleted=row_count;
  return jsonb_build_object('views',views_deleted,'challenges',challenges_deleted,'sessions',sessions_deleted);
end $$;
revoke all on function public.purge_parent_view_security_records() from public,anon,authenticated;
grant execute on function public.purge_parent_view_security_records() to service_role;
commit;
