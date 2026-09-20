begin;
-- These are personal, never household pro_tips. No coordinate/history columns.
create table public.location_tip_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  enabled boolean not null default false,
  push_enabled boolean not null default false,
  notice_version text not null,
  revision uuid not null default gen_random_uuid(),
  checked_at timestamptz,
  token uuid,
  locked_until timestamptz,
  primary key(user_id, trip_id)
);
create table public.location_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  fingerprint text not null,
  content jsonb not null,
  status text not null default 'active' check(status in ('active','dismissed')),
  checked_at timestamptz not null default now(),
  unique(user_id, trip_id, fingerprint)
);
create table public.location_tip_pushes (
  tip_id uuid not null references public.location_tips(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  primary key(tip_id, subscription_id)
);
alter table public.location_tip_preferences enable row level security;
alter table public.location_tips enable row level security;
alter table public.location_tip_pushes enable row level security;
revoke all on public.location_tip_preferences, public.location_tips, public.location_tip_pushes from anon, authenticated;
grant select on public.location_tip_preferences, public.location_tips to authenticated;
grant all on public.location_tip_preferences, public.location_tips, public.location_tip_pushes to service_role;
create policy own_location_preferences on public.location_tip_preferences for select to authenticated
using(user_id = auth.uid() and not private.is_minor_account(auth.uid()) and private.can_access_trip(trip_id));
create policy own_location_tips on public.location_tips for select to authenticated
using(user_id = auth.uid() and not private.is_minor_account(auth.uid()) and private.can_access_trip(trip_id));

create function public.claim_location_tips(p_user uuid, p_trip uuid, p_revision uuid, p_token uuid, p_auto boolean, p_device boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  update public.location_tip_preferences set token=p_token, locked_until=now()+interval '2 minutes'
  where user_id=p_user and trip_id=p_trip and revision=p_revision
    and (not p_device or enabled)
    and (locked_until is null or locked_until < now())
    and (checked_at is null or checked_at < now() - case when p_auto then interval '15 minutes' else interval '90 seconds' end)
  returning token into claimed;
  return coalesce(claimed=p_token,false);
end $$;

-- Lock the preference during writes: turning off invalidates any in-flight result.
create function public.finish_location_tips(p_user uuid, p_trip uuid, p_revision uuid, p_token uuid, p_tips jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare pref public.location_tip_preferences; tip jsonb;
begin
  select * into pref from public.location_tip_preferences where user_id=p_user and trip_id=p_trip for update;
  if not found or pref.revision <> p_revision or pref.token is distinct from p_token or pref.locked_until < now() then return false; end if;
  for tip in select value from jsonb_array_elements(p_tips) loop
    insert into public.location_tips(user_id,trip_id,fingerprint,content)
      values(p_user,p_trip,tip->>'fingerprint',tip->'content')
    on conflict(user_id,trip_id,fingerprint) do update
      set content=excluded.content, checked_at=now()
      where location_tips.status='active';
  end loop;
  update public.location_tip_preferences set checked_at=now(), token=null, locked_until=null
    where user_id=p_user and trip_id=p_trip;
  return true;
end $$;
revoke all on function public.claim_location_tips(uuid,uuid,uuid,uuid,boolean,boolean) from public,anon,authenticated;
revoke all on function public.finish_location_tips(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_location_tips(uuid,uuid,uuid,uuid,boolean,boolean) to service_role;
grant execute on function public.finish_location_tips(uuid,uuid,uuid,uuid,jsonb) to service_role;
commit;
