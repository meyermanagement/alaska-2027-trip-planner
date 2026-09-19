-- Parent-managed setup only. Verification is not an active child AI grant.
begin;

create table public.child_access_requests (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null unique references public.travelers(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  child_user_id uuid references auth.users(id) on delete cascade,
  child_dob date not null,
  notice_version text not null,
  agreement_version text not null,
  privacy_version text not null,
  guardian_attested boolean not null check (guardian_attested),
  collection_requested boolean not null check (collection_requested),
  ai_requested boolean not null default false,
  ai_disclosure_requested boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'revoked')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  -- Retain the audit identity without blocking deletion of a reviewer account.
  reviewed_by uuid,
  reviewed_at timestamptz,
  verification_method text check (verification_method in ('signed_form', 'trained_video_call')),
  -- Opaque reference to a restricted verification record, never an ID/document.
  verification_reference text check (length(verification_reference) <= 160),
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not ai_requested or ai_disclosure_requested),
  check (status <> 'verified' or
    (reviewed_by is not null and reviewed_by <> guardian_user_id
     and reviewed_at is not null and verification_method is not null
     and length(verification_reference) >= 6))
);

create table public.child_access_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.child_access_requests(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event text not null,
  notice_version text not null,
  ai_requested boolean not null,
  created_at timestamptz not null default now()
);

alter table public.child_access_requests enable row level security;
alter table public.child_access_events enable row level security;
revoke all on public.child_access_requests, public.child_access_events from anon, authenticated;
grant select on public.child_access_requests to authenticated;
grant all on public.child_access_requests, public.child_access_events to service_role;

-- Parents may read their own records while still in the household. No direct
-- REST writes, no child reads, and no authentication cookie grants permission.
create policy child_access_parent_read on public.child_access_requests
for select to authenticated using (
  guardian_user_id = auth.uid()
  and private.is_family_member(family_id)
  and not private.is_secondary_traveler(family_id)
);

create function public.request_child_access(
  child_id uuid, wants_ai boolean, guardian_confirmed boolean,
  collection_confirmed boolean, disclosure_confirmed boolean,
  notice text, agreement text, privacy text
) returns public.child_access_requests
language plpgsql security definer set search_path = '' as $$
declare
  child public.travelers;
  result public.child_access_requests;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  select * into child from public.travelers where id = child_id for update;
  if child.id is null or not private.is_family_member(child.family_id)
    or private.is_secondary_traveler(child.family_id)
  then raise exception 'An adult primary traveler in this household must manage access.'; end if;
  if not exists (
    select 1 from public.travelers t
    where t.user_id = me and t.family_id = child.family_id and t.is_person
      and t.access_level = 'primary'
      and t.date_of_birth <= current_date - interval '18 years'
  ) then raise exception 'Add your adult date of birth to your traveler profile first.'; end if;
  if not child.is_person or child.date_of_birth is null
    or child.date_of_birth > current_date
    or child.date_of_birth <= current_date - interval '18 years'
    or child.user_id = me or child.access_level <> 'secondary'
  then raise exception 'Choose a child with a birthday and secondary access.'; end if;
  if guardian_confirmed is distinct from true or collection_confirmed is distinct from true
    or (wants_ai is true and disclosure_confirmed is distinct from true)
  then raise exception 'The parent confirmations are required.'; end if;
  if notice <> '2026-09-19-draft-1' or agreement <> '2026-09-22' or privacy <> '2026-09-22'
    or notice is null or agreement is null or privacy is null
  then raise exception 'Reload the current parent notice.'; end if;
  if not exists (
    select 1 from public.beta_consents c where c.user_id = me
      and c.agreement_version = agreement and c.privacy_version = privacy
      and c.age_confirmed and c.data_acknowledged and c.withdrawn_at is null
      and (not coalesce(wants_ai, false) or c.ai_processing)
  ) then raise exception 'Complete your own current beta agreement and requested AI permission first.'; end if;
  -- Serialize against another parent/request so stale tabs cannot replace a
  -- live review. A withdrawn or expired request can be started again.
  if exists (select 1 from public.child_access_requests r
    where r.traveler_id = child.id and r.status in ('pending','verified')
      and r.expires_at > now() and r.notice_version = notice)
  then raise exception 'A current request already exists. Withdraw it before replacing it.'; end if;

  insert into public.child_access_requests
    (traveler_id,family_id,guardian_user_id,child_user_id,child_dob,
     notice_version,agreement_version,privacy_version,guardian_attested,
     collection_requested,ai_requested,ai_disclosure_requested)
  values (child.id,child.family_id,me,child.user_id,child.date_of_birth,
    notice,agreement,privacy,true,true,coalesce(wants_ai,false),
    coalesce(wants_ai,false) and coalesce(disclosure_confirmed,false))
  on conflict (traveler_id) do update set
    guardian_user_id=excluded.guardian_user_id, child_user_id=excluded.child_user_id,
    child_dob=excluded.child_dob, notice_version=excluded.notice_version,
    agreement_version=excluded.agreement_version, privacy_version=excluded.privacy_version,
    ai_requested=excluded.ai_requested, ai_disclosure_requested=excluded.ai_disclosure_requested,
    status='pending', requested_at=now(), expires_at=now()+interval '30 days',
    reviewed_by=null, reviewed_at=null, verification_method=null, verification_reference=null,
    revoked_at=null, updated_at=now()
  returning * into result;
  insert into public.child_access_events(request_id,actor_user_id,event,notice_version,ai_requested)
    values(result.id,me,'requested',notice,result.ai_requested);
  return result;
