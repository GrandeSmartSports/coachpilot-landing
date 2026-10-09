-- CoachPilot spine. Additive only. Prefix cp_. Spec: docs/superpowers/specs/2026-10-08-coachpilot-spine-design.md
create extension if not exists citext;

create table if not exists cp_people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email citext not null unique,
  name text not null default '',
  phone text,
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists cp_leagues (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  short_name text not null default '',
  sports text[] not null default '{}',
  timezone text not null default 'America/Los_Angeles',
  settings jsonb not null default '{"schema_version":1}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists cp_teams (
  id uuid primary key default gen_random_uuid(),
  league_id uuid references cp_leagues(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  sport text not null,
  age_min int not null check (age_min between 3 and 19),
  age_max int not null check (age_max between 3 and 19 and age_max >= age_min),
  season_label text not null,
  settings jsonb not null default '{"schema_version":1}'::jsonb,
  source_flm_team_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists cp_teams_league_slug on cp_teams(league_id, slug) where league_id is not null;
create unique index if not exists cp_teams_standalone_slug on cp_teams(slug) where league_id is null;

create table if not exists cp_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references cp_people(id) on delete cascade,
  league_id uuid references cp_leagues(id) on delete cascade,
  team_id uuid references cp_teams(id) on delete cascade,
  season_label text,
  role text not null check (role in ('platform_admin','league_admin','league_scheduler','head_coach','assistant_coach','guardian')),
  status text not null default 'invited' check (status in ('invited','active','ended')),
  invited_by uuid references cp_people(id),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  ended_at timestamptz,
  constraint cp_memberships_scope check (
    (role = 'platform_admin' and league_id is null and team_id is null) or
    (role in ('league_admin','league_scheduler') and league_id is not null and team_id is null) or
    (role in ('head_coach','assistant_coach','guardian') and team_id is not null and league_id is null)
  )
);
create index if not exists cp_memberships_person on cp_memberships(person_id);
create index if not exists cp_memberships_team on cp_memberships(team_id);
create index if not exists cp_memberships_league on cp_memberships(league_id);

create table if not exists cp_players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references cp_teams(id) on delete cascade,
  season_label text not null,
  first_name text not null,
  last_name text not null default '',
  birthdate date,
  jersey text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists cp_players_team on cp_players(team_id);

create table if not exists cp_guardians (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references cp_players(id) on delete cascade,
  person_id uuid not null references cp_people(id) on delete cascade,
  relationship text not null default 'parent' check (relationship in ('parent','grandparent','other')),
  is_primary boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved')),
  approved_by uuid references cp_people(id),
  created_at timestamptz not null default now(),
  unique (player_id, person_id)
);

create table if not exists cp_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  email citext not null,
  role text not null check (role in ('league_admin','league_scheduler','head_coach','assistant_coach','guardian')),
  league_id uuid references cp_leagues(id) on delete cascade,
  team_id uuid references cp_teams(id) on delete cascade,
  player_id uuid references cp_players(id) on delete cascade,
  invited_by uuid not null references cp_people(id),
  expires_at timestamptz not null default now() + interval '30 days',
  sent_at timestamptz,
  accepted_at timestamptz,
  attempts int not null default 0,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint cp_invites_scope check (
    (role in ('league_admin','league_scheduler') and league_id is not null and team_id is null and player_id is null) or
    (role in ('head_coach','assistant_coach') and team_id is not null and player_id is null) or
    (role = 'guardian' and team_id is not null and player_id is not null)
  )
);
create index if not exists cp_invites_team on cp_invites(team_id);
create index if not exists cp_invites_email on cp_invites(email);

create table if not exists cp_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into cp_settings(key, value) values
  ('email_enabled', 'false'::jsonb),
  ('push_enabled', 'false'::jsonb),
  ('self_create_teams', 'false'::jsonb)
on conflict (key) do nothing;

create table if not exists cp_audit (
  id bigint generated always as identity primary key,
  actor_person_id uuid,
  action text not null,
  subject_table text,
  subject_id uuid,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cp_audit_subject on cp_audit(subject_table, subject_id);

-- Helpers. SECURITY DEFINER so policies can read cp_memberships without recursion.
create or replace function cp_my_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from cp_people where auth_user_id = auth.uid() limit 1;
$$;

create or replace function cp_is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cp_memberships m where m.person_id = cp_my_person_id() and m.role = 'platform_admin' and m.status = 'active');
$$;

create or replace function cp_is_league_member(p_league uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cp_memberships m where m.person_id = cp_my_person_id() and m.league_id = p_league and m.status = 'active' and m.role = any(p_roles));
$$;

