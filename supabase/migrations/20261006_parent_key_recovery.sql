-- Pending review only. All key operations are server-only and serialized per parent.
begin;
alter table public.parent_view_keys drop constraint parent_view_keys_guardian_user_id_key;
alter table public.parent_view_keys add column label text not null default 'Parent passkey'
  check(length(label) between 1 and 60);
create index parent_keys_guardian on public.parent_view_keys(guardian_user_id);
alter table public.parent_view_challenges drop constraint parent_view_challenges_purpose_check;
alter table public.parent_view_challenges add check(purpose in ('register','open','return','key-auth','key-register'));

create table public.parent_key_security (
  guardian_user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0,
  recovery_hash text check(recovery_hash ~ '^[a-f0-9]{64}$'),
  recovery_created_at timestamptz,
  failures int not null default 0,
  blocked_until timestamptz
);
create table public.parent_key_grants (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  revision bigint not null,
  kind text not null check(kind in ('add','remove','recovery-code','recover')),
  proof_key text,
  target_key text,
  expires_at timestamptz not null default now()+interval '5 minutes'
);
create table public.parent_key_alerts (
  id uuid primary key default gen_random_uuid(),
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('add','remove','recovery-code','recover')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  claimed_until timestamptz,
  attempts int not null default 0
);
do $$ declare t text; begin
  foreach t in array array['parent_key_security','parent_key_grants','parent_key_alerts'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy server_only on public.%I for all to service_role using(true) with check(true)',t);
  end loop;
end $$;

create function private.lock_parent_keys(parent_id uuid, adult_session uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('parent-keys:'||parent_id::text,0));
  if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
    join public.travelers t on t.user_id=u.id join public.family_members m on m.user_id=u.id and m.family_id=t.family_id
    join public.beta_consents b on b.user_id=u.id
    where s.id=adult_session and u.id=parent_id and (u.banned_until is null or u.banned_until<=now())
      and t.is_person and t.access_level='primary' and t.date_of_birth<=current_date-interval '18 years'
      and b.agreement_version='2026-09-22' and b.privacy_version='2026-09-22'
      and b.age_confirmed and b.data_acknowledged and b.withdrawn_at is null)
  then raise exception 'Sign in to your authorized adult account again.' using errcode='42501'; end if;
  insert into public.parent_key_security(guardian_user_id) values(parent_id) on conflict do nothing;
end $$;
revoke all on function private.lock_parent_keys(uuid,uuid) from public,anon,authenticated;

create function public.register_initial_parent_key(parent_id uuid,adult_session uuid,key_id text,key_public text,
  key_counter bigint,key_transports text[]) returns void language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_parent_keys(parent_id,adult_session);
  if exists(select 1 from public.parent_view_keys where guardian_user_id=parent_id) then
    raise exception 'A parent passkey is already registered.';
  end if;
  insert into public.parent_view_keys(credential_id,guardian_user_id,public_key,counter,transports)
    values(key_id,parent_id,key_public,key_counter,key_transports);
end $$;

-- Only the server can assert proof_key, AFTER WebAuthn verification. Recovery also
-- requires recent verified JWT AMR at both API steps; refresh-token iat is not proof.
create function public.authorize_parent_key_change(parent_id uuid,adult_session uuid,change_kind text,
  verified_key text,target_key_id text,code_hash text,grant_hash text) returns boolean
language plpgsql security definer set search_path='' as $$
declare state public.parent_key_security;
begin
  perform private.lock_parent_keys(parent_id,adult_session);
  select * into state from public.parent_key_security where guardian_user_id=parent_id;
  delete from public.parent_key_grants where guardian_user_id=parent_id and expires_at<=now();
  if change_kind='recover' then
    if state.blocked_until>now() then return false; end if;
    if state.recovery_hash is null or code_hash is distinct from state.recovery_hash then
      update public.parent_key_security set failures=case when failures>=4 then 0 else failures+1 end,
        blocked_until=case when failures>=4 then now()+interval '15 minutes' else null end
        where guardian_user_id=parent_id;
      return false;
    end if;
    update public.parent_key_security set failures=0,blocked_until=null where guardian_user_id=parent_id;
  else
    if change_kind not in ('add','remove','recovery-code') or not exists(select 1 from public.parent_view_keys
      where guardian_user_id=parent_id and credential_id=verified_key)
    then raise exception 'Verify a currently registered parent passkey.'; end if;
    if change_kind='remove' and (verified_key=target_key_id or not exists(select 1 from public.parent_view_keys
      where guardian_user_id=parent_id and credential_id=target_key_id))
    then raise exception 'Verify a different passkey before removing this one.'; end if;
  end if;
  insert into public.parent_key_grants(token_hash,guardian_user_id,session_id,revision,kind,proof_key,target_key)
    values(grant_hash,parent_id,adult_session,state.revision,change_kind,verified_key,target_key_id);
  return true;
