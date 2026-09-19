-- Pending release. Apply and inspect a dry run before enabling the app flag.
-- Only completed history is temporary; saved trip records are not history.
alter table public.inbox_messages add column history_entered_at timestamptz;
alter table public.flight_deals add column history_entered_at timestamptz;
alter table public.card_offers add column history_entered_at timestamptz;

-- Unknown legacy transition dates get a conservative 90-day grace period.
-- Do not guess from received_at / updated_at, which are not archive dates.
update public.inbox_messages set history_entered_at =
  case when status='filed' then least(coalesce(filed_at,now()),now()) else now() end
  where status in ('filed','deleted','noted');
update public.flight_deals set history_entered_at=now()
  where status in ('dismissed','expired');
update public.card_offers set history_entered_at =
  case when status='declined' then least(coalesce(decided_on::timestamptz,now()),now()) else now() end
  where status in ('declined','expired');

create function public.stamp_history_entry()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare terminal text[];
begin
  terminal := case tg_table_name
    when 'inbox_messages' then array['filed','deleted','noted']
    when 'flight_deals' then array['dismissed','expired']
    when 'card_offers' then array['declined','expired'] end;
  if new.status=any(terminal) then
    if tg_op='UPDATE' then
      if old.status=any(terminal) then
        new.history_entered_at := coalesce(old.history_entered_at,now());
      else new.history_entered_at := now(); end if;
    else new.history_entered_at := now(); end if;
  else new.history_entered_at := null;
  end if;
  return new;
end $$;
create trigger inbox_history_clock before insert or update on public.inbox_messages
  for each row execute function public.stamp_history_entry();
create trigger fare_history_clock before insert or update on public.flight_deals
  for each row execute function public.stamp_history_entry();
create trigger offer_history_clock before insert or update on public.card_offers
  for each row execute function public.stamp_history_entry();
create index inbox_history_due on public.inbox_messages(history_entered_at) where status in ('filed','deleted','noted');
create index fare_history_due on public.flight_deals(history_entered_at) where status in ('dismissed','expired') and trip_id is null;
create index offer_history_due on public.card_offers(history_entered_at) where status in ('declined','expired');

-- A durable outbox makes failed storage removals retryable after row deletion.
-- No subject, filename label, email, or content is kept here. Do not cascade on
-- household deletion: outstanding blob cleanup still needs its storage key.
create table public.history_attachment_cleanup (
  storage_path text primary key,
  queued_at timestamptz not null default now()
);
alter table public.history_attachment_cleanup enable row level security;
revoke all on public.history_attachment_cleanup from public,anon,authenticated;
grant all on public.history_attachment_cleanup to service_role;

create function public.history_attachment_is_saved(p_path text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from item_documents where storage_path=p_path)
    or exists(select 1 from insurance_documents where storage_path=p_path)
    or exists(select 1 from traveler_documents where storage_path=p_path);
$$;
revoke all on function public.history_attachment_is_saved(text) from public,anon,authenticated;
grant execute on function public.history_attachment_is_saved(text) to service_role;

-- Service-role only, defaults to read-only. The cutoff cannot exceed 90 days ago.
-- Row locks also serialize against restoration and beginning a reprocess run.
create function public.purge_completed_history(p_dry_run boolean default true, p_limit integer default 2000)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  cutoff timestamptz := now()-interval '90 days';
  cap integer := greatest(1,least(coalesce(p_limit,2000),2000));
  fares uuid[]; offers uuid[]; messages uuid[];
  queued integer := 0;
begin
  select coalesce(array_agg(id),'{}'::uuid[]) into fares from (
    select id from flight_deals where status in ('dismissed','expired')
      and trip_id is null and history_entered_at<=cutoff
    order by history_entered_at,id limit cap for update skip locked
  ) due;
  select coalesce(array_agg(id),'{}'::uuid[]) into offers from (
    select id from card_offers where status in ('declined','expired')
      and history_entered_at<=cutoff
    order by history_entered_at,id limit cap for update skip locked
  ) due;
  -- Keep the source group while ANY non-purged fare still uses it. This includes
  -- active, saved, and recently declined fares, even if the source mail is older.
  select coalesce(array_agg(id),'{}'::uuid[]) into messages from (
    select m.id from inbox_messages m
    where m.status in ('filed','deleted','noted') and m.history_entered_at<=cutoff
      and coalesce(m.parse_status,'') not in ('pending','running')
      and not exists(select 1 from inbox_reprocess_runs r where r.message_id=m.id and r.status in ('running','ready'))
      and not exists(select 1 from flight_deals d where d.message_id=m.id and not(d.id=any(fares)))
      -- Malformed attachment paths are held for investigation, never removed.
      and not exists(select 1 from inbox_attachments a where a.message_id=m.id
        and (a.family_id<>m.family_id or
          left(a.storage_path,length(m.family_id::text||'/inbox/'||m.id::text||'/'))<>
            m.family_id::text||'/inbox/'||m.id::text||'/' or
          a.storage_path ~ '(^|/)\.\.?(/|$)'))
    order by m.history_entered_at,m.id limit cap for update of m skip locked
  ) due;
  if not p_dry_run then
    insert into history_attachment_cleanup(storage_path)
      select distinct a.storage_path from inbox_attachments a where a.message_id=any(messages)
        and not history_attachment_is_saved(a.storage_path)
      on conflict do nothing;
    get diagnostics queued=row_count;
    -- Only source/staging/read-receipt rows cascade. Saved bookings, policies,
    -- documents, trips, reviews and pro_tips are never deleted by this function.
    delete from flight_deals where id=any(fares);
    delete from card_offers where id=any(offers);
    delete from inbox_messages where id=any(messages);
  end if;
  return jsonb_build_object('dry_run',p_dry_run,'cutoff',cutoff,
    'fares',cardinality(fares),'offers',cardinality(offers),'messages',cardinality(messages),
    'attachments_queued',queued,'capped',
    cardinality(fares)=cap or cardinality(offers)=cap or cardinality(messages)=cap);
end $$;
revoke all on function public.purge_completed_history(boolean,integer) from public,anon,authenticated;
grant execute on function public.purge_completed_history(boolean,integer) to service_role;
