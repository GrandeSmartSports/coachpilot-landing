-- BLS Website Build board (spec: ~/Workspace/ops/bls-website/board-hub-spec.md, 2026-11-03).
-- One shared link for everyone: no tokens, no passwords. People pick a name from bls_board_people.
-- Gateway-only: RLS on every table, no anon/authenticated policies. Only the bls-board edge function
-- (service role) reads or writes these tables.
-- The admin PIN row (bls_board_settings key admin_pin) is seeded out of band, never in this public repo.
-- Idempotent: safe to re-run.

create table if not exists bls_board_phases (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  target_date date null,
  note text null check (note is null or char_length(note) <= 500),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists bls_board_pages (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  title text not null check (char_length(title) between 1 and 120),
  state text not null default 'review'
    check (state in ('building', 'waiting', 'review', 'ready', 'hold', 'scheduled', 'live')),
  phase_id uuid null references bls_board_phases(id) on delete set null,
  ready_deadline timestamptz null,
  hold_remaining_ms bigint null check (hold_remaining_ms is null or hold_remaining_ms >= 0),
  due_date date null,
  live_since date null,
  live_url text null check (live_url is null or char_length(live_url) <= 500),
  note text null check (note is null or char_length(note) <= 500),
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  -- A running clock only exists on a Ready page; a frozen clock only on an On hold page.
  constraint bls_board_pages_ready_clock check ((state = 'ready') = (ready_deadline is not null)),
  constraint bls_board_pages_hold_clock check (hold_remaining_ms is null or state = 'hold')
);
create index if not exists bls_board_pages_phase_idx on bls_board_pages (phase_id);

create table if not exists bls_board_people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  role text not null default '' check (char_length(role) <= 120),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists bls_board_people_name_key on bls_board_people (lower(name));

create table if not exists bls_board_items (
  id uuid primary key default gen_random_uuid(),
  slug text null references bls_board_pages(slug) on delete cascade,
  kind text not null check (kind in ('comment', 'suggestion', 'concern', 'approve', 'help', 'private')),
  body text not null default '' check (char_length(body) <= 4000),
  author_name text not null check (char_length(author_name) between 2 and 80),
  author_role text null check (author_role is null or char_length(author_role) <= 120),
  is_admin boolean not null default false,
  parent_id uuid null references bls_board_items(id) on delete cascade,
  variant text null check (variant is null or variant in ('today', 'proposed')),
  pin_x real null check (pin_x is null or (pin_x >= 0 and pin_x <= 100)),
  pin_y real null check (pin_y is null or (pin_y >= 0 and pin_y <= 100)),
  req_item text null check (req_item is null or char_length(req_item) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'accepted', 'declined')),
  resolution_note text null check (resolution_note is null or char_length(resolution_note) <= 2000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  constraint bls_board_items_pin_pair check ((pin_x is null) = (pin_y is null)),
  constraint bls_board_items_approve_slug check (kind <> 'approve' or slug is not null)
);
create index if not exists bls_board_items_slug_idx on bls_board_items (slug, created_at desc);
create index if not exists bls_board_items_created_idx on bls_board_items (created_at desc);
create index if not exists bls_board_items_parent_idx on bls_board_items (parent_id);
-- One approval per person per page (lowercased name key); tapping again deletes the row.
create unique index if not exists bls_board_items_one_approval
  on bls_board_items (slug, lower(author_name)) where kind = 'approve' and not hidden;

create table if not exists bls_board_events (
  id bigserial primary key,
  slug text null,
  kind text not null,
  detail text not null default '',
  actor text not null default '',
  item_id uuid null references bls_board_items(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists bls_board_events_created_idx on bls_board_events (created_at desc);
create index if not exists bls_board_events_item_idx on bls_board_events (item_id);

create table if not exists bls_board_settings (
  key text primary key,
  value text not null default ''
);

alter table bls_board_phases enable row level security;
alter table bls_board_pages enable row level security;
alter table bls_board_people enable row level security;
alter table bls_board_items enable row level security;
alter table bls_board_events enable row level security;
alter table bls_board_settings enable row level security;
revoke all on bls_board_phases, bls_board_pages, bls_board_people, bls_board_items, bls_board_events, bls_board_settings
  from anon, authenticated;
revoke all on sequence bls_board_events_id_seq from anon, authenticated;

-- Settings: cron key is random (never in the repo). last_digest_* drive the 6 PM Pacific digest.
insert into bls_board_settings (key, value)
  values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;
insert into bls_board_settings (key, value) values ('last_digest_at', now()::text) on conflict (key) do nothing;
insert into bls_board_settings (key, value) values ('last_digest_day', '') on conflict (key) do nothing;

-- Phases.
insert into bls_board_phases (name, sort)
  select v.name, v.sort from (values ('Phase 1', 1), ('Phase 2', 2)) as v(name, sort)
  where not exists (select 1 from bls_board_phases p where p.name = v.name);

-- Pages, from bls/preview/pages.json (17 slugs, in file order). All start in Board review.
insert into bls_board_pages (slug, title, state, sort) values
  ('home', 'Home', 'review', 1),
  ('registration', 'Registration Info', 'review', 2),
  ('volunteer', 'Volunteer Opportunities', 'review', 3),
  ('corpmatch', 'Corporate Match', 'review', 4),
  ('sponsorship', 'Sponsorship Opportunities', 'review', 5),
  ('allstars', 'Allstars', 'review', 6),
  ('fallball', 'Fall Ball', 'review', 7),
  ('coaches', 'Coaches Corner', 'review', 8),
  ('faq', 'FAQ', 'review', 9),
  ('health', 'Health & Safety', 'review', 10),
  ('board', 'Board Members', 'review', 11),
  ('calendar', 'Calendar', 'review', 12),
  ('champions', 'Champions', 'review', 13),
  ('fields', 'Fields', 'review', 14),
  ('umpires', 'Umpires', 'review', 15),
  ('runbook', 'Coach Run Book', 'review', 16),
  ('schedules', 'Schedules & Scores', 'review', 17)
on conflict (slug) do nothing;

-- Roster for the "Who are you?" picker, in spec order.
insert into bls_board_people (name, role, sort) values
  ('Ramey Harguess', 'President', 1),
  ('Alexis Ramos', 'President 2024-26', 2),
  ('Jeremy Olsen', 'VP of Baseball', 3),
  ('Luke Kress', 'VP of Softball', 4),
  ('Dan Swagman', 'Treasurer', 5),
  ('Tawnie LaValley', 'Secretary', 6),
  ('Jason Guertin', 'League Player Agent', 7),
  ('Rod Vincent', 'Coaching Coordinator', 8),
  ('Daneen Galvez', 'Safety Officer', 9),
  ('Ashley Gauthier', 'Sponsorship and Fundraising', 10),
  ('Katie Sloan', 'Donations', 11),
  ('Daniel Lane', 'Fields Coordinator and Equipment', 12),
  ('Greg Potts', 'Field Rentals Coordinator', 13),
  ('Melissa Olsen', 'Information Officer', 14),
  ('Dena Berkey', 'Uniforms and Social Media', 15)
on conflict ((lower(name))) do nothing;
