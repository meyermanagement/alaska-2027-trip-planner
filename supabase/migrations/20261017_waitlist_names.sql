-- First and last name on the waitlist.
--
-- Asked for on the form so the desk knows who it is inviting, and so the
-- invitation can open with the person's first name instead of an address.
--
-- Nullable in the table so the change applies cleanly whatever is already on
-- the list; /api/waitlist requires both for every new entry (see
-- waitlistEntry in lib/home/waitlist.js).

alter table public.waitlist
  add column if not exists first_name text
    check (first_name is null or char_length(first_name) between 1 and 80),
  add column if not exists last_name text
    check (last_name is null or char_length(last_name) between 1 and 80);

comment on column public.waitlist.first_name is
  'As typed on the form, trimmed. Required by the route for new entries.';
comment on column public.waitlist.last_name is
  'As typed on the form, trimmed. Required by the route for new entries.';
