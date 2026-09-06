-- Signup codes: each one opens a fresh family, once.
--
-- Before this, handle_new_user knew one thing: if raw_user_meta_data had an
-- invite_code and it matched families.invite_code, add the caller to that
-- family as a member. That was for a family that already existed. There was
-- no way for a stranger to sign up and get their own family, because the
-- families row did not exist yet.
--
-- signup_codes is the other kind of code. One row per code the operator
-- hands out. When somebody signs up with the code, the trigger creates the
-- families row (named from family_name on the code), makes the caller the
-- owner of that new family, and marks the code used so a second person
-- typing the same string gets nothing. Codes are private to the operator;
-- there is no policy that lets a family member read them.
--
-- The trigger checks signup_codes first, then falls back to the old
-- families.invite_code path for people invited into an existing family.
-- Neither match leaves the account family-less, which the /join screen
-- already handles.

create table if not exists public.signup_codes (
  code text primary key,
  family_name text not null,
  note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  used_family_id uuid references public.families(id) on delete set null
);

-- No one reads or writes this table through the API. The trigger reads and
-- updates it under SECURITY DEFINER, which bypasses RLS on its own.
alter table public.signup_codes enable row level security;

comment on table public.signup_codes is
  'Single-use signup codes. Each one opens a fresh family. Managed by the operator through SQL; not exposed to the app.';

-- Rewrite handle_new_user to try a signup code first, then fall back to an
-- existing family invite. The existing behavior for a code that matches
-- families.invite_code is unchanged, so people already sitting on their
-- invite email keep working.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code text;
  v_family uuid;
  v_full text;
  v_display text;
  v_signup public.signup_codes%rowtype;
begin
  -- Google returns full_name and/or name; email signup passes full_name explicitly.
  v_full := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  )), '');

  -- Prefer an explicit display_name, otherwise use the first word of the full
  -- name so assignees stay short (Mark, Steph, Veda) rather than 'Mark Meyer'.
  v_display := nullif(trim(coalesce(new.raw_user_meta_data->>'display_name', '')), '');
  if v_display is null and v_full is not null then
    v_display := split_part(v_full, ' ', 1);
  end if;

  insert into public.profiles (id, full_name, display_name, avatar_url)
  values (
    new.id,
    coalesce(v_full, split_part(new.email, '@', 1)),
    coalesce(v_display, split_part(new.email, '@', 1)),
    nullif(trim(coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
      ''
    )), '')
  )
  on conflict (id) do nothing;

  v_code := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  if v_code = '' then
    return new;
  end if;

  -- Signup code first: one of the ones the operator handed out for creating
  -- a fresh family. Locked because two people racing the same code should
  -- resolve to one winner, not two families with the same name.
  select * into v_signup
  from public.signup_codes
  where upper(code) = v_code
    and used_by is null
    and (expires_at is null or expires_at > now())
  for update;

  if found then
    insert into public.families (name, invite_code)
    values (
      v_signup.family_name,
      -- A short, readable code the family can use to invite others later.
      -- Not the signup code, which is single-use and now dead.
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    )
    returning id into v_family;

    insert into public.family_members (family_id, user_id, role)
    values (v_family, new.id, 'owner')
    on conflict (family_id, user_id) do nothing;

    update public.signup_codes
    set used_by = new.id,
        used_at = now(),
        used_family_id = v_family
    where code = v_signup.code;

    return new;
  end if;

  -- Fall back to the existing behavior: an invite code on an existing
  -- family. This is how somebody joins the Meyer family from the invite
  -- email. Role stays 'member' -- the family already has an owner.
  select id into v_family
  from public.families
  where upper(invite_code) = v_code;

  if v_family is not null then
    insert into public.family_members (family_id, user_id, role)
    values (v_family, new.id, 'member')
    on conflict (family_id, user_id) do nothing;
  end if;

  return new;
end;
$function$;
