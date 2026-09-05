-- A template for tasks, not things.
--
-- The app already had a template that applies to every trip: packing_templates
-- with is_base set, whose items land on each new trip. What it never had was the
-- same idea for tasks. Take the trash out, leave the dishwasher open, arm the
-- alarm -- these happen on every single departure, and every one of them had to
-- be typed in by hand onto every trip. The evidence that this does not work is
-- in the data: of nine trips on the board, four have no travel-day or
-- night-before task at all.
--
-- Deliberately not packing rows. It is tempting, because packing_template_items
-- already carries last_minute and would have taken an afternoon, but a packing
-- row has a quantity, a bag and a Packed tick and none of those mean anything
-- for taking the trash out. More importantly, the morning reminder email reads
-- predeparture_tasks and never reads packing_items -- so as packing rows these
-- would be invisible on the one morning they exist for.
--
-- These become real checklist tasks on the trip. Dated against that trip's own
-- departure, counted in the badge, carried by the morning email, and tickable
-- and deletable per trip without the household's list changing underneath.

create table if not exists house_tasks (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families (id) on delete cascade,
  title text not null,
  -- Room for the bit that is not in the title: which bin, which app, the code.
  detail text,
  -- The same six stages predeparture_tasks already uses, so the copy needs no
  -- translation and the checklist groups these exactly like every other task.
  timing text not null default 'travel_day',
  assignee text not null default 'Shared',
  -- The one flag that stops this feature becoming noise. These tasks are about
  -- the house, and the house is not always empty. Maui in January is Mark and
  -- Steph; Veda is home. Holding the mail and arming the alarm are wrong on that
  -- trip, and an app that adds them anyway teaches the family to stop reading
  -- the list -- which costs more than the convenience gained.
  only_when_empty boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint house_tasks_timing_check check (
    timing in (
      'now',
      'month_before',
      'week_before',
      'day_before',
      'travel_day',
      'before_trip'
    )
  ),
  constraint house_tasks_title_check check (length(btrim(title)) > 0)
);

comment on table house_tasks is
  'Tasks the family does to the house on every departure, authored once and copied onto each trip''s checklist. The task-shaped counterpart to the base packing template.';
comment on column house_tasks.only_when_empty is
  'True when the task only makes sense with nobody home -- skipped on a trip where somebody in the family is staying behind.';

create index if not exists house_tasks_family_idx
  on house_tasks (family_id, sort_order);

alter table house_tasks enable row level security;

-- The same pair of policies packing_templates carries, for the same reasons: any
-- member of the household may read and edit their own list, and a secondary
-- traveler -- a child with sign-in access -- may not, because this is household
-- administration rather than anything about their own trip.
drop policy if exists house_tasks_all on house_tasks;
create policy house_tasks_all on house_tasks
  for all
  to authenticated
  using (is_family_member(family_id))
  with check (is_family_member(family_id));

drop policy if exists house_tasks_secondary_all on house_tasks;
create policy house_tasks_secondary_all on house_tasks
  for all
  to authenticated
  using (not is_secondary_traveler(family_id))
  with check (not is_secondary_traveler(family_id));

-- Where a task on a trip came from. Nullable, because most tasks are still typed
-- straight onto a trip and always will be. Set null on delete rather than
-- cascade: removing a task from the household list should not silently retract
-- it from a trip somebody is already working through.
--
-- It earns its place twice. It lets the checklist group these under one heading
-- that says where they came from, and it lets a second push onto the same trip
-- know what it has already written instead of duplicating the lot.
alter table predeparture_tasks
  add column if not exists house_task_id uuid
    references house_tasks (id) on delete set null;

create index if not exists predeparture_tasks_house_task_idx
  on predeparture_tasks (trip_id, house_task_id);

-- The three the family named, so the card is not an empty box the first time it
-- is opened. Nothing else is invented on their behalf. The alarm is conditional;
-- the trash and the dishwasher are true whoever is home.
insert into house_tasks (family_id, title, timing, only_when_empty, sort_order)
select f.id, v.title, v.timing, v.only_when_empty, v.sort_order
from families f
cross join (
  values
    ('Take the trash and recycling out', 'travel_day', false, 0),
    ('Leave the dishwasher open', 'travel_day', false, 1),
    ('Turn the alarm on', 'travel_day', true, 2)
) as v (title, timing, only_when_empty, sort_order)
where not exists (
  select 1 from house_tasks h where h.family_id = f.id
);
