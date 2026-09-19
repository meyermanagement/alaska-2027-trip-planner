-- Minor accounts have one narrow read projection. No adult-table access or AI.
-- Existing verification requests are historical; they do NOT grant this access.
begin;

create or replace function private.is_minor_account(account_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select account_id is not null and (
    exists (
      select 1 from public.travelers t
      where t.is_person and t.date_of_birth > current_date - interval '18 years'
        and (t.user_id = account_id or (t.user_id is null and exists (
          select 1 from auth.users u where u.id = account_id
            and lower(u.email) = lower(t.email) and nullif(t.email,'') is not null
        )))
    ) or exists (
      select 1 from public.child_access_requests r
      where r.child_user_id = account_id and r.child_dob > current_date - interval '18 years'
    )
  );
$$;
revoke all on function private.is_minor_account(uuid) from public,anon;
grant execute on function private.is_minor_account(uuid) to authenticated,service_role;

create or replace function public.account_is_minor(account_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if account_id is null or (
    account_id is distinct from auth.uid()
    and coalesce(auth.role(),'') <> 'service_role'
  ) then raise exception 'Account lookup not allowed.' using errcode='42501'; end if;
  return private.is_minor_account(account_id);
end;
$$;
revoke all on function public.account_is_minor(uuid) from public,anon;
grant execute on function public.account_is_minor(uuid) to authenticated,service_role;

create table public.minor_review_grants (
  traveler_id uuid primary key references public.travelers(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  child_user_id uuid not null references auth.users(id) on delete cascade,
  child_dob date not null,
  notice_version text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.minor_review_events (
  id uuid primary key default gen_random_uuid(),
  traveler_id uuid not null references public.minor_review_grants(traveler_id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  enabled boolean not null,
  notice_version text not null,
  created_at timestamptz not null default now()
);
alter table public.minor_review_grants enable row level security;
alter table public.minor_review_events enable row level security;
revoke all on public.minor_review_grants, public.minor_review_events from anon,authenticated;
grant select on public.minor_review_grants to authenticated;
grant all on public.minor_review_grants, public.minor_review_events to service_role;
create policy guardian_read on public.minor_review_grants for select to authenticated
  using (private.is_family_member(family_id)
    and (guardian_user_id = auth.uid() or not private.is_secondary_traveler(family_id)));
create policy service_all on public.minor_review_grants for all to service_role using (true) with check (true);
create policy service_all on public.minor_review_events for all to service_role using (true) with check (true);

-- Saved age snapshots prevent unlinking/editing a profile from granting adult access.
create or replace function private.is_minor_account(account_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select account_id is not null and (
    exists (
      select 1 from public.travelers t
      where t.is_person and t.date_of_birth > current_date - interval '18 years'
        and (t.user_id = account_id or (t.user_id is null and exists (
          select 1 from auth.users u where u.id = account_id
            and lower(u.email) = lower(t.email) and nullif(t.email,'') is not null
        )))
    ) or exists (
      select 1 from public.child_access_requests r where r.child_user_id=account_id
        and r.child_dob > current_date - interval '18 years'
    ) or exists (
      select 1 from public.minor_review_grants g where g.child_user_id=account_id
        and g.child_dob > current_date - interval '18 years'
    )
  );
$$;
create function private.invalidate_minor_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (new.user_id,new.family_id,new.date_of_birth,new.access_level,new.is_person)
    is distinct from (old.user_id,old.family_id,old.date_of_birth,old.access_level,old.is_person) then
    update public.minor_review_grants set enabled=false,updated_at=now() where traveler_id=new.id;
    if new.user_id is not null and private.is_minor_account(new.user_id) then
      update public.push_subscriptions set enabled=false where user_id=new.user_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.invalidate_minor_review() from public,anon,authenticated;
create trigger invalidate_minor_review after update on public.travelers
  for each row execute function private.invalidate_minor_review();

-- RLS cannot be replaced by middleware. Apply an additional restrictive barrier
-- to every current application table, including tables with permissive policies.
do $$
declare tbl record;
begin
  for tbl in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r'
  loop
    execute format('alter table public.%I enable row level security', tbl.relname);
    execute format('create policy minor_review_only on public.%I as restrictive for all to authenticated using (not private.is_minor_account()) with check (not private.is_minor_account())', tbl.relname);
  end loop;
  if to_regclass('storage.objects') is not null then
    execute 'create policy minor_review_only on storage.objects as restrictive for all to authenticated using (not private.is_minor_account()) with check (not private.is_minor_account())';
  end if;
end;
$$;

-- Retire both old request/review capabilities, preserving their audit records.
create or replace function public.request_child_access(
  child_id uuid, wants_ai boolean, guardian_confirmed boolean,
  collection_confirmed boolean, disclosure_confirmed boolean,
  notice text, agreement text, privacy text
) returns public.child_access_requests language plpgsql security definer set search_path='' as $$
begin
  raise exception 'This request flow has been retired. Use itinerary and packing review. Ask Aly is unavailable to minors.';
end;
$$;
create or replace function public.review_child_access(
  request_uuid uuid, reviewer uuid, decision text, method text, evidence_reference text
) returns public.child_access_requests language plpgsql security definer set search_path='' as $$
begin
  raise exception 'Verification requests are archived. No child AI access can be activated.';
end;
$$;

-- Definer RPCs bypass table RLS. Guard their entry points, not just their callers.
-- claim_traveler_seat is deliberately excluded: it can only link the caller's
-- existing email-matched seat and membership, which is needed for first sign-in.
do $$
declare fn record; body text;
begin
  for fn in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'redeem_code','redeem_signup_code','join_family_with_code',
      'remove_household_member','withdraw_child_access'
    )
  loop
    body := pg_get_functiondef(fn.oid);
    if body !~* E'\\mbegin\\M' then raise exception 'Cannot guard %',fn.proname; end if;
    body := regexp_replace(body, E'\\mbegin\\M',
      'begin if private.is_minor_account() then raise exception ''Minor accounts are read-only.'' using errcode = ''42501''; end if;', 'i');
    execute body;
  end loop;
end;
$$;

create or replace function public.set_minor_review_access(
  child_id uuid, allow_review boolean, guardian_confirmed boolean,
  notice text, agreement text, privacy text
) returns public.minor_review_grants language plpgsql security definer set search_path='' as $$
declare child public.travelers; result public.minor_review_grants; me uuid := auth.uid();
begin
  if me is null or private.is_minor_account(me) then raise exception 'An adult must manage access.'; end if;
  select * into child from public.travelers where id=child_id for update;
  if child.id is null or not private.is_family_member(child.family_id) then
    raise exception 'Choose a child in your household.';
  end if;
  select * into result from public.minor_review_grants where traveler_id=child.id for update;
  -- Withdrawal stays available to the original guardian after consent or role changes.
  if allow_review is false and result.guardian_user_id=me then
    update public.minor_review_grants set enabled=false,updated_at=now()
      where traveler_id=child.id returning * into result;
  else
    if not exists (select 1 from public.travelers t
      where t.user_id=me and t.family_id=child.family_id and t.is_person
        and t.access_level='primary' and t.date_of_birth <= current_date-interval '18 years')
    then raise exception 'An adult primary traveler must manage access.'; end if;
    if allow_review is distinct from true or guardian_confirmed is distinct from true
      or notice is distinct from '2026-09-19-review-1'
      or agreement is distinct from '2026-09-22' or privacy is distinct from '2026-09-22'
    then raise exception 'Confirm the current parent notice.'; end if;
    if not child.is_person or child.access_level <> 'secondary'
      or child.date_of_birth is null or child.date_of_birth > current_date
      or child.date_of_birth <= current_date-interval '18 years' or child.user_id is null
    then raise exception 'Choose a minor with a birthday, secondary access, and a linked sign-in.'; end if;
    if not exists(select 1 from public.beta_consents c where c.user_id=me
      and c.agreement_version=agreement and c.privacy_version=privacy
      and c.age_confirmed and c.data_acknowledged and c.withdrawn_at is null)
    then raise exception 'Complete your own current beta agreement first.'; end if;
    insert into public.minor_review_grants
      (traveler_id,family_id,guardian_user_id,child_user_id,child_dob,notice_version,enabled)
    values (child.id,child.family_id,me,child.user_id,child.date_of_birth,notice,true)
    on conflict(traveler_id) do update set family_id=excluded.family_id,
      guardian_user_id=excluded.guardian_user_id,child_user_id=excluded.child_user_id,
      child_dob=excluded.child_dob,notice_version=excluded.notice_version,enabled=true,updated_at=now()
    returning * into result;
  end if;
  insert into public.minor_review_events(traveler_id,actor_user_id,enabled,notice_version)
    values(result.traveler_id,me,result.enabled,result.notice_version);
  return result;
end;
$$;
revoke all on function public.set_minor_review_access(uuid,boolean,boolean,text,text,text) from public,anon;
grant execute on function public.set_minor_review_access(uuid,boolean,boolean,text,text,text) to authenticated;

-- The only child data endpoint. No caller-supplied traveler/trip/household IDs,
-- no free-text notes, booking references, costs, other people's lists or documents.
create or replace function public.minor_trip_review()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not private.is_minor_account() then
    raise exception 'Minor review is not available for this account.' using errcode='42501';
  end if;
  with allowed as (
    select c.id,c.family_id,c.name from public.travelers c
      join public.minor_review_grants g on g.traveler_id=c.id
    where c.user_id=auth.uid() and c.is_person and c.access_level='secondary'
      and c.date_of_birth <= current_date and c.date_of_birth > current_date-interval '18 years'
      and g.enabled and g.notice_version='2026-09-19-review-1'
      and g.child_user_id=c.user_id and g.child_dob=c.date_of_birth and g.family_id=c.family_id
      and exists(select 1 from public.family_members m where m.family_id=c.family_id and m.user_id=c.user_id)
      and exists(select 1 from public.family_members m where m.family_id=c.family_id and m.user_id=g.guardian_user_id)
      and exists(select 1 from public.travelers p where p.user_id=g.guardian_user_id
        and p.family_id=c.family_id and p.is_person and p.access_level='primary'
        and p.date_of_birth <= current_date-interval '18 years')
      and not private.is_minor_account(g.guardian_user_id)
      and exists(select 1 from public.beta_consents b where b.user_id=g.guardian_user_id
        and b.agreement_version='2026-09-22' and b.privacy_version='2026-09-22'
        and b.age_confirmed and b.data_acknowledged and b.withdrawn_at is null)
  ), visible as (
    select distinct t.id,t.name,t.destination,t.start_date,t.end_date from public.trips t
      join public.trip_travelers roster on roster.trip_id=t.id
      join allowed c on c.id=roster.traveler_id and c.family_id=t.family_id
    where t.status is not null and t.status <> 'draft'
  )
  select jsonb_build_object('enabled',exists(select 1 from allowed),
    'trips',coalesce((select jsonb_agg(jsonb_build_object(
      'id',v.id,'name',v.name,'destination',v.destination,
      'start_date',v.start_date,'end_date',v.end_date,
      'itinerary',coalesce((select jsonb_agg(jsonb_build_object(
        'id',i.id,'item_date',i.item_date,'end_date',i.end_date,'start_time',i.start_time,
        'title',i.title,'category',i.category,'location',i.location,'status',i.status
      ) order by i.item_date,i.start_time,i.sort_order) from public.itinerary_items i where i.trip_id=v.id),'[]'::jsonb),
      'packing',coalesce((select jsonb_agg(jsonb_build_object(
        'id',p.id,'category',p.category,'item',p.item,'quantity',p.quantity,'is_packed',p.is_packed
      ) order by p.category,p.sort_order,p.item) from public.packing_items p
      where p.trip_id=v.id and p.stashed_at is null and p.pet_id is null
        and exists(select 1 from allowed c join public.trip_travelers r on r.traveler_id=c.id
          where r.trip_id=v.id and lower(trim(p.assignee))=lower(trim(c.name))
            and not exists(select 1 from public.travelers duplicate
              where duplicate.family_id=c.family_id and duplicate.is_person
                and duplicate.id<>c.id and lower(trim(duplicate.name))=lower(trim(c.name))))),'[]'::jsonb)
    ) order by v.start_date,v.name) from visible v),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.minor_trip_review() from public,anon;
grant execute on function public.minor_trip_review() to authenticated;

-- Existing push registrations must not keep sending adult-app notifications.
update public.push_subscriptions set enabled=false
where private.is_minor_account(user_id);
create function private.no_minor_push() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if private.is_minor_account(new.user_id) then new.enabled := false; end if;
  return new;
end;
$$;
revoke all on function private.no_minor_push() from public,anon,authenticated;
create trigger no_minor_push before insert or update on public.push_subscriptions
  for each row execute function private.no_minor_push();
commit;
