-- A reread is a proposal, never an automatic re-file. Only the server can
-- create proposals; the signed-in primary explicitly applies selected rows.
create table public.inbox_reprocess_runs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  comment text not null default '' check (length(comment) <= 2000),
  status text not null default 'running' check (status in ('running','ready','failed','applied')),
  baseline text not null,
  result jsonb,
  model text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index inbox_reprocess_message_idx on public.inbox_reprocess_runs(message_id,created_at desc);
create unique index inbox_reprocess_running_idx on public.inbox_reprocess_runs(message_id) where status='running';
alter table public.inbox_reprocess_runs enable row level security;
revoke all on public.inbox_reprocess_runs from anon,authenticated;
grant select on public.inbox_reprocess_runs to authenticated;
grant all on public.inbox_reprocess_runs to service_role;
create policy inbox_reprocess_read on public.inbox_reprocess_runs for select to authenticated
  using (public.account_session_allowed() and private.is_family_member(family_id)
    and not private.is_secondary_traveler(family_id));

-- Includes the source, staging rows and current saved records. Even a manual
-- edit in another tab invalidates an old proposal instead of losing that edit.
create function public.inbox_reprocess_fingerprint(p_message uuid)
returns text language sql stable security definer set search_path=public,pg_temp as $$
  select md5(jsonb_build_object(
    'message',(select to_jsonb(m) from inbox_messages m where id=p_message),
    'items',(select jsonb_agg(to_jsonb(i) order by id) from inbox_parsed_items i where message_id=p_message),
    'policies',(select jsonb_agg(to_jsonb(p) order by id) from inbox_parsed_policies p where message_id=p_message),
    'saved_items',(select jsonb_agg(to_jsonb(i) order by id) from itinerary_items i where id in
      (select approved_item_id from inbox_parsed_items where message_id=p_message)),
    'saved_policies',(select jsonb_agg(to_jsonb(p) order by id) from insurance_policies p where id in
      (select approved_policy_id from inbox_parsed_policies where message_id=p_message)),
    'attachments',(select jsonb_agg(to_jsonb(a) order by id) from inbox_attachments a where message_id=p_message)
  )::text);
$$;
revoke all on function public.inbox_reprocess_fingerprint(uuid) from public,anon,authenticated;
grant execute on function public.inbox_reprocess_fingerprint(uuid) to service_role;

