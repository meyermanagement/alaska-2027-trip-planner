-- Service-only concurrency and delivery ledgers. No household content in a lock.
create table public.trip_conditions_locks (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  token uuid not null,
  expires_at timestamptz not null
);
alter table public.trip_conditions_locks enable row level security;
revoke all on public.trip_conditions_locks from anon, authenticated;
grant all on public.trip_conditions_locks to service_role;

create function public.claim_trip_conditions(p_trip uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare claimed uuid;
begin
  insert into public.trip_conditions_locks(trip_id,token,expires_at)
    values(p_trip,p_token,now()+interval '2 minutes')
  on conflict(trip_id) do update set token=excluded.token, expires_at=excluded.expires_at
    where trip_conditions_locks.expires_at < now()
  returning token into claimed;
  return claimed = p_token;
end;
$$;
revoke all on function public.claim_trip_conditions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_trip_conditions(uuid,uuid) to service_role;

create table public.trip_impact_pushes (
  tip_id uuid not null references public.pro_tips(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key(tip_id,subscription_id)
);
alter table public.trip_impact_pushes enable row level security;
revoke all on public.trip_impact_pushes from anon,authenticated;
grant all on public.trip_impact_pushes to service_role;