create or replace function cp_team_league(p_team uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select league_id from cp_teams where id = p_team;
$$;

create or replace function cp_is_team_member(p_team uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cp_memberships m where m.person_id = cp_my_person_id() and m.team_id = p_team and m.status = 'active' and m.role = any(p_roles))
      or cp_is_league_member(cp_team_league(p_team), array['league_admin']);
$$;

create or replace function cp_is_guardian_of(p_player uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cp_guardians g where g.person_id = cp_my_person_id() and g.player_id = p_player and g.status = 'approved');
$$;

create or replace function cp_player_team(p_player uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from cp_players where id = p_player;
$$;

-- Link a new auth user to its person row by email (invite-only: the person row exists first).
create or replace function cp_link_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update cp_people set auth_user_id = new.id, updated_at = now() where lower(email::text) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
drop trigger if exists cp_link_auth_user_trg on auth.users;
create trigger cp_link_auth_user_trg after insert on auth.users for each row execute function cp_link_auth_user();

-- Hats for /me. Security barrier view: only the caller's own memberships.
create or replace view cp_my_hats with (security_invoker = true) as
  select m.id as membership_id, m.role, m.status, m.season_label,
         l.id as league_id, l.slug as league_slug, l.name as league_name, l.settings as league_settings,
         t.id as team_id, t.slug as team_slug, t.name as team_name, t.settings as team_settings, t.league_id as team_league_id
  from cp_memberships m
  left join cp_leagues l on l.id = m.league_id
  left join cp_teams t on t.id = m.team_id
  where m.person_id = cp_my_person_id();

-- RLS. No anon policies anywhere.
alter table cp_people enable row level security;
alter table cp_leagues enable row level security;
alter table cp_teams enable row level security;
alter table cp_memberships enable row level security;
alter table cp_players enable row level security;
alter table cp_guardians enable row level security;
alter table cp_invites enable row level security;
alter table cp_settings enable row level security;
alter table cp_audit enable row level security;

-- people: self, platform admin, and anyone who shares a team/league with you (name + email only is enforced by the view below; contact is head_coach-scoped in Task 6 pages, see policy)
create policy cp_people_self on cp_people for select to authenticated using (auth_user_id = auth.uid() or cp_is_platform_admin());
create policy cp_people_self_update on cp_people for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());
create policy cp_people_team_staff on cp_people for select to authenticated using (
  exists (select 1 from cp_memberships m where m.person_id = cp_people.id and m.team_id is not null and cp_is_team_member(m.team_id, array['head_coach','assistant_coach']))
  or exists (select 1 from cp_guardians g where g.person_id = cp_people.id and cp_is_team_member(cp_player_team(g.player_id), array['head_coach']))
  or exists (select 1 from cp_memberships m where m.person_id = cp_people.id and m.league_id is not null and cp_is_league_member(m.league_id, array['league_admin']))
);

-- leagues: members of the league, platform admin
create policy cp_leagues_read on cp_leagues for select to authenticated using (
  cp_is_platform_admin() or cp_is_league_member(id, array['league_admin','league_scheduler'])
  or exists (select 1 from cp_teams t where t.league_id = cp_leagues.id and (cp_is_team_member(t.id, array['head_coach','assistant_coach']) or exists (select 1 from cp_players p where p.team_id = t.id and cp_is_guardian_of(p.id))))
);
create policy cp_leagues_admin_update on cp_leagues for update to authenticated using (cp_is_platform_admin() or cp_is_league_member(id, array['league_admin'])) with check (cp_is_platform_admin() or cp_is_league_member(id, array['league_admin']));

-- teams
create policy cp_teams_read on cp_teams for select to authenticated using (
  cp_is_platform_admin() or cp_is_team_member(id, array['head_coach','assistant_coach'])
  or (league_id is not null and cp_is_league_member(league_id, array['league_admin','league_scheduler']))
  or exists (select 1 from cp_players p where p.team_id = cp_teams.id and cp_is_guardian_of(p.id))
);
create policy cp_teams_coach_update on cp_teams for update to authenticated using (cp_is_team_member(id, array['head_coach'])) with check (cp_is_team_member(id, array['head_coach']));
create policy cp_teams_league_insert on cp_teams for insert to authenticated with check (cp_is_platform_admin() or (league_id is not null and cp_is_league_member(league_id, array['league_admin'])));

-- memberships: your own; team staff see team memberships; league admin sees league + its teams
create policy cp_memberships_read on cp_memberships for select to authenticated using (
  person_id = cp_my_person_id() or cp_is_platform_admin()
  or (team_id is not null and cp_is_team_member(team_id, array['head_coach','assistant_coach']))
  or (league_id is not null and cp_is_league_member(league_id, array['league_admin']))
);

-- players: team staff, league admin, approved guardians of that player
create policy cp_players_read on cp_players for select to authenticated using (
  cp_is_team_member(team_id, array['head_coach','assistant_coach']) or cp_is_guardian_of(id)
);
create policy cp_players_coach_write on cp_players for all to authenticated using (cp_is_team_member(team_id, array['head_coach'])) with check (cp_is_team_member(team_id, array['head_coach']));

-- guardians: head coach of the team, the guardian themself, other approved guardians of the same kid
create policy cp_guardians_read on cp_guardians for select to authenticated using (
  person_id = cp_my_person_id() or cp_is_guardian_of(player_id) or cp_is_team_member(cp_player_team(player_id), array['head_coach'])
);

-- invites: creator, team head coach, league admin. Writes only through cp-gateway.
create policy cp_invites_read on cp_invites for select to authenticated using (
  invited_by = cp_my_person_id() or cp_is_platform_admin()
  or (team_id is not null and cp_is_team_member(team_id, array['head_coach']))
  or (league_id is not null and cp_is_league_member(league_id, array['league_admin']))
);

-- settings: readable by any signed-in user (flags only), writable by nobody but service role
create policy cp_settings_read on cp_settings for select to authenticated using (true);

-- audit: platform admin reads all; head coach reads rows about their team's invites and players
create policy cp_audit_read on cp_audit for select to authenticated using (
  cp_is_platform_admin()
  or (subject_table = 'cp_invites' and exists (select 1 from cp_invites i where i.id = cp_audit.subject_id and i.team_id is not null and cp_is_team_member(i.team_id, array['head_coach'])))
  or (subject_table = 'cp_players' and exists (select 1 from cp_players p where p.id = cp_audit.subject_id and cp_is_team_member(p.team_id, array['head_coach'])))
);

grant select on cp_my_hats to authenticated;
