-- Guessing your way into somebody else's household, made expensive.
--
-- Three codes let a person into a household, and until now all three could be
-- tried as fast as a script could type. `join_family_with_code` is the cheap one:
-- any signed-in account could call it in a loop, and a family invite code is
-- eight characters. A hit is not a leaked row -- it is membership, which in this
-- app means the household's trips, its travelers, its forwarded mail and its
-- passport scans. That is the gap this closes (07 item 22).
--
-- What this adds:
--
--   * public.code_attempts -- one row per try, right or wrong. Row-level security
--     on with no policy, exactly like signup_codes: a ledger of guesses is not
--     something a tester may read.
--   * private.code_attempts_allowed -- five wrong tries in fifteen minutes, or
--     twenty in a day, and the account stops being answered.
--   * public.redeem_code -- one entry point for both kinds of code, throttled,
--     returning a status rather than raising.
--
-- Why nothing raises any more. A raised exception rolls the transaction back, and
-- the attempt row goes with it -- so a counter that lives in the same statement
-- it is meant to limit can be erased by the very failure it is counting. Both old
-- functions are rewritten to return a value instead, which is what makes the
-- ledger authoritative for a caller who never touches our own UI.
--
-- What this does not cover, stated plainly: the sign-up trigger, which redeems a
-- code out of the new account's metadata. Throttling by account is meaningless
-- there, since every guess arrives as a fresh account. What makes that path
-- expensive is Supabase's own sign-up rate limiting plus email confirmation, and
-- the trigger records its attempt here so a burst is at least visible.

create table if not exists public.code_attempts (
  id bigserial primary key,
  user_id uuid,
  kind text not null,
  ok boolean not null default false,
  at timestamptz not null default now()
);

alter table public.code_attempts enable row level security;

revoke all on public.code_attempts from anon, authenticated;

create index if not exists code_attempts_user_at_idx
  on public.code_attempts (user_id, at desc);

create index if not exists code_attempts_at_idx
  on public.code_attempts (at desc);

comment on table public.code_attempts is
  'Every attempt to spend a signup or household invite code, right or wrong. RLS on with no policy, deliberately: only SECURITY DEFINER functions and the service role read it. Feeds the throttle in private.code_attempts_allowed and the retention purge.';

-- Five wrong in fifteen minutes, twenty wrong in a day. Successes do not count
-- against anybody: a family that hands its invite code to three relatives in one
-- evening is not an attack.
create or replace function private.code_attempts_allowed(p_user uuid)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $$
  select
    coalesce((
      select count(*) < 5
      from public.code_attempts
      where user_id = p_user
        and ok = false
        and at > now() - interval '15 minutes'
    ), true)
    and
    coalesce((
      select count(*) < 20
      from public.code_attempts
      where user_id = p_user
        and ok = false
        and at > now() - interval '24 hours'
    ), true);
$$;

comment on function private.code_attempts_allowed(uuid) is
  'False once an account has spent five wrong codes in fifteen minutes or twenty in a day. Lives in private so no client can call it and time the answer.';

