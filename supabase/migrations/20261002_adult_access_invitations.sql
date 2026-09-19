-- HELD FOR REVIEW. No birthday job, automatic unban, or production backfill of
-- trusted ban provenance. Historical restrictions deliberately need review.
begin;
create table private.traveler_login_holds (
  traveler_id uuid primary key references public.travelers(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.traveler_login_holds from public,anon,authenticated;
insert into private.traveler_login_holds(traveler_id)
select id from public.travelers where is_person and date_of_birth<=current_date
and date_of_birth>current_date-interval '18 years';
create table private.minor_login_holds (
  user_id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
  ban_until timestamptz not null,
  review_required boolean not null default true,
  recorded_at timestamptz not null default now()
);
revoke all on private.minor_login_holds from public,anon,authenticated;

-- Older bans have no reliable provenance. Never infer "only an age ban" from
-- its duration, the date of birth, or a parent asking to invite the traveler.
insert into private.minor_login_holds(user_id,ban_until)
select id,banned_until from auth.users
where banned_until>now() and private.is_minor_account(id);

-- Capture the incoming ban before the age trigger changes it. A later
-- administrative ban, even on a still-minor account, invalidates provenance.
create or replace function private.block_known_minor_signin() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous_hold private.minor_login_holds%rowtype; review boolean;
begin
  if exists(select 1 from public.travelers t where t.is_person
    and (t.user_id=new.id or lower(t.email)=lower(new.email))
    and ((t.date_of_birth<=current_date and t.date_of_birth>current_date-interval '18 years')
      or exists(select 1 from private.traveler_login_holds h where h.traveler_id=t.id))) then
    select * into previous_hold from private.minor_login_holds where user_id=new.id;
    review:=case when found then previous_hold.review_required
      or new.banned_until is distinct from previous_hold.ban_until
      else coalesce(new.banned_until>now(),false) end;
    new.banned_until:=greatest(coalesce(new.banned_until,now()),now()+interval '100 years');
    insert into private.minor_login_holds(user_id,ban_until,review_required)
    values(new.id,new.banned_until,review) on conflict(user_id) do update
    set ban_until=excluded.ban_until,review_required=excluded.review_required;
  end if;
  return new;
end $$;
revoke all on function private.block_known_minor_signin() from public,anon,authenticated;
create or replace function private.revoke_new_minor_login() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.is_person and new.date_of_birth<=current_date and new.date_of_birth>current_date-interval '18 years' then
    insert into private.traveler_login_holds(traveler_id) values(new.id) on conflict do nothing;
    -- The auth trigger applies and records the age hold; do not pre-write a
    -- value that could be mistaken for an independent administrative ban.
    update auth.users set updated_at=now()
      where id=new.user_id or (nullif(new.email,'') is not null and lower(email)=lower(new.email));
    delete from auth.refresh_tokens where user_id in(select id::text from auth.users
      where id=new.user_id or lower(email)=lower(new.email));
    delete from auth.sessions where user_id in(select id from auth.users
      where id=new.user_id or lower(email)=lower(new.email));
    update public.push_subscriptions set enabled=false where user_id in(select id from auth.users
      where id=new.user_id or lower(email)=lower(new.email));
  end if;
  return new;
end $$;
revoke all on function private.revoke_new_minor_login() from public,anon,authenticated;

create table public.adult_access_invitations (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  birthday date not null,
  original_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '48 hours',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_user_id uuid references auth.users(id) on delete cascade
);
create index adult_invites_traveler on public.adult_access_invitations(traveler_id,created_at);
alter table public.adult_access_invitations enable row level security;
revoke all on public.adult_access_invitations from public,anon,authenticated;
grant all on public.adult_access_invitations to service_role;

create function private.may_invite_adult(p_parent uuid,p_family uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.family_members m
 join auth.users u on u.id=m.user_id
 join public.travelers t on t.user_id=m.user_id and t.family_id=m.family_id
 join public.beta_consents c on c.user_id=m.user_id
 where m.user_id=p_parent and m.family_id=p_family and t.is_person
 and t.access_level='primary' and t.date_of_birth<=current_date-interval '18 years'
 and not private.is_minor_account(p_parent)
 and (u.banned_until is null or u.banned_until<=now())
 and c.withdrawn_at is null and c.age_confirmed and c.data_acknowledged
 and c.agreement_version='2026-09-22' and c.privacy_version='2026-09-22')
$$;
revoke all on function private.may_invite_adult(uuid,uuid) from public,anon,authenticated;

create function public.adult_access_status(p_family uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not public.account_session_allowed() or not private.may_invite_adult(auth.uid(),p_family)
 then raise exception 'Primary adult access is required.'; end if;
 return coalesce((select jsonb_object_agg(t.id,
   case when t.date_of_birth is null or t.date_of_birth>current_date-interval '18 years' then 'underage'
        when t.user_id is not null and (u.banned_until is null or u.banned_until<=now()) then 'active'
        when t.user_id is not null and (h.user_id is null or h.review_required or h.ban_until is distinct from u.banned_until) then 'review'
        when exists(select 1 from public.adult_access_invitations i where i.traveler_id=t.id
          and i.accepted_at is null and i.revoked_at is null and i.expires_at>now()) then 'pending'
        else 'eligible' end)
 from public.travelers t left join auth.users u on u.id=t.user_id
 left join private.minor_login_holds h on h.user_id=t.user_id
 where t.family_id=p_family and t.is_person and t.access_level='secondary'), '{}'::jsonb);
end $$;
revoke all on function public.adult_access_status(uuid) from public,anon;
grant execute on function public.adult_access_status(uuid) to authenticated;

create function public.create_adult_access_invitation(p_traveler uuid,p_hash text,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.travelers%rowtype; u auth.users%rowtype;
begin
 select * into t from public.travelers where id=p_traveler for update;
 if not found or not public.account_session_allowed()
   or not private.may_invite_adult(auth.uid(),t.family_id) or t.user_id=auth.uid()
   or not t.is_person or t.access_level<>'secondary'
   or t.date_of_birth is null or t.date_of_birth>current_date-interval '18 years'
 then raise exception 'Only an eligible adult secondary traveler can be invited.'; end if;
 if lower(trim(p_email)) is distinct from lower(trim(t.email))
   or coalesce(p_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Save the traveler’s own email in their Family profile first.'; end if;
 if exists(select 1 from public.travelers x where x.id<>t.id and lower(trim(x.email))=lower(trim(t.email)))
 then raise exception 'This email belongs to another traveler. Use a separate address.'; end if;
 if t.user_id is not null then
   select * into u from auth.users where id=t.user_id for update;
   if lower(u.email) is distinct from lower(trim(t.email))
   then raise exception 'The account email needs administrative review.'; end if;
   if u.banned_until is null or u.banned_until<=now()
   then raise exception 'This traveler already has independent access.'; end if;
   if not exists(select 1 from private.minor_login_holds h where h.user_id=u.id
     and not h.review_required and h.ban_until=u.banned_until)
   then raise exception 'This existing account restriction needs administrative review before an invitation can be sent.'; end if;
 elsif exists(select 1 from auth.users where lower(email)=lower(trim(t.email))) then
   raise exception 'This email already has an account. Account linking needs administrative review.';
 end if;
 if exists(select 1 from public.adult_access_invitations where traveler_id=t.id and created_at>now()-interval '1 minute')
 or (select count(*) from public.adult_access_invitations where inviter_id=auth.uid() and created_at>now()-interval '1 day')>=20
 then raise exception 'Please wait before sending another invitation.'; end if;
 update public.adult_access_invitations set revoked_at=now()
 where traveler_id=t.id and accepted_at is null and revoked_at is null;
 -- Blocks ordinary Google/password enrollment too, including after expiration
 -- or cancellation. This record is removed only by personal acceptance.
 insert into private.traveler_login_holds(traveler_id) values(t.id) on conflict do nothing;
 insert into public.adult_access_invitations(token_hash,traveler_id,family_id,inviter_id,email,birthday,original_user_id)
 values(p_hash,t.id,t.family_id,auth.uid(),lower(trim(t.email)),t.date_of_birth,t.user_id);
 return jsonb_build_object('email',lower(trim(t.email)),'name',t.name);
end $$;
revoke all on function public.create_adult_access_invitation(uuid,text,text) from public,anon;
grant execute on function public.create_adult_access_invitation(uuid,text,text) to authenticated;

create function public.revoke_adult_access_invitation(p_traveler uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare f uuid;
begin
 select family_id into f from public.travelers where id=p_traveler for update;
 if not public.account_session_allowed() or not private.may_invite_adult(auth.uid(),f)
 then raise exception 'Primary adult access is required.'; end if;
 update public.adult_access_invitations set revoked_at=now()
 where traveler_id=p_traveler and accepted_at is null and revoked_at is null;
 return true;
end $$;
revoke all on function public.revoke_adult_access_invitation(uuid) from public,anon;
grant execute on function public.revoke_adult_access_invitation(uuid) to authenticated;

-- Service-only capability inspection. A GET/page load never accepts consent,
-- consumes a link, creates an account, or changes permissions.
create function public.check_adult_access_invitation(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare i public.adult_access_invitations%rowtype; t public.travelers%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'Not allowed.'; end if;
 select * into i from public.adult_access_invitations where token_hash=p_hash;
 if not found or i.revoked_at is not null or i.accepted_at is not null or i.expires_at<=now()
 then raise exception 'This invitation is no longer available. Ask for a new invitation.'; end if;
 select * into t from public.travelers where id=i.traveler_id;
 if not found or not t.is_person or t.access_level<>'secondary' or t.family_id<>i.family_id
 or t.date_of_birth is distinct from i.birthday or t.date_of_birth>current_date-interval '18 years'
 or lower(trim(t.email)) is distinct from i.email or t.user_id is distinct from i.original_user_id
 or not private.may_invite_adult(i.inviter_id,i.family_id)
 or exists(select 1 from public.travelers x where x.id<>t.id and lower(trim(x.email))=i.email)
 then raise exception 'The traveler’s details or household access changed. Ask for a new invitation.'; end if;
 if i.original_user_id is not null and not exists(
 select 1 from auth.users u join private.minor_login_holds h on h.user_id=u.id
 where u.id=i.original_user_id and lower(u.email)=i.email and u.banned_until>now()
 and not h.review_required and h.ban_until=u.banned_until)
 then raise exception 'This account restriction needs administrative review.'; end if;
 return jsonb_build_object('email',i.email,'name',t.name,'user_id',i.original_user_id,
   'expires_at',i.expires_at,'needsPassword',i.original_user_id is null);
end $$;
revoke all on function public.check_adult_access_invitation(text) from public,anon,authenticated;
grant execute on function public.check_adult_access_invitation(text) to service_role;

create function public.accept_adult_access_invitation(p_hash text,p_user uuid,p_consent jsonb,p_provisioned_ban timestamptz default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare i public.adult_access_invitations%rowtype; u auth.users%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'Not allowed.'; end if;
 -- Same lock order as create/revoke: traveler, then invitation, then auth user.
 perform 1 from public.travelers where id=(select traveler_id from public.adult_access_invitations where token_hash=p_hash) for update;
 select * into i from public.adult_access_invitations where token_hash=p_hash for update;
 perform public.check_adult_access_invitation(p_hash);
 select * into u from auth.users where id=p_user for update;
 if not found or lower(u.email)<>i.email or u.email_confirmed_at is null
 or u.banned_until is null or u.banned_until<=now()
 or private.is_minor_account(u.id)
 then raise exception 'The verified account does not match this invitation.'; end if;
 if i.original_user_id is not null and i.original_user_id<>u.id
 then raise exception 'The verified account does not match this invitation.'; end if;
 -- Recheck provenance with the account locked, not only during inspection.
 if i.original_user_id is not null and not exists(select 1 from private.minor_login_holds h
   where h.user_id=u.id and not h.review_required and h.ban_until=u.banned_until)
 then raise exception 'This account restriction needs administrative review.'; end if;
 if exists(select 1 from public.family_members where user_id=u.id and (family_id<>i.family_id or role='owner'))
 or exists(select 1 from public.travelers where user_id=u.id and id<>i.traveler_id)
 then raise exception 'Additional account memberships need administrative review.'; end if;
 if i.original_user_id is null and (u.created_at<i.created_at
   or p_provisioned_ban is null or u.banned_until is distinct from p_provisioned_ban
   or exists(select 1 from public.family_members where user_id=u.id)
   or exists(select 1 from public.travelers where user_id=u.id))
 then raise exception 'An existing account cannot be claimed by this invitation.'; end if;
 if p_consent->>'agreement_version' is distinct from '2026-09-22'
 or p_consent->>'privacy_version' is distinct from '2026-09-22'
 or p_consent->'age_confirmed' is distinct from 'true'::jsonb
 or p_consent->'data_acknowledged' is distinct from 'true'::jsonb
 or p_consent->'sharing_acknowledged' is distinct from 'true'::jsonb
 then raise exception 'Current personal consent is required.'; end if;
 -- Do not resurrect sessions, pushes or parent-managed AI permissions.
 delete from auth.refresh_tokens where user_id=u.id::text;
 delete from auth.sessions where user_id=u.id;
 update public.push_subscriptions set enabled=false where user_id=u.id;
 update public.travelers set user_id=u.id,access_level='secondary',wants_reminders=false,
   linked_at=now() where id=i.traveler_id;
 insert into public.family_members(user_id,family_id,role) values(u.id,i.family_id,'member')
 on conflict(user_id,family_id) do update set role='member';
 insert into public.beta_consents(user_id,family_id,agreement_version,privacy_version,app_build,
   age_confirmed,data_acknowledged,sharing_acknowledged,ai_processing,ai_provider,ai_decided_at,
   features,diagnostics,accepted_at,withdrawn_at)
 values(u.id,i.family_id,'2026-09-22','2026-09-22',p_consent->>'app_build',true,true,true,
   coalesce((p_consent->>'ai_processing')::boolean,false),
   case when (p_consent->>'ai_processing')::boolean then 'Google Gemini API' end,now(),
   coalesce(p_consent->'features','{}'::jsonb),coalesce((p_consent->>'diagnostics')::boolean,false),now(),null)
 on conflict(user_id) do update set
   family_id=excluded.family_id,agreement_version=excluded.agreement_version,
   privacy_version=excluded.privacy_version,app_build=excluded.app_build,age_confirmed=true,
   data_acknowledged=true,sharing_acknowledged=true,ai_processing=excluded.ai_processing,
   ai_provider=excluded.ai_provider,ai_decided_at=excluded.ai_decided_at,
   features=excluded.features,diagnostics=excluded.diagnostics,accepted_at=now(),withdrawn_at=null;
 delete from private.traveler_login_holds where traveler_id=i.traveler_id;
 update auth.users set banned_until=null,updated_at=now() where id=u.id;
 delete from private.minor_login_holds where user_id=u.id;
 update public.adult_access_invitations set accepted_at=now(),accepted_user_id=u.id where token_hash=p_hash;
 return true;
end $$;
revoke all on function public.accept_adult_access_invitation(text,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.accept_adult_access_invitation(text,uuid,jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