end;
$$;

create function public.withdraw_child_access(request_uuid uuid)
returns public.child_access_requests language plpgsql security definer set search_path = '' as $$
declare result public.child_access_requests;
begin
  select * into result from public.child_access_requests where id=request_uuid for update;
  if result.id is null or result.guardian_user_id <> auth.uid() or auth.uid() is null
    or not private.is_family_member(result.family_id)
  then raise exception 'Only the requesting parent can withdraw this request.'; end if;
  update public.child_access_requests set status='revoked', revoked_at=now(), updated_at=now()
    where id=result.id returning * into result;
  insert into public.child_access_events(request_id,actor_user_id,event,notice_version,ai_requested)
    values(result.id,auth.uid(),'revoked',result.notice_version,result.ai_requested);
  return result;
end;
$$;

-- Called ONLY by the authenticated admin route after its allowlist check.
create function public.review_child_access(request_uuid uuid, reviewer uuid,
  decision text, method text, evidence_reference text)
returns public.child_access_requests language plpgsql security definer set search_path = '' as $$
declare result public.child_access_requests;
begin
  select * into result from public.child_access_requests where id=request_uuid for update;
  if result.id is null or result.status <> 'pending' or result.expires_at <= now()
    or result.notice_version <> '2026-09-19-draft-1'
  then raise exception 'This request is no longer awaiting review.'; end if;
  if reviewer is null or reviewer = result.guardian_user_id or reviewer = result.child_user_id
  then raise exception 'A different authorized reviewer must verify the parent.'; end if;
  if decision is null or decision not in ('verified','rejected')
    or method is null or method not in ('signed_form','trained_video_call')
    or evidence_reference is null or length(trim(evidence_reference)) not between 6 and 160
  then raise exception 'A verification method and restricted record reference are required.'; end if;
  if not exists (select 1 from public.travelers t
    where t.id=result.traveler_id and t.family_id=result.family_id
      and t.date_of_birth=result.child_dob and t.user_id is not distinct from result.child_user_id
      and t.access_level='secondary' and t.is_person
      and t.date_of_birth > current_date - interval '18 years')
  then raise exception 'The child profile changed. Ask the parent to submit a new request.'; end if;
  if not exists (select 1 from public.family_members m
      join public.beta_consents c on c.user_id=m.user_id
      join public.travelers t on t.user_id=m.user_id and t.family_id=m.family_id
    where m.user_id=result.guardian_user_id and m.family_id=result.family_id
      and c.withdrawn_at is null and c.age_confirmed and c.data_acknowledged
      and c.agreement_version=result.agreement_version and c.privacy_version=result.privacy_version
      and (not result.ai_requested or c.ai_processing)
      and t.access_level='primary' and t.date_of_birth <= current_date - interval '18 years')
  then raise exception 'The parent’s permissions changed. Do not verify this request.'; end if;
  update public.child_access_requests set status=decision, reviewed_by=reviewer, reviewed_at=now(),
    verification_method=method, verification_reference=trim(evidence_reference), updated_at=now()
    where id=result.id returning * into result;
  insert into public.child_access_events(request_id,actor_user_id,event,notice_version,ai_requested)
    values(result.id,reviewer,decision,result.notice_version,result.ai_requested);
  return result;
end;
$$;

revoke all on function public.request_child_access(uuid,boolean,boolean,boolean,boolean,text,text,text) from public, anon;
revoke all on function public.withdraw_child_access(uuid) from public, anon;
revoke all on function public.review_child_access(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.request_child_access(uuid,boolean,boolean,boolean,boolean,text,text,text) to authenticated;
grant execute on function public.withdraw_child_access(uuid) to authenticated;
grant execute on function public.review_child_access(uuid,uuid,text,text,text) to service_role;

-- A minor cannot self-certify the adult agreement via a direct REST write.
create function private.guard_child_adult_consent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.withdrawn_at is null and exists (
    select 1 from public.travelers t where t.user_id=new.user_id and t.is_person
      and t.date_of_birth > current_date - interval '18 years'
      and t.date_of_birth <= current_date
  ) then raise exception 'Child accounts require parent-managed access, not the adult agreement.'; end if;
  return new;
end;
$$;
revoke all on function private.guard_child_adult_consent() from public, anon, authenticated;
create trigger guard_child_adult_consent before insert or update on public.beta_consents
for each row execute function private.guard_child_adult_consent();
commit;
