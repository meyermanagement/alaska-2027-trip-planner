-- Travel insurance: the policy, what it covers, and the paper itself.
--
-- A policy is bought once and may cover several trips. An annual plan is the
-- clearest case -- one purchase, every trip that year -- but even a single-trip
-- policy gets bought before the trip exists in the app, and a family that
-- splits a long summer into two trip rows should not enter its policy twice.
-- So a policy belongs to the family and is joined to trips, rather than
-- hanging off a trip the way trip_costs does.
--
-- Only trip insurance lives here: travel medical, evacuation, cancellation,
-- baggage, delay. Everyday health insurance is a different thing with a
-- different card and it is not modelled at all.
--
-- The premium is on the policy and is not a trip cost. A trip that wants the
-- premium in its budget adds a trip_costs row with category 'insurance', which
-- already exists; putting the premium into the budget automatically would
-- double-count an annual plan across every trip it covers.

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,

  -- 'trip' is bought for one journey; 'annual' is a multi-trip plan. The
  -- difference is only ever presentational -- both kinds join to as many trips
  -- as the family says they cover -- but a reader wants to know which they are
  -- looking at, and Aly should not tell somebody their annual plan expires
  -- when the trip ends.
  kind text not null default 'trip' check (kind in ('trip', 'annual')),

  provider text not null,
  plan_name text,
  policy_number text,

  -- The window the policy is in force. On a single-trip policy these usually
  -- match the trip; on an annual plan they are the plan year, which is the
  -- whole reason to store them: a trip that starts after coverage_end is not
  -- covered, and that is worth saying out loud on the trip screen.
  coverage_start date,
  coverage_end date,

  -- The number somebody calls from a clinic at two in the morning, kept
  -- separate from the claims desk because they are rarely the same line and
  -- the emergency one is the only one that matters while travelling.
  emergency_phone text,
  claims_phone text,
  claims_url text,

  -- What it actually pays for. Free-form array rather than a column per peril
  -- because plans differ and a check constraint here would be a promise the
  -- market does not keep. The app offers a fixed set of chips; anything else
  -- an insurer names goes in notes.
  covers text[] not null default '{}',

  premium numeric(12, 2),
  deductible numeric(12, 2),
  medical_limit numeric(12, 2),
  evacuation_limit numeric(12, 2),

  notes text,

  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_at timestamptz,
  updated_by uuid references auth.users (id)
);

comment on table public.insurance_policies is
  'A travel insurance policy the family holds. Belongs to the family, not a trip, because one policy can cover several trips.';
comment on column public.insurance_policies.covers is
  'Perils the plan pays for, from the app''s chip set: cancellation, interruption, medical, evacuation, baggage, delay, rental_car, adventure.';
comment on column public.insurance_policies.premium is
  'What the policy cost, in dollars. Not a trip cost -- a trip that wants it in the budget adds a trip_costs row with category insurance.';

create index if not exists insurance_policies_family_idx
  on public.insurance_policies (family_id);

alter table public.insurance_policies enable row level security;

-- Readable by anybody in the family. This is deliberately looser than the
-- budget: an evacuation number is the one piece of paperwork a minor or a
-- friend along for the ride might have to produce alone, so reading is open
-- even though the Insurance tab currently sits behind the Money door they do
-- not get. Writing is not theirs.
drop policy if exists insurance_policies_read on public.insurance_policies;
create policy insurance_policies_read on public.insurance_policies
  for select to authenticated
  using (public.is_family_member (family_id));

drop policy if exists insurance_policies_write on public.insurance_policies;
create policy insurance_policies_write on public.insurance_policies
  for all to authenticated
  using (
    public.is_family_member (family_id)
    and not public.is_secondary_traveler (family_id)
  )
  with check (
    public.is_family_member (family_id)
    and not public.is_secondary_traveler (family_id)
  );

