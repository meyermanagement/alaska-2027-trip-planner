-- Redeem a signup or family invite code for somebody who is already signed in.
--
-- Codes were only ever redeemable at sign-up: public.handle_new_user reads the
-- code out of raw_user_meta_data, and that metadata is only set by the
-- email-and-password form. Anybody who came in through Google -- which is the
-- first and loudest button on the login screen, sold as the fastest way in --
-- had nowhere to put a code at all, and arrived with a real account, no
-- family, and a bounce to /join asking for an invite they were never given.
--
-- This is the same redemption as the trigger's second half, callable once the
-- person is signed in, so the Google path can carry a code through the OAuth
-- round trip and spend it on the way back.
--
-- SECURITY DEFINER because it writes families, family_members and
-- signup_codes, none of which the caller can touch directly. It is safe
-- because it acts only on auth.uid(), refuses anybody who already belongs to a
-- family, and takes the code row FOR UPDATE so two simultaneous redemptions
-- cannot spend one code twice.
--
-- Returns one of: new_family, joined_family, already_member, invalid.
create or replace function public.redeem_signup_code(p_code text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_signup public.signup_codes%rowtype;
  v_family uuid;
  v_full text;
  v_last text;
  v_family_name text;
begin
  if v_uid is null or v_code = '' then
    return 'invalid';
  end if;

  -- Somebody who already belongs to a family does not get to redeem another
  -- code. Doing nothing is the right answer: a stale code in a bookmarked URL
  -- should not be able to move an established household.
  if exists (select 1 from public.family_members where user_id = v_uid) then
    return 'already_member';
  end if;

  select * into v_signup
  from public.signup_codes
  where upper(code) = v_code
    and used_by is null
    and (expires_at is null or expires_at > now())
  for update;

  if found then
    -- Family name: the last word of the person's own name, the same guess the
    -- sign-up trigger makes, falling back to whatever the code carried. The
    -- welcome form lets them change it, so this is only the starting text.
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

    return 'new_family';
  end if;

  -- Not a signup code, so try it as a family's own invite code and join as a
  -- member rather than an owner.
  select id into v_family
  from public.families
  where upper(invite_code) = v_code;

  if v_family is not null then
    insert into public.family_members (family_id, user_id, role)
    values (v_family, v_uid, 'member')
    on conflict (family_id, user_id) do nothing;
    return 'joined_family';
  end if;

  return 'invalid';
end;
$$;

revoke all on function public.redeem_signup_code(text) from public;
grant execute on function public.redeem_signup_code(text) to authenticated;