create function public.begin_inbox_reprocess(p_message uuid,p_user uuid,p_comment text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare m inbox_messages%rowtype; rid uuid;
begin
  select * into m from inbox_messages where id=p_message for update;
  if not found or not exists(select 1 from family_members where family_id=m.family_id and user_id=p_user)
    then raise exception 'Message not found.'; end if;
  perform 1 from families where id=m.family_id for update;
  if m.parse_status in ('pending','running') then
    raise exception 'The first reading is still in progress. Try again when it finishes.';
  end if;
  update inbox_reprocess_runs set status='failed',error='The reading timed out. Please try again.',finished_at=now()
    where message_id=m.id and status='running' and created_at<now()-interval '3 minutes';
  if exists(select 1 from inbox_reprocess_runs where message_id=m.id and status='running')
    then raise exception 'This email is already being reprocessed.'; end if;
  if (select count(*) from inbox_reprocess_runs where family_id=m.family_id and created_at>now()-interval '5 minutes')>=5
    then raise exception 'Please wait a few minutes before reprocessing more emails.'; end if;
  insert into inbox_reprocess_runs(message_id,family_id,requested_by,comment,baseline)
    values(m.id,m.family_id,p_user,p_comment,inbox_reprocess_fingerprint(m.id)) returning id into rid;
  return rid;
end $$;
revoke all on function public.begin_inbox_reprocess(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_inbox_reprocess(uuid,uuid,text) to service_role;

create function public.apply_inbox_reprocess(p_run uuid,p_choices jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r inbox_reprocess_runs%rowtype; m inbox_messages%rowtype;
  c jsonb; value jsonb; idx int; target uuid; seen uuid[]='{}'; seen_indices int[]='{}';
  item inbox_parsed_items%rowtype; policy inbox_parsed_policies%rowtype;
  staged int=0; updated int=0; rows jsonb;
begin
  select * into r from inbox_reprocess_runs where id=p_run for update;
  if not found or public.account_session_allowed() is not true or not private.is_family_member(r.family_id)
    or private.is_secondary_traveler(r.family_id) then raise exception 'Not permitted.'; end if;
  if r.status='applied' then return jsonb_build_object('ok',true,'already_applied',true); end if;
  if r.status<>'ready' then raise exception 'That reading is not ready to use.'; end if;
  select * into m from inbox_messages where id=r.message_id for update;
  -- Lock the existing targets before checking the fingerprint, not after.
  perform 1 from itinerary_items where id in
    (select approved_item_id from inbox_parsed_items where message_id=m.id) order by id for update;
  perform 1 from insurance_policies where id in
    (select approved_policy_id from inbox_parsed_policies where message_id=m.id) order by id for update;
  if r.baseline<>inbox_reprocess_fingerprint(m.id) then
    raise exception 'This email or a saved record changed. Reprocess it again before saving.';
  end if;
  if p_choices is null or jsonb_typeof(p_choices)<>'array' or jsonb_array_length(p_choices)=0 or jsonb_array_length(p_choices)>50
    then raise exception 'Choose at least one result to use.'; end if;
  rows := case when r.result->>'kind'='insurance' then jsonb_build_array(r.result->'policy') else r.result->'items' end;
  -- Only replace unapproved extraction. Saved records, document copies and
  -- traveler/trip links survive, including rows the reviewer chooses to skip.
  delete from inbox_parsed_items where message_id=m.id and status='pending';
  delete from inbox_parsed_policies where message_id=m.id and approved_at is null;
  for c in select * from jsonb_array_elements(p_choices) loop
    idx := (c->>'index')::int;
    if idx is null or idx<0 or idx>=jsonb_array_length(rows) or idx=any(seen_indices)
      then raise exception 'Invalid result selection.'; end if;
    seen_indices:=array_append(seen_indices,idx);
    value:=rows->idx;
    target:=nullif(c->>'target_id','')::uuid;
    if target is not null and target=any(seen) then raise exception 'Choose each saved record only once.'; end if;
    if target is not null then seen:=array_append(seen,target); end if;
    if r.result->>'kind'='insurance' then
      policy:=jsonb_populate_record(null::inbox_parsed_policies,value);
      if target is not null then
        if not exists(select 1 from inbox_parsed_policies p join insurance_policies s on s.id=p.approved_policy_id
          where p.message_id=m.id and s.id=target and s.family_id=m.family_id)
          then raise exception 'That policy does not belong to this email.'; end if;
        update insurance_policies set provider=policy.provider,
          plan_name=coalesce(policy.plan_name,plan_name),policy_number=coalesce(policy.policy_number,policy_number),
          coverage_start=coalesce(policy.coverage_start,coverage_start),coverage_end=coalesce(policy.coverage_end,coverage_end),
          emergency_phone=coalesce(policy.emergency_phone,emergency_phone),claims_phone=coalesce(policy.claims_phone,claims_phone),
          claims_url=coalesce(policy.claims_url,claims_url),
          covers=case when cardinality(policy.covers)>0 then policy.covers else covers end,
          premium=coalesce(policy.premium,premium),deductible=coalesce(policy.deductible,deductible),
          medical_limit=coalesce(policy.medical_limit,medical_limit),evacuation_limit=coalesce(policy.evacuation_limit,evacuation_limit)
          where id=target;
        -- Never overwrite personal notes, policy kind, documents or coverage links.
        updated:=updated+1;
      else
        insert into inbox_parsed_policies(message_id,family_id,kind,provider,plan_name,policy_number,
          coverage_start,coverage_end,emergency_phone,claims_phone,claims_url,covers,premium,deductible,
          medical_limit,evacuation_limit,notes,insured_names,confidence)
        values(m.id,m.family_id,policy.kind,policy.provider,policy.plan_name,policy.policy_number,
          policy.coverage_start,policy.coverage_end,policy.emergency_phone,policy.claims_phone,policy.claims_url,
          policy.covers,policy.premium,policy.deductible,policy.medical_limit,policy.evacuation_limit,
          policy.notes,policy.insured_names,policy.confidence);
        staged:=staged+1;
      end if;
    else
      item:=jsonb_populate_record(null::inbox_parsed_items,value);
      if target is not null then
        if not exists(select 1 from inbox_parsed_items p join itinerary_items i on i.id=p.approved_item_id
          join trips t on t.id=i.trip_id where p.message_id=m.id and i.id=target and t.family_id=m.family_id)
          then raise exception 'That booking does not belong to this email.'; end if;
        update itinerary_items set title=item.title,category=item.category,
          location=coalesce(item.location,location),item_date=coalesce(item.item_date,item_date),
          end_date=coalesce(item.end_date,end_date),start_time=coalesce(item.start_time,start_time),
          confirmation_number=coalesce(item.confirmation_number,confirmation_number) where id=target;
        -- Preserve hand-written notes and all fields outside the extraction.
        updated:=updated+1;
      else
        insert into inbox_parsed_items(message_id,family_id,category,title,location,item_date,end_date,start_time,
          confirmation_number,notes,confidence,sort_order,source,attributed_traveler_id)
        values(m.id,m.family_id,item.category,item.title,item.location,item.item_date,item.end_date,item.start_time,
          item.confirmation_number,item.notes,item.confidence,idx,'reprocess',m.attributed_traveler_id);
        staged:=staged+1;
      end if;
    end if;
  end loop;
  if staged>0 then
    update inbox_messages set status='pending',parse_status='succeeded',parse_error=null,
      parse_model=r.model,parsed_at=now() where id=m.id;
  end if;
  update inbox_reprocess_runs set status='applied',finished_at=now() where id=r.id;
  return jsonb_build_object('ok',true,'updated',updated,'staged',staged);
end $$;
revoke all on function public.apply_inbox_reprocess(uuid,jsonb) from public,anon;
grant execute on function public.apply_inbox_reprocess(uuid,jsonb) to authenticated;