-- One place where a code is spent, whichever kind it is.
create or replace function public.redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_signup public.signup_codes%rowtype;
  v_family uuid;
  v_full text;
  v_last text;
  v_family_name text;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'not_signed_in');
  end if;

  -- An empty box is not a guess, and counting it would let somebody lock
  -- themselves out by pressing a button.
  if v_code = '' then
    return jsonb_build_object('status', 'invalid');
  end if;

  if not private.code_attempts_allowed(v_uid) then
    insert into public.code_attempts (user_id, kind, ok)
    values (v_uid, 'throttled', false);
    return jsonb_build_object('status', 'too_many', 'wait_minutes', 15);
  end if;

  select * into v_signup
  from public.signup_codes
  where upper(code) = v_code
    and used_by is null
    and (expires_at is null or expires_at > now())
  for update;

  if found then
    -- A signup code makes a household, so somebody who already belongs to one
    -- cannot spend it. Not a wrong guess either -- a stale code in a bookmarked
    -- URL should neither move an established household nor count against the
    -- person. A household invite code is different and is handled below: joining
    -- a second household is a thing this app allows.
    if exists (select 1 from public.family_members where user_id = v_uid) then
      return jsonb_build_object('status', 'already_member');
    end if;

    select full_name into v_full from public.profiles where id = v_uid;
    v_last := null;
    if v_full is not null then
      v_last := (regexp_split_to_array(trim(v_full), '\s+'))[array_length(regexp_split_to_array(trim(v_full), '\s+'), 1)];
      v_last := nullif(trim(coalesce(v_last, '')), '');
    end if;
    if v_last is not null and length(v_last) >= 2 then
      v_family_name := v_last || ' Family';
    else
      v_family_name := v_signup.family_name;
    end if;

    insert into public.families (name, invite_code)
    values (
      v_family_name,
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    )
    returning id into v_family;

    insert into public.family_members (family_id, user_id, role)
    values (v_family, v_uid, 'owner')
    on conflict (family_id, user_id) do nothing;

    update public.signup_codes
    set used_by = v_uid,
        used_at = now(),
        used_family_id = v_family
    where code = v_signup.code;

    insert into public.code_attempts (user_id, kind, ok)
    values (v_uid, 'signup', true);

    return jsonb_build_object('status', 'new_family', 'family_id', v_family);
  end if;

  select id into v_family
  from public.families
  where upper(invite_code) = v_code;

  if v_family is not null then
    insert into public.family_members (family_id, user_id, role)
    values (v_family, v_uid, 'member')
    on conflict (family_id, user_id) do nothing;

    insert into public.code_attempts (user_id, kind, ok)
    values (v_uid, 'invite', true);

    return jsonb_build_object('status', 'joined_family', 'family_id', v_family);
  end if;

  insert into public.code_attempts (user_id, kind, ok)
  values (v_uid, 'wrong', false);

  return jsonb_build_object('status', 'invalid');
end;
$function$;

comment on function public.redeem_code(text) is
  'Spend a signup code or a household invite code, at most five wrong tries per account per fifteen minutes. Returns a status rather than raising, so the attempt ledger survives a failure.';

-- The join form calls this one. Rewritten to delegate, and to return null rather
-- than raise, so that a caller hitting the RPC directly is counted the same way
-- the form is.
create or replace function public.join_family_with_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  v_result := public.redeem_code(p_code);
  if (v_result->>'status') in ('joined_family', 'new_family') then
    return (v_result->>'family_id')::uuid;
  end if;
  return null;
end;
$function$;

comment on function public.join_family_with_code(text) is
  'Join a household with its invite code. Delegates to redeem_code, which throttles. Returns null for a wrong code or a throttled account -- a signed-in stranger learns nothing from the difference.';

-- The auth callback calls this one, and its text statuses are what that route
-- already branches on. 'too_many' is the new one.
create or replace function public.redeem_signup_code(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_result jsonb;
begin
  v_result := public.redeem_code(p_code);
  return case (v_result->>'status')
    when 'not_signed_in' then 'invalid'
    else (v_result->>'status')
  end;
end;
$function$;

comment on function public.redeem_signup_code(text) is
  'Spend a code straight after sign-in. Delegates to redeem_code. Returns new_family, joined_family, already_member, too_many or invalid.';

revoke execute on function private.code_attempts_allowed(uuid) from public, anon, authenticated;
revoke execute on function public.redeem_code(text) from public, anon;
grant execute on function public.redeem_code(text) to authenticated;
revoke execute on function public.join_family_with_code(text) from public, anon;
grant execute on function public.join_family_with_code(text) to authenticated;
revoke execute on function public.redeem_signup_code(text) from public, anon;
grant execute on function public.redeem_signup_code(text) to authenticated;