-- Which trips a policy covers. The join is the family's assertion, not
-- something derived from the dates: a family may hold two policies whose
-- windows both contain a trip and only one of them was bought for it.
create table if not exists public.trip_insurance_policies (
  trip_id uuid not null references public.trips (id) on delete cascade,
  policy_id uuid not null references public.insurance_policies (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  primary key (trip_id, policy_id)
);

comment on table public.trip_insurance_policies is
  'Which trips a policy covers, as the family says it does rather than as the dates imply.';

create index if not exists trip_insurance_policies_policy_idx
  on public.trip_insurance_policies (policy_id);

alter table public.trip_insurance_policies enable row level security;

drop policy if exists trip_insurance_read on public.trip_insurance_policies;
create policy trip_insurance_read on public.trip_insurance_policies
  for select to authenticated
  using (public.can_access_trip (trip_id));

drop policy if exists trip_insurance_write on public.trip_insurance_policies;
create policy trip_insurance_write on public.trip_insurance_policies
  for all to authenticated
  using (
    public.can_access_trip (trip_id)
    and not public.is_secondary_traveler (public.trip_family (trip_id))
  )
  with check (
    public.can_access_trip (trip_id)
    and not public.is_secondary_traveler (public.trip_family (trip_id))
  );

-- Who the policy names. A plan bought for two adults does not cover the
-- teenager who joined the trip later, and that is the kind of thing nobody
-- discovers until they need it.
create table if not exists public.insurance_policy_travelers (
  policy_id uuid not null references public.insurance_policies (id) on delete cascade,
  traveler_id uuid not null references public.travelers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (policy_id, traveler_id)
);

comment on table public.insurance_policy_travelers is
  'Travelers named on a policy. Empty means nobody has said, not that nobody is covered.';

alter table public.insurance_policy_travelers enable row level security;

drop policy if exists insurance_travelers_read on public.insurance_policy_travelers;
create policy insurance_travelers_read on public.insurance_policy_travelers
  for select to authenticated
  using (public.is_family_member (public.traveler_family (traveler_id)));

drop policy if exists insurance_travelers_write on public.insurance_policy_travelers;
create policy insurance_travelers_write on public.insurance_policy_travelers
  for all to authenticated
  using (
    public.is_family_member (public.traveler_family (traveler_id))
    and not public.is_secondary_traveler (public.traveler_family (traveler_id))
  )
  with check (
    public.is_family_member (public.traveler_family (traveler_id))
    and not public.is_secondary_traveler (public.traveler_family (traveler_id))
  );

-- The policy document itself. Same bucket and the same shape as the files
-- hanging off an itinerary item, which means the service worker already caches
-- them: it keys on the storage path under the documents bucket, so a policy PDF
-- opened once at home opens again in a clinic with no signal.
create table if not exists public.insurance_documents (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.insurance_policies (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  original_filename text not null,
  label text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

comment on table public.insurance_documents is
  'Files belonging to a policy, stored in the documents bucket under <family_id>/insurance/<policy_id>/.';

create index if not exists insurance_documents_policy_idx
  on public.insurance_documents (policy_id);

alter table public.insurance_documents enable row level security;

drop policy if exists insurance_documents_read on public.insurance_documents;
create policy insurance_documents_read on public.insurance_documents
  for select to authenticated
  using (public.is_family_member (family_id));

drop policy if exists insurance_documents_write on public.insurance_documents;
create policy insurance_documents_write on public.insurance_documents
  for all to authenticated
  using (
    public.is_family_member (family_id)
    and not public.is_secondary_traveler (family_id)
  )
  with check (
    public.is_family_member (family_id)
    and not public.is_secondary_traveler (family_id)
  );

-- A policy read out of a forwarded email, staged for review.
--
-- The same bargain as inbox_parsed_items: the extractor reads the mail and
-- proposes, a person approves. An insurance confirmation is worse than a
-- flight confirmation to get wrong, because a wrong evacuation limit reads as
-- reassurance, so nothing here reaches insurance_policies without somebody
-- pressing a button.
create table if not exists public.inbox_parsed_policies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,

  kind text not null default 'trip' check (kind in ('trip', 'annual')),
  provider text not null,
  plan_name text,
  policy_number text,
  coverage_start date,
  coverage_end date,
  emergency_phone text,
  claims_phone text,
  claims_url text,
  covers text[] not null default '{}',
  premium numeric(12, 2),
  deductible numeric(12, 2),
  medical_limit numeric(12, 2),
  evacuation_limit numeric(12, 2),
  notes text,

  -- Names the email printed, so the reviewer can tick the right travelers
  -- without opening the mail again. Matching them to traveler rows happens at
  -- approval, where a person can correct it.
  insured_names text[] not null default '{}',

  confidence text not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),

  -- Set once the row has been turned into a real policy, so a second press
  -- cannot create a duplicate.
  approved_at timestamptz,
  approved_policy_id uuid references public.insurance_policies (id) on delete set null,

  created_at timestamptz not null default now()
);

comment on table public.inbox_parsed_policies is
  'An insurance policy proposed from a forwarded email, awaiting review. Promoted to insurance_policies on approval.';

create index if not exists inbox_parsed_policies_message_idx
  on public.inbox_parsed_policies (message_id);

alter table public.inbox_parsed_policies enable row level security;

drop policy if exists inbox_parsed_policies_read on public.inbox_parsed_policies;
create policy inbox_parsed_policies_read on public.inbox_parsed_policies
  for select to authenticated
  using (public.is_family_member (family_id));

drop policy if exists inbox_parsed_policies_write on public.inbox_parsed_policies;
create policy inbox_parsed_policies_write on public.inbox_parsed_policies
  for all to authenticated
  using (
    public.is_family_member (family_id)
    and not public.is_secondary_traveler (family_id)
  )
  with check (
    public.is_family_member (family_id)
    and not public.is_secondary_traveler (family_id)
  );
