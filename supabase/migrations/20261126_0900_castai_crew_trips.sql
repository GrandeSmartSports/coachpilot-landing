-- Rig Card Crew, pieces 2 to 4: join links, crew trips, who is going, notes
-- pinned to the run card, the list, and catches.
-- Project: CoachPilot Supabase geigvuysptjvvqanumld (castai_ prefix, see BACKEND-CONTRACT.md).
-- Apply with Supabase MCP apply_migration, name castai_crew_trips.
-- Additive and idempotent: safe to run more than once. It touches nothing that
-- does not start with castai_crew.
--
-- Reached ONLY through the castai-crew edge function with the service role,
-- the same shape as the piece 1 tables: RLS on with no policies, and anon and
-- authenticated hold no grants, so the publishable key reads nothing here.

-- One row per switch. 'sms' says whether texted codes can send; it starts off
-- because the join link is the way in today.
create table if not exists public.castai_crew_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.castai_crew_settings (key, value)
values ('sms', 'off')
on conflict (key) do nothing;

-- A personal join link. The token is never stored, only its sha256, so a copy
-- of this table opens nothing.
create table if not exists public.castai_crew_invites (
  token_hash text primary key,
  crew_id uuid not null references public.castai_crew (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz null,
  revoked boolean not null default false
);

create index if not exists castai_crew_invites_person_idx on public.castai_crew_invites (crew_id, user_id);

-- A trip the crew is doing, or one somebody floated. It stores the plan, not
-- the forecast: every phone runs the planner against today's weather.
create table if not exists public.castai_crew_trips (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.castai_crew (id) on delete cascade,
  created_by uuid null references auth.users (id) on delete set null,
  plan_id text not null,
  spot_id text not null,
  species text not null,
  title text not null,
  trip_date date not null,
  from_hour numeric null,
  to_hour numeric null,
  status text not null default 'idea' check (status in ('idea', 'planned', 'done')),
  note text null,
  client_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists castai_crew_trips_crew_date_idx on public.castai_crew_trips (crew_id, trip_date);
create unique index if not exists castai_crew_trips_client_idx on public.castai_crew_trips (crew_id, client_id)
  where client_id is not null;

create table if not exists public.castai_crew_trip_going (
  trip_id uuid not null references public.castai_crew_trips (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  answer text not null check (answer in ('going', 'maybe', 'out')),
  updated_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index if not exists castai_crew_trip_going_user_idx on public.castai_crew_trip_going (user_id);

-- A note left on a trip. section pins it to one part of the run card; no
-- section is a note on the whole trip. Deleting hides it.
create table if not exists public.castai_crew_comments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.castai_crew_trips (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  section text null check (section in ('plan', 'what', 'gear', 'bait', 'how', 'wx', 'river', 'spot', 'expect', 'rules')),
  body text not null,
  hidden boolean not null default false,
  client_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists castai_crew_comments_trip_idx on public.castai_crew_comments (trip_id, created_at);
create unique index if not exists castai_crew_comments_client_idx on public.castai_crew_comments (trip_id, client_id)
  where client_id is not null;

-- What this crew is bringing, and who has it.
create table if not exists public.castai_crew_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.castai_crew_trips (id) on delete cascade,
  label text not null,
  assigned_to uuid null references auth.users (id) on delete set null,
  done boolean not null default false,
  created_by uuid null references auth.users (id) on delete set null,
  client_id uuid null,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists castai_crew_list_items_trip_idx on public.castai_crew_list_items (trip_id, sort, created_at);
create unique index if not exists castai_crew_list_items_client_idx on public.castai_crew_list_items (trip_id, client_id)
  where client_id is not null;

-- A fish landed on a crew trip. CastAI's own personal log is a different
-- table and is not touched; the two meet when Rig Card moves into CastAI.
create table if not exists public.castai_crew_catches (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.castai_crew_trips (id) on delete cascade,
  user_id uuid null references auth.users (id) on delete set null,
  species text not null,
  length_in numeric null,
  weight_lb numeric null,
  lure text null,
  notes text null,
  client_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists castai_crew_catches_trip_idx on public.castai_crew_catches (trip_id, created_at);
create unique index if not exists castai_crew_catches_client_idx on public.castai_crew_catches (trip_id, client_id)
  where client_id is not null;

-- Limits. Dropped and added by name so a second run lands in the same place.
alter table public.castai_crew_invites drop constraint if exists castai_crew_invites_hash_shape;
alter table public.castai_crew_invites add constraint castai_crew_invites_hash_shape
  check (token_hash ~ '^[0-9a-f]{64}$');

alter table public.castai_crew_trips drop constraint if exists castai_crew_trips_ids;
alter table public.castai_crew_trips add constraint castai_crew_trips_ids
  check (plan_id ~ '^[a-z0-9-]{1,80}$' and spot_id ~ '^[a-z0-9-]{1,80}$');

alter table public.castai_crew_trips drop constraint if exists castai_crew_trips_words;
alter table public.castai_crew_trips add constraint castai_crew_trips_words
  check (length(btrim(title)) between 1 and 120
    and length(btrim(species)) between 1 and 40
    and (note is null or length(note) <= 280));

alter table public.castai_crew_trips drop constraint if exists castai_crew_trips_hours;
alter table public.castai_crew_trips add constraint castai_crew_trips_hours
  check ((from_hour is null or from_hour between 0 and 24)
    and (to_hour is null or to_hour between 0 and 24)
    and (from_hour is null or to_hour is null or to_hour > from_hour));

alter table public.castai_crew_comments drop constraint if exists castai_crew_comments_body_length;
alter table public.castai_crew_comments add constraint castai_crew_comments_body_length
  check (length(btrim(body)) between 1 and 1000);

alter table public.castai_crew_list_items drop constraint if exists castai_crew_list_items_label_length;
alter table public.castai_crew_list_items add constraint castai_crew_list_items_label_length
  check (length(btrim(label)) between 1 and 120);

alter table public.castai_crew_catches drop constraint if exists castai_crew_catches_words;
alter table public.castai_crew_catches add constraint castai_crew_catches_words
  check (length(btrim(species)) between 1 and 40
    and (lure is null or length(lure) <= 80)
    and (notes is null or length(notes) <= 500));

alter table public.castai_crew_catches drop constraint if exists castai_crew_catches_sizes;
alter table public.castai_crew_catches add constraint castai_crew_catches_sizes
  check ((length_in is null or length_in > 0) and (weight_lb is null or weight_lb > 0));

-- Which account has this phone number? One exact answer, so an invite can
-- never miss an account and make a second one for the same person. It compares
-- digits only and treats a bare ten digit number as a US one. Supabase keeps
-- numbers without the plus sign, so if two accounts ever hold the same digits
-- the one stored that way wins: it is the one a texted code would open. Then
-- the oldest. Only the service role may run it.
create or replace function public.castai_crew_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with want as (
    select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d
  ), asked as (
    select case when length(d) = 10 then '1' || d else d end as d from want
  ), have as (
    select u.id, u.created_at, u.phone, regexp_replace(u.phone, '[^0-9]', '', 'g') as d
    from auth.users u
    where u.phone is not null
  )
  select have.id
  from have, asked
  where length(asked.d) between 11 and 15
    and (case when length(have.d) = 10 then '1' || have.d else have.d end) = asked.d
  order by (have.phone = asked.d) desc, have.created_at asc, have.id asc
  limit 1
$$;

revoke all on function public.castai_crew_user_by_phone(text) from public;
revoke all on function public.castai_crew_user_by_phone(text) from anon;
revoke all on function public.castai_crew_user_by_phone(text) from authenticated;
grant execute on function public.castai_crew_user_by_phone(text) to service_role;

alter table public.castai_crew_settings enable row level security;
alter table public.castai_crew_invites enable row level security;
alter table public.castai_crew_trips enable row level security;
alter table public.castai_crew_trip_going enable row level security;
alter table public.castai_crew_comments enable row level security;
alter table public.castai_crew_list_items enable row level security;
alter table public.castai_crew_catches enable row level security;

revoke all on public.castai_crew_settings from anon;
revoke all on public.castai_crew_settings from authenticated;
revoke all on public.castai_crew_invites from anon;
revoke all on public.castai_crew_invites from authenticated;
revoke all on public.castai_crew_trips from anon;
revoke all on public.castai_crew_trips from authenticated;
revoke all on public.castai_crew_trip_going from anon;
revoke all on public.castai_crew_trip_going from authenticated;
revoke all on public.castai_crew_comments from anon;
revoke all on public.castai_crew_comments from authenticated;
revoke all on public.castai_crew_list_items from anon;
revoke all on public.castai_crew_list_items from authenticated;
revoke all on public.castai_crew_catches from anon;
revoke all on public.castai_crew_catches from authenticated;
