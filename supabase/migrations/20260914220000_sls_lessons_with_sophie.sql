-- Lessons with Sophie — request-driven lesson scheduler.
-- Prefix: sls_ (Sophie Lesson Scheduler). CoachPilot project. Registered in
-- ~/Workspace/ops/BACKEND-CONTRACT.md.
-- RLS locked down on every table: enabled, zero policies. All access goes
-- through the sls-gateway edge function (service role), matching the
-- flm_/cougars_ pattern (loose RLS is the known empire bug — do not repeat it).

create table if not exists sls_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table sls_settings enable row level security;

create table if not exists sls_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table sls_locations enable row level security;

create table if not exists sls_clients (
  id uuid primary key default gen_random_uuid(),
  parent_name text not null,
  parent_phone text,
  parent_email text not null,
  athletes jsonb not null default '[]'::jsonb, -- [{name, age}]
  how_found text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sls_clients enable row level security;
create unique index if not exists sls_clients_email_uq on sls_clients (lower(parent_email));
create index if not exists sls_clients_phone_idx on sls_clients (parent_phone) where parent_phone is not null;

create table if not exists sls_recurring (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references sls_clients(id) on delete cascade,
  athlete_name text not null,
  weekday int not null check (weekday between 0 and 6), -- 0=Sunday
  start_time time not null,
  duration_minutes int not null default 60,
  location_id uuid references sls_locations(id),
  starts_on date not null,
  ends_on date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table sls_recurring enable row level security;

create table if not exists sls_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references sls_clients(id) on delete cascade,
  is_new_client boolean not null default false,
  athlete_name text not null,
  athlete_age text,
  focus_notes text,
  parent_name text not null,
  parent_phone text,
  parent_email text not null,
  how_found text,
  proposed_times jsonb not null default '[]'::jsonb, -- array of ISO timestamps (UTC)
  status text not null default 'pending' check (status in ('pending','countered','accepted','declined','expired','cancelled')),
  counter_time timestamptz,
  decline_message text,
  reschedule_of_session_id uuid,
  session_id uuid,
  expires_at timestamptz not null default (now() + interval '48 hours'),
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sls_requests enable row level security;
create index if not exists sls_requests_status_idx on sls_requests (status);

create table if not exists sls_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references sls_clients(id) on delete cascade,
  athlete_name text not null,
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  location_id uuid references sls_locations(id),
  source text not null check (source in ('request','direct','recurring')),
  request_id uuid references sls_requests(id),
  recurring_id uuid references sls_recurring(id),
  status text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  notes text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table sls_sessions enable row level security;
create index if not exists sls_sessions_starts_idx on sls_sessions (starts_at);
create index if not exists sls_sessions_status_idx on sls_sessions (status);

alter table sls_requests
  add constraint sls_requests_session_fk foreign key (session_id) references sls_sessions(id);
alter table sls_requests
  add constraint sls_requests_reschedule_fk foreign key (reschedule_of_session_id) references sls_sessions(id);

create table if not exists sls_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  purpose text not null check (purpose in ('login','counter_accept','counter_decline','session_cancel','session_reschedule')),
  client_id uuid references sls_clients(id) on delete cascade,
  request_id uuid references sls_requests(id) on delete cascade,
  session_id uuid references sls_sessions(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table sls_tokens enable row level security;
create index if not exists sls_tokens_token_idx on sls_tokens (token);

create table if not exists sls_push_subs (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table sls_push_subs enable row level security;

-- Seed: admin PIN (not hardcoded in the gateway source, rotatable like flm_settings.admin_pin).
insert into sls_settings (key, value) values ('admin_pin', '7492')
  on conflict (key) do nothing;
insert into sls_settings (key, value) values ('cron_key', encode(gen_random_bytes(18), 'hex'))
  on conflict (key) do nothing;

-- Seed: Coach as an existing/returning client with two athlete placeholders.
insert into sls_clients (parent_name, parent_phone, parent_email, athletes, how_found)
values (
  'Daniel Grande',
  null,
  'daniel.grande@ymail.com',
  '[{"name":"Daughter 1","age":""},{"name":"Daughter 2","age":""}]'::jsonb,
  'Seed data'
)
on conflict (lower(parent_email)) do nothing;
