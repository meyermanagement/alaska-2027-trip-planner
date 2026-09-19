-- Pending release: remember verified parent authorization, not an adult session.
begin;
create table public.parent_view_approvals (
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  child_dob date not null,
  child_user_id uuid,
  notice_version text not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (guardian_user_id,traveler_id)
);
alter table public.parent_view_approvals enable row level security;
revoke all on public.parent_view_approvals from public,anon,authenticated;
grant all on public.parent_view_approvals to service_role;
create policy server_only on public.parent_view_approvals for all to service_role using(true) with check(true);

-- Only a previously completed, passkey-verified handoff is evidence of approval.
-- A closed/expired view is a finished session, not withdrawal of authorization.
insert into public.parent_view_approvals
  (guardian_user_id,traveler_id,family_id,child_dob,child_user_id,notice_version,approved_at)
select distinct on (v.guardian_user_id,v.traveler_id)
  v.guardian_user_id,v.traveler_id,v.family_id,v.child_dob,v.child_user_id,v.notice_version,v.created_at
from public.parent_trip_views v join public.travelers c on c.id=v.traveler_id
where v.notice_version='2026-09-19-parent-view-2' and v.family_id=c.family_id
  and v.child_dob=c.date_of_birth and v.child_user_id is not distinct from c.user_id
  and private.parent_may_open_trip_view(v.guardian_user_id,c.id)
  and exists(select 1 from public.parent_view_keys k where k.guardian_user_id=v.guardian_user_id)
order by v.guardian_user_id,v.traveler_id,v.created_at desc;

create function private.parent_view_approval_current(parent_id uuid,child_id uuid,notice text)
returns boolean language sql stable security definer set search_path='' as $$
  select notice='2026-09-19-parent-view-2' and private.parent_may_open_trip_view(parent_id,child_id)
    and exists(select 1 from public.parent_view_approvals a
      join public.travelers c on c.id=a.traveler_id
      join public.parent_view_keys k on k.guardian_user_id=a.guardian_user_id
      where a.guardian_user_id=parent_id and a.traveler_id=child_id and a.revoked_at is null
        and a.notice_version=notice and a.family_id=c.family_id
        and a.child_dob=c.date_of_birth and a.child_user_id is not distinct from c.user_id);
$$;
revoke all on function private.parent_view_approval_current(uuid,uuid,text) from public,anon,authenticated;

create function public.parent_view_approved_children(parent_id uuid,notice text)
returns table(traveler_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  return query select a.traveler_id from public.parent_view_approvals a
    where a.guardian_user_id=parent_id
      and private.parent_view_approval_current(parent_id,a.traveler_id,notice);
end $$;
revoke all on function public.parent_view_approved_children(uuid,text) from public,anon,authenticated;
grant execute on function public.parent_view_approved_children(uuid,text) to service_role;

create function public.open_approved_parent_trip_view(parent_id uuid,child_id uuid,
  old_session_id uuid,view_hash text,notice text,freshly_verified boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare child public.travelers; result jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  -- Serialize authorization, handoff and revocation for this parent/child pair.
  perform pg_advisory_xact_lock(hashtextextended(parent_id::text||':'||child_id::text,0));
  select * into child from public.travelers where id=child_id for share;
  perform 1 from public.parent_view_keys where guardian_user_id=parent_id for share;
  perform 1 from public.beta_consents where user_id=parent_id for share;
  perform 1 from auth.users where id=parent_id for share;
  perform 1 from public.family_members where user_id=parent_id and family_id=child.family_id for share;
  if freshly_verified is distinct from true
    and not coalesce(private.parent_view_approval_current(parent_id,child_id,notice),false)
  then raise exception 'Parent setup required.' using errcode='42501'; end if;
  -- Preserves every existing eligibility check and atomic adult-session revocation.
  result := public.open_parent_trip_view(parent_id,child_id,old_session_id,view_hash,notice);
  if freshly_verified is true then
    insert into public.parent_view_approvals
      (guardian_user_id,traveler_id,family_id,child_dob,child_user_id,notice_version)
    values(parent_id,child.id,child.family_id,child.date_of_birth,child.user_id,notice)
    on conflict(guardian_user_id,traveler_id) do update set
      family_id=excluded.family_id,child_dob=excluded.child_dob,child_user_id=excluded.child_user_id,
      notice_version=excluded.notice_version,approved_at=now(),revoked_at=null;
  end if;
  return result;
end $$;
revoke all on function public.open_approved_parent_trip_view(uuid,uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.open_approved_parent_trip_view(uuid,uuid,uuid,text,text,boolean) to service_role;

create function public.revoke_parent_view_approval(parent_id uuid,child_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(parent_id::text||':'||child_id::text,0));
  update public.parent_view_approvals set revoked_at=now()
    where guardian_user_id=parent_id and traveler_id=child_id;
  update public.parent_trip_views set closed_at=now()
    where guardian_user_id=parent_id and traveler_id=child_id and closed_at is null;
end $$;
revoke all on function public.revoke_parent_view_approval(uuid,uuid) from public,anon,authenticated;
grant execute on function public.revoke_parent_view_approval(uuid,uuid) to service_role;
commit;