end $$;

create function public.finish_parent_key_change(parent_id uuid,adult_session uuid,grant_hash text,
  key_id text,key_public text,key_counter bigint,key_transports text[],key_label text,next_recovery_hash text)
returns text language plpgsql security definer set search_path='' as $$
declare g public.parent_key_grants; state public.parent_key_security;
begin
  perform private.lock_parent_keys(parent_id,adult_session);
  select * into state from public.parent_key_security where guardian_user_id=parent_id;
  delete from public.parent_key_grants where token_hash=grant_hash and guardian_user_id=parent_id
    and session_id=adult_session and expires_at>now() and revision=state.revision returning * into g;
  if g.token_hash is null then raise exception 'Verification expired. Start again.'; end if;
  if g.kind<>'recover' and not exists(select 1 from public.parent_view_keys
    where guardian_user_id=parent_id and credential_id=g.proof_key)
  then raise exception 'Verify a currently registered parent passkey.'; end if;
  if g.kind in ('add','recover') then
    if g.kind='add' and (select count(*) from public.parent_view_keys where guardian_user_id=parent_id)>=5
      then raise exception 'Keep up to five parent passkeys.'; end if;
    -- Insert before deleting: a duplicate/invalid credential rolls back everything.
    insert into public.parent_view_keys(credential_id,guardian_user_id,public_key,counter,transports,label)
      values(key_id,parent_id,key_public,key_counter,key_transports,key_label);
  end if;
  if g.kind='remove' then
    if g.target_key=g.proof_key or (select count(*) from public.parent_view_keys where guardian_user_id=parent_id)<2
      then raise exception 'Keep at least one parent passkey.'; end if;
    delete from public.parent_view_keys where guardian_user_id=parent_id and credential_id=g.target_key;
    if not found then raise exception 'Passkey changed. Start again.'; end if;
  end if;
  if g.kind in ('recover','recovery-code') then
    if next_recovery_hash is null or next_recovery_hash !~ '^[a-f0-9]{64}$'
      then raise exception 'A new recovery code is required.'; end if;
    update public.parent_key_security set recovery_hash=next_recovery_hash,recovery_created_at=now(),
      failures=0,blocked_until=null where guardian_user_id=parent_id;
  end if;
  if g.kind='recover' then
    delete from public.parent_view_keys where guardian_user_id=parent_id and credential_id<>key_id;
    update public.parent_trip_views set closed_at=now() where guardian_user_id=parent_id and closed_at is null;
    update public.parent_view_approvals set revoked_at=now() where guardian_user_id=parent_id;
  end if;
  update public.parent_key_security set revision=revision+1 where guardian_user_id=parent_id;
  delete from public.parent_key_grants where guardian_user_id=parent_id;
  delete from public.parent_view_challenges where guardian_user_id=parent_id;
  insert into public.parent_key_alerts(guardian_user_id,kind) values(parent_id,g.kind);
  return g.kind;
end $$;

-- Check verified credentials again inside the same lock as recovery. A key that
-- passed WebAuthn just before a reset cannot finish a handoff/return after reset.
create function public.open_guarded_parent_trip_view(parent_id uuid,child_id uuid,
  old_session_id uuid,view_hash text,notice text,freshly_verified boolean,verified_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.lock_parent_keys(parent_id,old_session_id);
  if freshly_verified and not exists(select 1 from public.parent_view_keys
    where guardian_user_id=parent_id and credential_id=verified_key)
  then raise exception 'Parent setup required.'; end if;
  return public.open_approved_parent_trip_view(parent_id,child_id,old_session_id,view_hash,notice,freshly_verified);
end $$;
create function public.finish_parent_trip_return(parent_id uuid,view_hash text,verified_key text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Not allowed.' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('parent-keys:'||parent_id::text,0));
  if not exists(select 1 from public.parent_view_keys where guardian_user_id=parent_id and credential_id=verified_key)
    then raise exception 'Verify a currently registered parent passkey.'; end if;
  update public.parent_trip_views set closed_at=coalesce(closed_at,now())
    where token_hash=view_hash and guardian_user_id=parent_id;
  if not found then raise exception 'Trip view unavailable.'; end if;
end $$;
do $$ declare signature text; begin
  foreach signature in array array[
    'register_initial_parent_key(uuid,uuid,text,text,bigint,text[])',
    'authorize_parent_key_change(uuid,uuid,text,text,text,text,text)',
    'finish_parent_key_change(uuid,uuid,text,text,text,bigint,text[],text,text)',
    'open_guarded_parent_trip_view(uuid,uuid,uuid,text,text,boolean,text)',
    'finish_parent_trip_return(uuid,text,text)'
  ] loop
    execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
    execute 'grant execute on function public.'||signature||' to service_role';
  end loop;
end $$;
commit;
