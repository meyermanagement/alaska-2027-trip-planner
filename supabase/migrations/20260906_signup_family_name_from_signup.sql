-- Derive the family name from the signup name.
--
-- The first cut of handle_new_user took the family name straight off the
-- signup_codes row (all five say "New Family"). That meant every account
-- opened by a stranger landed with a placeholder for a name, and the
-- welcome form never asked, so it stayed a placeholder forever.
--
-- This picks the last word of the full name they typed on signup (or that
-- Google handed back) and stamps that plus "Family" onto the row: Alex
-- Rivera -> Rivera Family. Falls back to what the code carried when the
-- name is a single word, empty, or too short to be a surname. Either way
-- the welcome form now surfaces it as an editable field, so this is only
-- the starting text.

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
  v_last text;
  v_family_name text;
  v_signup public.signup_codes%rowtype;
begin
  v_full := nullif(trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  )), '');

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

  select * into v_signup
  from public.signup_codes
  where upper(code) = v_code
    and used_by is null
    and (expires_at is null or expires_at > now())
  for update;

  if found then
    v_last := null;
    if v_full is not null then
      v_last := (regexp_split_to_array(v_full, '\s+'))[array_length(regexp_split_to_array(v_full, '\s+'), 1)];
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
    values (v_family, new.id, 'owner')
    on conflict (family_id, user_id) do nothing;

    update public.signup_codes
    set used_by = new.id,
        used_at = now(),
        used_family_id = v_family
    where code = v_signup.code;

    return new;
  end if;

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
