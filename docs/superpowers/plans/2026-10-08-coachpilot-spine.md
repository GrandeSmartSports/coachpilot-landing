# CoachPilot Spine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the CoachPilot spine: `cp_` tables with database-enforced walls, email-code sign-in, the invite chain, per-league branding, the `/me` page, and a read-only mirror of BLS and the Cougars, all sealed off (email and push disabled) and unlinked from any public page.

**Architecture:** New `cp_` tables in the CoachPilot Supabase project (`geigvuysptjvvqanumld`) guarded by row-level security keyed on `cp_memberships` and `cp_guardians` through `auth.uid()`. Plain HTML pages under `cp/` talk to the database with `supabase-js` and the anon key; RLS is the wall. One edge function, `cp-gateway`, holds the service role for the few privileged jobs (creating auth users on invite accept, sending invites, approving guardians, creating leagues). Vercel rewrites give the pages their public paths (`/me`, `/join/<token>`, `/l/<league>`, `/t/<team>`).

**Tech Stack:** Supabase (Postgres 17, Auth email OTP, Edge Functions on Deno, `jsr:@supabase/supabase-js@2`), `@supabase/supabase-js@2` UMD from jsDelivr in the browser, vanilla HTML/CSS/JS, Node 24 test scripts (`node tests/*.mjs`), Vercel static hosting (repo `coachpilot-landing`, push to `main` deploys coachpilot.org), Supabase CLI 2.75 (linked to the project; `supabase/.temp/project-ref`).

**Spec:** `docs/superpowers/specs/2026-10-08-coachpilot-spine-design.md`

## Global Constraints

- Every new table, function, policy and bucket is prefixed `cp_`. Nothing in `flm_`, `cougars_`, `ondeck_`, `sls_`, `cac_` is altered. Migrations contain only `create`/`alter` statements on `cp_` objects (plus `create extension if not exists citext`).
- No page under `cp/` is linked from any existing page. `vercel.json` gains rewrites only; no existing redirect or rewrite changes.
- `cp_settings`: `email_enabled=false`, `push_enabled=false`, `self_create_teams=false` at launch. Every send path reads the flag at call time; when false it writes a `cp_audit` row with `action='email_suppressed'` and sends nothing.
- No em dashes, en dashes, or curly quotes anywhere in `cp/`, `supabase/functions/cp-gateway/`, `tests/cp.*.mjs`, or copy strings. The smoke test fails the build on U+2013, U+2014, U+2015, U+2018, U+2019, U+201C, U+201D.
- No emoji in product UI. Inline SVG only.
- Phone first: `cp/` pages render on a 400px viewport with no horizontal scroll; bottom tab bar on phone, same DOM on desktop.
- Secrets never enter the repo. The service role key is read from the environment variable `CP_SERVICE_ROLE_KEY` by scripts and tests; the anon key and project URL are the only values inlined in pages (they are public by design).
- Test data is tagged with the league slug `zz-cp-test` and removed at the end of every test run, even on failure (`finally`).
- Commit after every task. Run `node tests/cp.smoke.mjs` and the task's own test before each commit; `touch ~/.tests-passed` only after they pass.
- Every migration is applied with `supabase db push --linked` after a `--dry-run`, from the repo root, and the migration file is committed in the same commit as the code that depends on it.

## Review Focus

1. **A guardian invite for the wrong kid.** A coach sends a guardian invite with a `player_id` on another team. Expected: `invite_create` rejects with 403 and nothing is written. Test added to Task 4 (gateway).
2. **Birthdate claim brute force.** Three wrong birthdates on `/join/<token>` must lock the invite (`cp_invites.locked_at`) and write an audit row the coach can see. Expected: fourth attempt returns 423. Test added to Task 4.
3. **Expired or already-accepted invite.** `/join/<token>` with `expires_at < now()` or `accepted_at not null`. Expected: 410 with a plain message, no account created, no membership flipped. Test added to Task 4.
4. **Same person, two emails.** A coach invited at `luke@gmail.com` who already exists as `luke.kress@gmail.com`. Expected: a second `cp_people` row is created (email is the key); the mirror report and the admin roster surface duplicates by name so a human can merge later. No automatic merge. Test added to Task 3 (RLS suite checks that two people rows cannot read each other's memberships).
5. **Settings box with unknown or missing keys.** A league box from an older `schema_version`, or a hand-edited box missing `colors`. Expected: pages paint CoachPilot defaults for missing keys and never throw. Test added to Task 6 (`cp-core` unit test).

---

## File Structure

Create:
- `supabase/migrations/20261009000000_cp_spine.sql` schema, helpers, RLS, seed
- `supabase/functions/cp-gateway/index.ts` privileged actions
- `supabase/functions/cp-gateway/DEPLOY.md` deploy command and why `--no-verify-jwt` is used here
- `cp/cp-core.js` browser module: client, session, box loading and painting, hats, fetch helper
- `cp/cp.css` shared styles and theme tokens
- `cp/signin.html` email + code
- `cp/me.html` the `/me` page
- `cp/join.html` invite acceptance
- `cp/league.html` league home (gated placeholder)
- `cp/team.html` team home: roster with invite state and resend
- `cp/settings.html` league settings box editor
- `cp/defaults.json` default settings box
- `scripts/cp-mirror-bls.mjs` one-time mirror + report
- `scripts/cp-division-ages.json` BLS division to age band map
- `tests/cp.smoke.mjs` static + live read-only checks
- `tests/cp.rls.mjs` four-user access matrix
- `tests/cp.gateway.mjs` gateway action tests
- `tests/cp-core.test.mjs` unit tests for `cp-core.js` pure functions

Modify:
- `vercel.json` add rewrites (append only)
- `~/Workspace/ops/BACKEND-CONTRACT.md` register the `cp_` prefix (outside repo, Task 1)

---

### Task 1: Register the prefix and write the schema migration

**Files:**
- Create: `supabase/migrations/20261009000000_cp_spine.sql`
- Create: `tests/cp.smoke.mjs` (first checks only; later tasks extend it)
- Modify: `~/Workspace/ops/BACKEND-CONTRACT.md` (append one line to the prefix registry)

**Interfaces:**
- Produces: tables `cp_people`, `cp_leagues`, `cp_teams`, `cp_memberships`, `cp_players`, `cp_guardians`, `cp_invites`, `cp_settings`, `cp_audit`; SQL helpers `cp_my_person_id()`, `cp_is_platform_admin()`, `cp_is_league_member(uuid, text[])`, `cp_is_team_member(uuid, text[])`, `cp_is_guardian_of(uuid)`; view `cp_my_hats`.

- [ ] **Step 1: Register the prefix**

Append to the prefix registry table in `~/Workspace/ops/BACKEND-CONTRACT.md`:

```
| cp_ | CoachPilot spine (people, leagues, teams, memberships, players, guardians, invites, settings, audit) | geigvuysptjvvqanumld | RLS on every table, no anon policy; cp-gateway holds service role | 2026-10-09 |
```

- [ ] **Step 2: Write the failing smoke check**

Create `tests/cp.smoke.mjs`:

```js
#!/usr/bin/env node
// CoachPilot spine smoke test. Read-only against production. Run: node tests/cp.smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const ANON = 'sb_publishable_REPLACE_WITH_PROJECT_ANON_KEY';
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const section = (n) => console.log('\n' + n);

section('schema: cp_ tables exist and reject anonymous reads');
const TABLES = ['cp_people','cp_leagues','cp_teams','cp_memberships','cp_players','cp_guardians','cp_invites','cp_settings','cp_audit'];
for (const t of TABLES) {
  const r = await fetch(`${URL_}/rest/v1/${t}?select=id&limit=1`, { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  if (r.status === 404) { fail(`${t} missing (404)`); continue; }
  const body = await r.json().catch(() => null);
  if (r.status === 200 && Array.isArray(body) && body.length === 0) ok(`${t} exists, anon sees 0 rows`);
  else if (r.status === 401 || r.status === 403) ok(`${t} exists, anon rejected ${r.status}`);
  else fail(`${t} unexpected ${r.status} ${JSON.stringify(body).slice(0,80)}`);
}

section('copy hygiene: no em/en dashes or curly quotes in cp surfaces');
const BAD = /[–—―‘’“”]/;
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (/\.(html|js|css|ts|mjs|json|md)$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = [...walk(path.join(ROOT, 'cp')), ...walk(path.join(ROOT, 'supabase', 'functions', 'cp-gateway')), ...fs.readdirSync(path.join(ROOT, 'tests')).filter(f => f.startsWith('cp')).map(f => path.join(ROOT, 'tests', f))];
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8');
  const m = txt.match(BAD);
  if (m) fail(`${path.relative(ROOT, f)} contains U+${m[0].codePointAt(0).toString(16).toUpperCase()}`); else ok(`${path.relative(ROOT, f)} clean`);
}

console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
```

Replace `ANON` with the project's anon key (read it with the Supabase MCP `get_publishable_keys`; it is public by design and already inlined in `fields/index.html`'s sibling pages).

- [ ] **Step 3: Run it to see the tables are missing**

Run: `node tests/cp.smoke.mjs`
Expected: nine `FAIL ... missing (404)` lines, exit 1.

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20261009000000_cp_spine.sql`:

```sql
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
```

- [ ] **Step 5: Dry run, then push**

Run from the repo root:
```bash
supabase db push --linked --dry-run
```
Expected: lists exactly one new migration `20261009000000_cp_spine.sql`.
```bash
supabase db push --linked
```
Expected: `Applying migration 20261009000000_cp_spine.sql... Finished supabase db push.`
If `db push` reports the earlier `sls_` migrations as unapplied, stop and run `supabase migration repair --status applied <version>` for each of those four (they were applied via MCP), then push again.

- [ ] **Step 6: Run the smoke check**

Run: `node tests/cp.smoke.mjs`
Expected: nine `PASS ... anon sees 0 rows` (or `anon rejected`) lines, exit 0.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261009000000_cp_spine.sql tests/cp.smoke.mjs
touch ~/.tests-passed
git commit -m "cp spine: schema, helpers, RLS, settings seed"
```

---

### Task 2: Auth configuration for email codes

**Files:**
- Create: `supabase/functions/cp-gateway/DEPLOY.md` (first section: auth settings record)
- Test: manual check recorded in DEPLOY.md, plus `tests/cp.gateway.mjs` in Task 4 proves OTP-less sessions via admin link

**Interfaces:**
- Produces: Supabase Auth configured so `signInWithOtp({ email, options: { shouldCreateUser: false } })` sends a 6-digit code from `noreply@coachpilot.org`.

- [ ] **Step 1: Check current auth config**

Use the Supabase MCP `get_project` and the dashboard (Authentication > Providers > Email, Authentication > Email Templates, Project Settings > Auth > SMTP). Record in `DEPLOY.md`:

```markdown
# cp-gateway deploy and auth notes

## Auth settings (checked 2026-10-09)
- Email provider: enabled. "Confirm email": on. "Secure email change": on.
- Sign-ups: DISABLED project-wide (set 2026-09-17 for OnDeck invite-only). The spine relies on this: accounts are created only by cp-gateway invite_accept with the admin API.
- OTP length: 6. OTP expiry: 600 seconds.
- Custom SMTP: Resend, sender "CoachPilot <noreply@coachpilot.org>". Host smtp.resend.com, port 465, user "resend", password = Resend API key from ~/.cortex/credentials.md (never in repo).
- Magic Link template body must include {{ .Token }} so the email carries the 6-digit code.
```

- [ ] **Step 2: Configure what is missing**

If custom SMTP is not set on the CoachPilot project, set it in the dashboard with the values above (Resend account per `reference-coachpilot-resend` memory). If the Magic Link template does not contain `{{ .Token }}`, replace its body with:

```html
<p>Your CoachPilot sign-in code is:</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px;">{{ .Token }}</p>
<p>It expires in 10 minutes. If you did not request this, ignore this email.</p>
```

Subject: `Your CoachPilot sign-in code`.

- [ ] **Step 3: Verify with Coach's own email**

From a browser console on any coachpilot.org page (anon key inlined):
```js
const s = supabase.createClient('https://geigvuysptjvvqanumld.supabase.co', ANON);
await s.auth.signInWithOtp({ email: 'Daniel.Grande@ymail.com', options: { shouldCreateUser: false } });
```
Expected: `{ error: null }` and a code email lands in Coach's ymail within a minute. Record the Resend message id in DEPLOY.md. Do NOT run this for any email other than Coach's.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/cp-gateway/DEPLOY.md
touch ~/.tests-passed
git commit -m "cp spine: auth settings recorded, OTP template with code"
```

---

### Task 3: RLS test suite (four users, two leagues)

**Files:**
- Create: `tests/cp.rls.mjs`

**Interfaces:**
- Consumes: Task 1 tables and helpers. Env `CP_SERVICE_ROLE_KEY` (service role; from the dashboard, stored in `~/.cortex/credentials.md`, exported in the shell before running).
- Produces: a reusable harness `makeUser(email)` returning `{ client, personId, authId }` used by Task 4 tests.

- [ ] **Step 1: Write the test**

Create `tests/cp.rls.mjs`:

```js
#!/usr/bin/env node
// Access matrix for the cp_ spine. Creates a throwaway league 'zz-cp-test' with four users, asserts section 5 of the spec, then deletes everything.
// Run: CP_SERVICE_ROLE_KEY=... node tests/cp.rls.mjs
import { createClient } from '@supabase/supabase-js';

const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const ANON = 'sb_publishable_REPLACE_WITH_PROJECT_ANON_KEY';
const SRK = process.env.CP_SERVICE_ROLE_KEY;
if (!SRK) { console.error('CP_SERVICE_ROLE_KEY missing'); process.exit(2); }
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });

let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const section = (n) => console.log('\n' + n);
const TAG = 'zz-cp-test';
const created = { users: [], leagues: [] };

export async function makeUser(email) {
  const { data: u, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  created.users.push(u.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { error: vErr } = await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  if (vErr) throw vErr;
  const { data: person } = await admin.from('cp_people').upsert({ email, name: email.split('@')[0] }, { onConflict: 'email' }).select().single();
  await admin.from('cp_people').update({ auth_user_id: u.user.id }).eq('id', person.id);
  return { client, personId: person.id, authId: u.user.id, email };
}

async function cleanup() {
  for (const slug of [TAG, TAG + '-2']) await admin.from('cp_leagues').delete().eq('slug', slug);
  for (const id of created.users) await admin.auth.admin.deleteUser(id);
  await admin.from('cp_people').delete().like('email', '%@zz-cp-test.invalid');
}

try {
  section('setup');
  const { data: L1 } = await admin.from('cp_leagues').insert({ slug: TAG, name: 'ZZ Test League', short_name: 'ZZT', sports: ['softball'] }).select().single();
  const { data: L2 } = await admin.from('cp_leagues').insert({ slug: TAG + '-2', name: 'ZZ Other League', short_name: 'ZZO', sports: ['baseball'] }).select().single();
  const { data: T1 } = await admin.from('cp_teams').insert({ league_id: L1.id, slug: 'test-team', name: 'Test Team', sport: 'softball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  const { data: T2 } = await admin.from('cp_teams').insert({ league_id: L2.id, slug: 'other-team', name: 'Other Team', sport: 'baseball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  const { data: P1 } = await admin.from('cp_players').insert({ team_id: T1.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'One', birthdate: '2017-05-05' }).select().single();
  const { data: P2 } = await admin.from('cp_players').insert({ team_id: T2.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'Two', birthdate: '2017-06-06' }).select().single();

  const coach = await makeUser('coach@zz-cp-test.invalid');
  const asst = await makeUser('asst@zz-cp-test.invalid');
  const parent = await makeUser('parent@zz-cp-test.invalid');
  const stranger = await makeUser('stranger@zz-cp-test.invalid');
  const ladmin = await makeUser('ladmin@zz-cp-test.invalid');

  await admin.from('cp_memberships').insert([
    { person_id: coach.personId, team_id: T1.id, role: 'head_coach', status: 'active', season_label: 'Test 2026' },
    { person_id: asst.personId, team_id: T1.id, role: 'assistant_coach', status: 'active', season_label: 'Test 2026' },
    { person_id: parent.personId, team_id: T1.id, role: 'guardian', status: 'active', season_label: 'Test 2026' },
    { person_id: ladmin.personId, league_id: L1.id, role: 'league_admin', status: 'active' },
    { person_id: stranger.personId, team_id: T2.id, role: 'head_coach', status: 'active', season_label: 'Test 2026' },
  ]);
  await admin.from('cp_guardians').insert({ player_id: P1.id, person_id: parent.personId, is_primary: true, status: 'approved' });
  ok('fixtures created');

  const count = async (client, table, filter) => { let q = client.from(table).select('id', { count: 'exact', head: true }); if (filter) q = filter(q); const { count: c } = await q; return c ?? 0; };

  section('head coach');
  if (await count(coach.client, 'cp_players', q => q.eq('team_id', T1.id)) === 1) ok('sees own team players'); else fail('coach cannot see own players');
  if (await count(coach.client, 'cp_players', q => q.eq('team_id', T2.id)) === 0) ok('cannot see other league players'); else fail('coach leaked other league');
  if (await count(coach.client, 'cp_guardians') === 1) ok('sees guardians of own kids'); else fail('coach guardian visibility wrong');
  { const { error } = await coach.client.from('cp_players').update({ jersey: '7' }).eq('id', P1.id); if (!error) ok('can edit own roster'); else fail('coach cannot edit roster: ' + error.message); }
  { const { data } = await coach.client.from('cp_players').update({ jersey: '9' }).eq('id', P2.id).select(); if (!data || data.length === 0) ok('cannot edit other team roster'); else fail('coach edited other team'); }

  section('assistant coach');
  if (await count(asst.client, 'cp_players', q => q.eq('team_id', T1.id)) === 1) ok('sees roster'); else fail('assistant cannot see roster');
  if (await count(asst.client, 'cp_guardians') === 0) ok('cannot see guardian contact rows'); else fail('assistant sees guardians');
  { const { data } = await asst.client.from('cp_players').update({ jersey: '8' }).eq('id', P1.id).select(); if (!data || data.length === 0) ok('cannot edit roster'); else fail('assistant edited roster'); }

  section('guardian');
  if (await count(parent.client, 'cp_players') === 1) ok('sees only own kid'); else fail('guardian sees wrong number of kids');
  if (await count(parent.client, 'cp_memberships', q => q.eq('team_id', T1.id)) === 1) ok('sees only own membership, not staff list'); else fail('guardian sees staff memberships');
  if (await count(parent.client, 'cp_people') === 1) ok('sees only self in people'); else fail('guardian sees other people');

  section('league admin');
  if (await count(ladmin.client, 'cp_teams', q => q.eq('league_id', L1.id)) === 1) ok('sees league teams'); else fail('league admin cannot see teams');
  if (await count(ladmin.client, 'cp_players', q => q.eq('team_id', T1.id)) === 1) ok('sees rosters in league'); else fail('league admin cannot see rosters');
  if (await count(ladmin.client, 'cp_teams', q => q.eq('league_id', L2.id)) === 0) ok('cannot see other league'); else fail('league admin leaked other league');
  { const { error } = await ladmin.client.from('cp_leagues').update({ short_name: 'ZZT2' }).eq('id', L1.id); if (!error) ok('can edit own settings box'); else fail('league admin cannot edit box: ' + error.message); }

  section('stranger (coach in another league)');
  if (await count(stranger.client, 'cp_players', q => q.eq('team_id', T1.id)) === 0) ok('cannot see test team players'); else fail('stranger leaked players');
  if (await count(stranger.client, 'cp_leagues', q => q.eq('id', L1.id)) === 0) ok('cannot see test league'); else fail('stranger leaked league');
  if (await count(stranger.client, 'cp_invites') === 0) ok('cannot see invites'); else fail('stranger sees invites');

  section('anonymous');
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  if (await count(anon, 'cp_leagues') === 0) ok('anon sees nothing'); else fail('anon leaked leagues');

  section('hats view');
  { const { data } = await coach.client.from('cp_my_hats').select('*'); if (data && data.length === 1 && data[0].role === 'head_coach') ok('coach has one hat'); else fail('hats wrong: ' + JSON.stringify(data)); }

  section('two people rows with different emails stay separate');
  const dup = await makeUser('coach.alt@zz-cp-test.invalid');
  if (await count(dup.client, 'cp_memberships') === 0) ok('second email has no memberships of the first'); else fail('duplicate person leaked memberships');
} catch (e) {
  fail('exception: ' + (e.message || e));
} finally {
  await cleanup();
  console.log('\ncleanup done');
}
console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
```

Install the client for tests (dev dependency only):
```bash
npm install --save-dev @supabase/supabase-js@2
```

- [ ] **Step 2: Run it**

Run: `CP_SERVICE_ROLE_KEY=<key> node tests/cp.rls.mjs`
Expected: every line PASS, `cleanup done`, exit 0. If any FAIL, fix the policy in a new migration file `20261009000100_cp_rls_fix.sql` (never edit an applied migration), push, rerun.

- [ ] **Step 3: Commit**

```bash
git add tests/cp.rls.mjs package.json package-lock.json
touch ~/.tests-passed
git commit -m "cp spine: RLS access matrix test"
```

---

### Task 4: cp-gateway edge function

**Files:**
- Create: `supabase/functions/cp-gateway/index.ts`
- Modify: `supabase/functions/cp-gateway/DEPLOY.md` (append deploy section)
- Create: `tests/cp.gateway.mjs`

**Interfaces:**
- Consumes: Task 1 tables, Task 3 `makeUser` pattern (duplicated inline here; tests must be runnable standalone).
- Produces: HTTP `POST https://geigvuysptjvvqanumld.supabase.co/functions/v1/cp-gateway?action=<name>` with JSON body. Actions and shapes:
  - `invite_create` body `{ email, role, league_id?, team_id?, player_id? }` auth required. Returns `{ ok, invite: { id, token, email, role, expires_at } }`.
  - `invite_send` body `{ invite_id }` auth required. Returns `{ ok, sent: boolean, suppressed: boolean }`.
  - `invite_resend` same as send.
  - `invite_revoke` body `{ invite_id }`. Returns `{ ok }`.
  - `invite_lookup` body `{ token }` no auth. Returns `{ ok, invite: { email_masked, role, league_name?, team_name?, needs_birthdate } }` or 410.
  - `invite_accept` body `{ token, name?, birthdate? }` no auth. Creates auth user if needed, returns `{ ok, email }`; client then calls `signInWithOtp`.
  - `guardian_approve` body `{ guardian_id }` auth required (primary guardian or head coach).
  - `league_create` body `{ slug, name, short_name, sports }` platform admin only.
  - `mirror_status` no body, platform admin only. Returns last mirror report JSON from `cp_settings.mirror_report`.

- [ ] **Step 1: Write the failing gateway test**

Create `tests/cp.gateway.mjs`:

```js
#!/usr/bin/env node
// cp-gateway action tests against the deployed function, using a throwaway league. Run: CP_SERVICE_ROLE_KEY=... node tests/cp.gateway.mjs
import { createClient } from '@supabase/supabase-js';
const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const GW = URL_ + '/functions/v1/cp-gateway';
const ANON = 'sb_publishable_REPLACE_WITH_PROJECT_ANON_KEY';
const SRK = process.env.CP_SERVICE_ROLE_KEY;
if (!SRK) { console.error('CP_SERVICE_ROLE_KEY missing'); process.exit(2); }
const admin = createClient(URL_, SRK, { auth: { persistSession: false } });
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const section = (n) => console.log('\n' + n);
const TAG = 'zz-cp-test';
const users = [];

async function makeUser(email) {
  const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
  users.push(u.user.id);
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const client = createClient(URL_, ANON, { auth: { persistSession: false } });
  await client.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
  const { data: person } = await admin.from('cp_people').upsert({ email, name: email.split('@')[0] }, { onConflict: 'email' }).select().single();
  await admin.from('cp_people').update({ auth_user_id: u.user.id }).eq('id', person.id);
  const { data: s } = await client.auth.getSession();
  return { client, personId: person.id, token: s.session.access_token };
}
async function call(action, body, token) {
  const r = await fetch(`${GW}?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON, ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

try {
  section('setup');
  const { data: L1 } = await admin.from('cp_leagues').insert({ slug: TAG, name: 'ZZ Test League', short_name: 'ZZT', sports: ['softball'] }).select().single();
  const { data: T1 } = await admin.from('cp_teams').insert({ league_id: L1.id, slug: 'test-team', name: 'Test Team', sport: 'softball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  const { data: T2 } = await admin.from('cp_teams').insert({ league_id: L1.id, slug: 'test-team-2', name: 'Test Team 2', sport: 'softball', age_min: 8, age_max: 10, season_label: 'Test 2026' }).select().single();
  const { data: P1 } = await admin.from('cp_players').insert({ team_id: T1.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'One', birthdate: '2017-05-05' }).select().single();
  const { data: P2 } = await admin.from('cp_players').insert({ team_id: T2.id, season_label: 'Test 2026', first_name: 'Kid', last_name: 'Two', birthdate: '2017-06-06' }).select().single();
  const coach = await makeUser('coach@zz-cp-test.invalid');
  await admin.from('cp_memberships').insert({ person_id: coach.personId, team_id: T1.id, role: 'head_coach', status: 'active', season_label: 'Test 2026' });
  ok('fixtures');

  section('invite_create');
  { const r = await call('invite_create', { email: 'newparent@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P1.id }, coach.token);
    if (r.status === 200 && r.body.ok && r.body.invite.token) ok('coach creates guardian invite'); else fail('create failed ' + r.status + ' ' + JSON.stringify(r.body));
    globalThis.INV = r.body.invite; }
  { const r = await call('invite_create', { email: 'x@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P2.id }, coach.token);
    if (r.status === 403) ok('wrong-team player rejected 403'); else fail('wrong-team player accepted ' + r.status); }
  { const r = await call('invite_create', { email: 'x@zz-cp-test.invalid', role: 'head_coach', team_id: T1.id }, coach.token);
    if (r.status === 403) ok('coach cannot invite a head coach'); else fail('coach invited head coach ' + r.status); }
  { const r = await call('invite_create', { email: 'x@zz-cp-test.invalid', role: 'assistant_coach', team_id: T1.id });
    if (r.status === 401) ok('no auth rejected 401'); else fail('no auth accepted ' + r.status); }

  section('invite_send with email disabled');
  { const r = await call('invite_send', { invite_id: INV.id }, coach.token);
    if (r.status === 200 && r.body.suppressed === true && r.body.sent === false) ok('send suppressed by kill switch'); else fail('send not suppressed ' + JSON.stringify(r.body));
    const { data: a } = await admin.from('cp_audit').select('action').eq('subject_id', INV.id).eq('action', 'email_suppressed');
    if (a && a.length === 1) ok('suppression audited'); else fail('no audit row'); }

  section('invite_lookup and accept');
  { const r = await call('invite_lookup', { token: INV.token }); if (r.status === 200 && r.body.invite.needs_birthdate === true && r.body.invite.email_masked.includes('***')) ok('lookup masks email, asks birthdate'); else fail('lookup ' + r.status + JSON.stringify(r.body)); }
  { const r = await call('invite_lookup', { token: 'nope' }); if (r.status === 410) ok('bad token 410'); else fail('bad token ' + r.status); }
  for (let i = 0; i < 3; i++) { await call('invite_accept', { token: INV.token, name: 'New Parent', birthdate: '2000-01-01' }); }
  { const r = await call('invite_accept', { token: INV.token, name: 'New Parent', birthdate: '2017-05-05' }); if (r.status === 423) ok('locked after 3 wrong birthdates'); else fail('not locked ' + r.status); }
  { const { data: a } = await admin.from('cp_audit').select('action').eq('subject_id', INV.id).eq('action', 'invite_locked'); if (a && a.length === 1) ok('lock audited'); else fail('lock not audited'); }

  section('accept happy path');
  const { data: INV2 } = await admin.from('cp_invites').insert({ email: 'newparent2@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P1.id, invited_by: coach.personId }).select().single();
  { const r = await call('invite_accept', { token: INV2.token, name: 'Parent Two', birthdate: '2017-05-05' });
    if (r.status === 200 && r.body.ok && r.body.email === 'newparent2@zz-cp-test.invalid') ok('accepted'); else fail('accept ' + r.status + JSON.stringify(r.body));
    const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); const au = u.users.find(x => x.email === 'newparent2@zz-cp-test.invalid'); if (au) { users.push(au.id); ok('auth user created'); } else fail('no auth user');
    const { data: g } = await admin.from('cp_guardians').select('*').eq('player_id', P1.id); if (g && g.length === 1 && g[0].is_primary && g[0].status === 'approved') ok('first guardian primary + approved'); else fail('guardian row wrong ' + JSON.stringify(g));
    const { data: m } = await admin.from('cp_memberships').select('*').eq('team_id', T1.id).eq('role', 'guardian'); if (m && m.length === 1 && m[0].status === 'active') ok('guardian membership active'); else fail('membership wrong'); }
  { const r = await call('invite_accept', { token: INV2.token, name: 'Parent Two', birthdate: '2017-05-05' }); if (r.status === 410) ok('second accept 410'); else fail('re-accept ' + r.status); }

  section('second guardian pending until approved');
  const { data: INV3 } = await admin.from('cp_invites').insert({ email: 'grandma@zz-cp-test.invalid', role: 'guardian', team_id: T1.id, player_id: P1.id, invited_by: coach.personId }).select().single();
  await call('invite_accept', { token: INV3.token, name: 'Grandma', birthdate: '2017-05-05' });
  { const { data: u } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 }); const au = u.users.find(x => x.email === 'grandma@zz-cp-test.invalid'); if (au) users.push(au.id); }
  { const { data: g } = await admin.from('cp_guardians').select('*').eq('player_id', P1.id).eq('is_primary', false); if (g && g.length === 1 && g[0].status === 'pending') ok('second guardian pending'); else fail('second guardian ' + JSON.stringify(g));
    const r = await call('guardian_approve', { guardian_id: g[0].id }, coach.token); if (r.status === 200) ok('coach approved second guardian'); else fail('approve ' + r.status); }

  section('league_create');
  { const r = await call('league_create', { slug: TAG + '-x', name: 'X', short_name: 'X', sports: ['softball'] }, coach.token); if (r.status === 403) ok('non-admin cannot create league'); else fail('league_create ' + r.status); }
} catch (e) { fail('exception: ' + (e.message || e)); }
finally {
  await admin.from('cp_leagues').delete().like('slug', TAG + '%');
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await admin.from('cp_people').delete().like('email', '%@zz-cp-test.invalid');
  console.log('\ncleanup done');
}
console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to see the function is missing**

Run: `CP_SERVICE_ROLE_KEY=<key> node tests/cp.gateway.mjs`
Expected: `FAIL create failed 404` and the rest failing; cleanup done; exit 1.

- [ ] **Step 3: Write the gateway**

Create `supabase/functions/cp-gateway/index.ts`:

```ts
// cp-gateway v1. Privileged actions for the CoachPilot spine. Service role lives ONLY here.
// Deployed with --no-verify-jwt because invite_lookup and invite_accept run before an account exists;
// every other action verifies the caller's JWT itself via auth.getUser(token).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE = "https://coachpilot.org";

type Caller = { personId: string; authId: string; email: string };
async function caller(req: Request): Promise<Caller | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || token === ANON) return null;
  const anonClient = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await anonClient.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await db.from("cp_people").select("id,email").eq("auth_user_id", data.user.id).maybeSingle();
  if (!p) return null;
  return { personId: p.id, authId: data.user.id, email: p.email };
}
async function hasRole(personId: string, where: { team_id?: string; league_id?: string }, roles: string[]): Promise<boolean> {
  let q = db.from("cp_memberships").select("id", { count: "exact", head: true }).eq("person_id", personId).eq("status", "active").in("role", roles);
  if (where.team_id) q = q.eq("team_id", where.team_id);
  if (where.league_id) q = q.eq("league_id", where.league_id);
  const { count } = await q;
  return (count ?? 0) > 0;
}
async function isPlatformAdmin(personId: string) { return hasRole(personId, {}, ["platform_admin"]); }
async function leagueOfTeam(teamId: string): Promise<string | null> { const { data } = await db.from("cp_teams").select("league_id").eq("id", teamId).maybeSingle(); return data?.league_id ?? null; }
async function canManageTeam(personId: string, teamId: string): Promise<boolean> {
  if (await hasRole(personId, { team_id: teamId }, ["head_coach"])) return true;
  const lg = await leagueOfTeam(teamId);
  if (lg && await hasRole(personId, { league_id: lg }, ["league_admin"])) return true;
  return isPlatformAdmin(personId);
}
async function audit(actor: string | null, action: string, table: string | null, id: string | null, meta: Record<string, unknown> = {}) {
  await db.from("cp_audit").insert({ actor_person_id: actor, action, subject_table: table, subject_id: id, meta });
}
async function flag(key: string): Promise<boolean> { const { data } = await db.from("cp_settings").select("value").eq("key", key).maybeSingle(); return data?.value === true; }
const mask = (e: string) => { const [u, d] = e.split("@"); return (u.slice(0, 1) + "***") + "@" + d; };

async function sendInviteEmail(inv: { id: string; email: string; token: string; role: string }, actor: string): Promise<{ sent: boolean; suppressed: boolean }> {
  if (!(await flag("email_enabled"))) { await audit(actor, "email_suppressed", "cp_invites", inv.id, { to: inv.email }); return { sent: false, suppressed: true }; }
  const link = `${SITE}/join/${inv.token}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#222"><p>You have been invited to CoachPilot as ${inv.role.replace("_", " ")}.</p><p><a href="${link}" style="display:inline-block;background:#1F5F3F;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Accept invite</a></p><p>Or paste this link: ${link}</p><p>This invite expires in 30 days.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${RESEND_KEY}` }, body: JSON.stringify({ from: "CoachPilot <noreply@coachpilot.org>", to: inv.email, subject: "Your CoachPilot invite", html }) });
  const ok = r.ok;
  if (ok) await db.from("cp_invites").update({ sent_at: new Date().toISOString() }).eq("id", inv.id);
  await audit(actor, ok ? "invite_sent" : "invite_send_failed", "cp_invites", inv.id, { to: inv.email, status: r.status });
  return { sent: ok, suppressed: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const action = new URL(req.url).searchParams.get("action") || "";
  const body = await req.json().catch(() => ({}));

  // ---- public (pre-account) actions ----
  if (action === "invite_lookup") {
    const { data: inv } = await db.from("cp_invites").select("id,email,role,league_id,team_id,player_id,expires_at,accepted_at,locked_at").eq("token", String(body.token || "")).maybeSingle();
    if (!inv || inv.accepted_at || inv.locked_at || new Date(inv.expires_at) < new Date()) return json({ error: "This invite is no longer valid. Ask your coach to send a new one." }, 410);
    const { data: lg } = inv.league_id ? await db.from("cp_leagues").select("name").eq("id", inv.league_id).maybeSingle() : { data: null };
    const { data: tm } = inv.team_id ? await db.from("cp_teams").select("name").eq("id", inv.team_id).maybeSingle() : { data: null };
    return json({ ok: true, invite: { email_masked: mask(inv.email), role: inv.role, league_name: lg?.name ?? null, team_name: tm?.name ?? null, needs_birthdate: inv.role === "guardian" } });
  }
  if (action === "invite_accept") {
    const token = String(body.token || "");
    const { data: inv } = await db.from("cp_invites").select("*").eq("token", token).maybeSingle();
    if (!inv || inv.accepted_at || inv.locked_at || new Date(inv.expires_at) < new Date()) return json({ error: "This invite is no longer valid. Ask your coach to send a new one." }, 410);
    if (inv.role === "guardian") {
      const { data: kid } = await db.from("cp_players").select("birthdate").eq("id", inv.player_id).maybeSingle();
      const given = String(body.birthdate || "");
      if (!kid?.birthdate || given !== kid.birthdate) {
        const attempts = (inv.attempts ?? 0) + 1;
        const lock = attempts >= 3;
        await db.from("cp_invites").update({ attempts, locked_at: lock ? new Date().toISOString() : null }).eq("id", inv.id);
        if (lock) { await audit(null, "invite_locked", "cp_invites", inv.id, { reason: "birthdate" }); return json({ error: "Too many wrong tries. Your coach has been notified and can send a new invite." }, 423); }
        return json({ error: "That birthdate does not match our roster. Check it and try again." }, 400);
      }
    }
    // ensure person + auth user
    const name = String(body.name || "").trim();
    const { data: person } = await db.from("cp_people").upsert({ email: inv.email, name: name || inv.email.split("@")[0] }, { onConflict: "email", ignoreDuplicates: false }).select().single();
    if (name && person.name !== name) await db.from("cp_people").update({ name }).eq("id", person.id);
    if (!person.auth_user_id) {
      const { data: created, error } = await db.auth.admin.createUser({ email: inv.email, email_confirm: true });
      if (error && !/already/i.test(error.message)) return json({ error: "Could not create your account. Try again in a minute." }, 500);
      if (created?.user) await db.from("cp_people").update({ auth_user_id: created.user.id }).eq("id", person.id);
    }
    // memberships / guardian rows
    if (inv.role === "guardian") {
      const { count } = await db.from("cp_guardians").select("id", { count: "exact", head: true }).eq("player_id", inv.player_id).eq("status", "approved");
      const first = (count ?? 0) === 0;
      await db.from("cp_guardians").upsert({ player_id: inv.player_id, person_id: person.id, is_primary: first, status: first ? "approved" : "pending", approved_by: first ? inv.invited_by : null }, { onConflict: "player_id,person_id" });
      await db.from("cp_memberships").upsert({ person_id: person.id, team_id: inv.team_id, role: "guardian", status: "active", season_label: null, invited_by: inv.invited_by, activated_at: new Date().toISOString() }, { onConflict: "id" });
    } else {
      await db.from("cp_memberships").insert({ person_id: person.id, team_id: inv.team_id, league_id: inv.league_id, role: inv.role, status: "active", invited_by: inv.invited_by, activated_at: new Date().toISOString() });
    }
    await db.from("cp_invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
    await audit(person.id, "invite_accepted", "cp_invites", inv.id, { role: inv.role });
    return json({ ok: true, email: inv.email });
  }

  // ---- authenticated actions ----
  const me = await caller(req);
  if (!me) return json({ error: "Sign in required" }, 401);

  if (action === "invite_create") {
    const role = String(body.role || "");
    const teamId = body.team_id ? String(body.team_id) : null;
    const leagueId = body.league_id ? String(body.league_id) : null;
    const playerId = body.player_id ? String(body.player_id) : null;
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
    let allowed = false;
    if (role === "league_admin" || role === "league_scheduler") allowed = !!leagueId && (await isPlatformAdmin(me.personId) || await hasRole(me.personId, { league_id: leagueId }, ["league_admin"]));
    else if (role === "head_coach") { const lg = teamId ? await leagueOfTeam(teamId) : null; allowed = !!teamId && (await isPlatformAdmin(me.personId) || (!!lg && await hasRole(me.personId, { league_id: lg }, ["league_admin"]))); }
    else if (role === "assistant_coach") allowed = !!teamId && await canManageTeam(me.personId, teamId);
    else if (role === "guardian") {
      if (!teamId || !playerId) return json({ error: "team_id and player_id required" }, 400);
      const { data: kid } = await db.from("cp_players").select("team_id").eq("id", playerId).maybeSingle();
      allowed = !!kid && kid.team_id === teamId && (await canManageTeam(me.personId, teamId) || (await db.from("cp_guardians").select("id", { count: "exact", head: true }).eq("player_id", playerId).eq("person_id", me.personId).eq("status", "approved").then(r => (r.count ?? 0) > 0)));
    }
    if (!allowed) return json({ error: "You cannot send that invite" }, 403);
    const { data: inv, error } = await db.from("cp_invites").insert({ email, role, league_id: leagueId, team_id: teamId, player_id: playerId, invited_by: me.personId }).select("id,token,email,role,expires_at").single();
    if (error) return json({ error: error.message }, 400);
    await audit(me.personId, "invite_created", "cp_invites", inv.id, { role, email });
    return json({ ok: true, invite: inv });
  }
  if (action === "invite_send" || action === "invite_resend") {
    const { data: inv } = await db.from("cp_invites").select("id,email,token,role,team_id,league_id,invited_by,accepted_at").eq("id", String(body.invite_id || "")).maybeSingle();
    if (!inv) return json({ error: "Invite not found" }, 404);
    if (inv.accepted_at) return json({ error: "Already accepted" }, 409);
    const allowed = inv.invited_by === me.personId || (inv.team_id ? await canManageTeam(me.personId, inv.team_id) : false) || (inv.league_id ? await hasRole(me.personId, { league_id: inv.league_id }, ["league_admin"]) : false) || await isPlatformAdmin(me.personId);
    if (!allowed) return json({ error: "Not yours to send" }, 403);
    const r = await sendInviteEmail(inv, me.personId);
    return json({ ok: true, ...r });
  }
  if (action === "invite_revoke") {
    const { data: inv } = await db.from("cp_invites").select("id,team_id,league_id,invited_by").eq("id", String(body.invite_id || "")).maybeSingle();
    if (!inv) return json({ error: "Invite not found" }, 404);
    const allowed = inv.invited_by === me.personId || (inv.team_id ? await canManageTeam(me.personId, inv.team_id) : false) || await isPlatformAdmin(me.personId);
    if (!allowed) return json({ error: "Not yours to revoke" }, 403);
    await db.from("cp_invites").update({ expires_at: new Date(0).toISOString() }).eq("id", inv.id);
    await audit(me.personId, "invite_revoked", "cp_invites", inv.id);
    return json({ ok: true });
  }
  if (action === "guardian_approve") {
    const { data: g } = await db.from("cp_guardians").select("id,player_id,status").eq("id", String(body.guardian_id || "")).maybeSingle();
    if (!g) return json({ error: "Not found" }, 404);
    const teamId = (await db.from("cp_players").select("team_id").eq("id", g.player_id).maybeSingle()).data?.team_id;
    const primary = await db.from("cp_guardians").select("id", { count: "exact", head: true }).eq("player_id", g.player_id).eq("person_id", me.personId).eq("is_primary", true).eq("status", "approved").then(r => (r.count ?? 0) > 0);
    if (!(primary || (teamId && await canManageTeam(me.personId, teamId)))) return json({ error: "Only the primary guardian or the head coach can approve" }, 403);
    await db.from("cp_guardians").update({ status: "approved", approved_by: me.personId }).eq("id", g.id);
    await audit(me.personId, "guardian_approved", "cp_guardians", g.id);
    return json({ ok: true });
  }
  if (action === "league_create") {
    if (!(await isPlatformAdmin(me.personId))) return json({ error: "Platform admin only" }, 403);
    const { data, error } = await db.from("cp_leagues").insert({ slug: String(body.slug || ""), name: String(body.name || ""), short_name: String(body.short_name || ""), sports: Array.isArray(body.sports) ? body.sports : [] }).select().single();
    if (error) return json({ error: error.message }, 400);
    await db.from("cp_memberships").insert({ person_id: me.personId, league_id: data.id, role: "league_admin", status: "active", activated_at: new Date().toISOString() });
    await audit(me.personId, "league_created", "cp_leagues", data.id, { slug: data.slug });
    return json({ ok: true, league: data });
  }
  if (action === "mirror_status") {
    if (!(await isPlatformAdmin(me.personId))) return json({ error: "Platform admin only" }, 403);
    const { data } = await db.from("cp_settings").select("value,updated_at").eq("key", "mirror_report").maybeSingle();
    return json({ ok: true, report: data?.value ?? null, updated_at: data?.updated_at ?? null });
  }
  return json({ error: "Unknown action" }, 404);
});
```

Note for the implementer: the `cp_memberships` guardian upsert uses `onConflict: "id"`, which means it always inserts; that is intended (a guardian can hold one guardian membership per team; a second kid on the same team reuses the same membership only if you add a unique index later). Keep as is for the spine.

- [ ] **Step 4: Deploy**

Append to `DEPLOY.md`:

```markdown
## Deploy
supabase functions deploy cp-gateway --project-ref geigvuysptjvvqanumld --no-verify-jwt
Secrets (set once): supabase secrets set RESEND_API_KEY=<from ~/.cortex/credentials.md> --project-ref geigvuysptjvvqanumld
Why --no-verify-jwt: invite_lookup and invite_accept run before the person has an account. Every other action calls auth.getUser(token) and rejects 401 without a valid session.
```

Run the deploy command. Expected: `Deployed Functions on project geigvuysptjvvqanumld: cp-gateway`.

- [ ] **Step 5: Run the gateway test**

Run: `CP_SERVICE_ROLE_KEY=<key> node tests/cp.gateway.mjs`
Expected: all PASS, cleanup done, exit 0.

- [ ] **Step 6: Run the smoke and commit**

Run: `node tests/cp.smoke.mjs` (hygiene check now covers the gateway source). Expected: all PASS.
```bash
git add supabase/functions/cp-gateway/index.ts supabase/functions/cp-gateway/DEPLOY.md tests/cp.gateway.mjs
touch ~/.tests-passed
git commit -m "cp spine: cp-gateway (invites, accept, guardian approve, league create)"
```

---

### Task 5: Vercel paths

**Files:**
- Modify: `vercel.json` (append to `rewrites` and `redirects`)

**Interfaces:**
- Produces: public paths `/signin`, `/me`, `/join/<token>`, `/l/<league>`, `/l/<league>/admin/settings`, `/l/<league>/t/<team>`, `/t/<team>` served by `cp/*.html`.

- [ ] **Step 1: Add the rewrites**

Append inside the existing `"rewrites"` array (keep the `/fields/ics` entry first):

```json
{ "source": "/signin", "destination": "/cp/signin.html" },
{ "source": "/me", "destination": "/cp/me.html" },
{ "source": "/join/:token", "destination": "/cp/join.html" },
{ "source": "/l/:league/admin/settings", "destination": "/cp/settings.html" },
{ "source": "/l/:league/t/:team", "destination": "/cp/team.html" },
{ "source": "/l/:league", "destination": "/cp/league.html" },
{ "source": "/t/:team", "destination": "/cp/team.html" }
```

- [ ] **Step 2: Add a smoke check**

Append to `tests/cp.smoke.mjs` before the final summary:

```js
section('vercel.json: spine rewrites present, existing entries untouched');
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const srcs = vj.rewrites.map(r => r.source);
for (const s of ['/signin','/me','/join/:token','/l/:league/admin/settings','/l/:league/t/:team','/l/:league','/t/:team']) (srcs.includes(s) ? ok : fail)('rewrite ' + s);
(vj.rewrites[0].source === '/fields/ics/:path*' ? ok : fail)('fields ics rewrite still first');
(vj.redirects.length === 3 ? ok : fail)('redirects unchanged (3)');
```

- [ ] **Step 3: Run and commit**

Run: `node tests/cp.smoke.mjs`. Expected: all PASS.
```bash
git add vercel.json tests/cp.smoke.mjs
touch ~/.tests-passed
git commit -m "cp spine: vercel paths for signin, me, join, league, team"
```

---

### Task 6: cp-core.js (client, session, settings box, hats) with unit tests

**Files:**
- Create: `cp/cp-core.js`
- Create: `cp/defaults.json`
- Create: `cp/cp.css`
- Create: `tests/cp-core.test.mjs`

**Interfaces:**
- Produces (browser global `CP` and Node-exported pure functions):
  - `CP.client()` returns the supabase-js client (singleton).
  - `CP.session()` returns `{ user } | null`; `CP.requireSession()` redirects to `/signin?next=<path>` when null.
  - `CP.hats()` returns rows from `cp_my_hats`.
  - `CP.mergeBox(leagueBox, teamBox)` pure: defaults, then league, then team overrides. Never throws on missing keys.
  - `CP.paint(box)` sets CSS variables `--cp-primary`, `--cp-accent`, `--cp-on-primary`, document title, logo `img[data-cp-logo]`, text `[data-cp-name]`.
  - `CP.gateway(action, body)` POSTs to cp-gateway with the session token.
  - `CP.route()` returns `{ league, team, token }` parsed from `location.pathname`.

- [ ] **Step 1: Write the unit test**

Create `tests/cp-core.test.mjs`:

```js
#!/usr/bin/env node
// Pure-function tests for cp/cp-core.js. Run: node tests/cp-core.test.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { mergeBox, parseRoute, DEFAULTS } = require(path.join(ROOT, 'cp', 'cp-core.js'));
let passed = 0, failed = 0;
const ok = (m) => { console.log('  PASS ' + m); passed++; };
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const eq = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b) ? ok : fail)(m + (JSON.stringify(a) === JSON.stringify(b) ? '' : ' got ' + JSON.stringify(a)));

console.log('\nmergeBox');
eq(mergeBox(null, null).colors.primary, DEFAULTS.colors.primary, 'null boxes give defaults');
eq(mergeBox({ schema_version: 1 }, {}).display_name, DEFAULTS.display_name, 'missing display_name falls back');
eq(mergeBox({ colors: { primary: '#B4151B' } }, null).colors.primary, '#B4151B', 'league primary wins over default');
eq(mergeBox({ colors: { primary: '#B4151B' } }, null).colors.accent, DEFAULTS.colors.accent, 'missing accent falls back while primary set');
eq(mergeBox({ colors: { primary: '#B4151B' }, display_name: 'BLS' }, { colors: { primary: '#000000' } }).colors.primary, '#000000', 'team override wins');
eq(mergeBox({ colors: { primary: '#B4151B' }, display_name: 'BLS' }, { colors: { primary: '#000000' } }).display_name, 'BLS', 'team inherits league name');
eq(mergeBox({ colors: 'garbage' }, null).colors.primary, DEFAULTS.colors.primary, 'non-object colors ignored');
eq(mergeBox({ features: { team_hubs: true } }, null).features.public_schedule, false, 'feature flags default false');
eq(mergeBox({ schema_version: 0, routing: null }, null).routing, DEFAULTS.routing, 'old schema with null routing falls back');

console.log('\nparseRoute');
eq(parseRoute('/l/bls/t/cougars'), { league: 'bls', team: 'cougars', token: null }, 'league + team');
eq(parseRoute('/l/bls'), { league: 'bls', team: null, token: null }, 'league only');
eq(parseRoute('/l/bls/admin/settings'), { league: 'bls', team: null, token: null }, 'league admin settings');
eq(parseRoute('/t/cougars'), { league: null, team: 'cougars', token: null }, 'standalone team');
eq(parseRoute('/join/abc123'), { league: null, team: null, token: 'abc123' }, 'join token');
eq(parseRoute('/me'), { league: null, team: null, token: null }, 'me');

console.log(`\npassed: ${passed}\nfailed: ${failed}`);
process.exit(failed ? 1 : 0);
```

- [ ] **Step 2: Run it to see it fail**

Run: `node tests/cp-core.test.mjs`
Expected: `Cannot find module .../cp/cp-core.js`, exit 1.

- [ ] **Step 3: Write defaults, core, css**

Create `cp/defaults.json`:

```json
{
  "schema_version": 1,
  "display_name": "CoachPilot",
  "short_name": "CoachPilot",
  "logo_url": "/CoachPilot-AppIcon.png",
  "colors": { "primary": "#1F5F3F", "accent": "#1A1F1C", "on_primary": "#FFFFFF" },
  "contact_email": "",
  "support_email": "Daniel.Grande@ymail.com",
  "routing": {},
  "practice_rules": {},
  "features": { "public_schedule": false, "public_standings": false, "team_hubs": false }
}
```

Create `cp/cp-core.js` (UMD so Node tests can require the pure functions and the browser gets `window.CP`):

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(null);
  else root.CP = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  var DEFAULTS = {
    schema_version: 1, display_name: 'CoachPilot', short_name: 'CoachPilot', logo_url: '/CoachPilot-AppIcon.png',
    colors: { primary: '#1F5F3F', accent: '#1A1F1C', on_primary: '#FFFFFF' },
    contact_email: '', support_email: 'Daniel.Grande@ymail.com', routing: {}, practice_rules: {},
    features: { public_schedule: false, public_standings: false, team_hubs: false }
  };
  var SUPABASE_URL = 'https://geigvuysptjvvqanumld.supabase.co';
  var ANON = 'sb_publishable_REPLACE_WITH_PROJECT_ANON_KEY';
  var GATEWAY = SUPABASE_URL + '/functions/v1/cp-gateway';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function mergeOne(base, over) {
    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = isObj(base[k]) ? Object.assign({}, base[k]) : base[k]; });
    if (!isObj(over)) return out;
    Object.keys(over).forEach(function (k) {
      var v = over[k];
      if (v === null || v === undefined) return;
      if (isObj(DEFAULTS[k])) { if (isObj(v)) out[k] = Object.assign({}, out[k] || {}, v); return; }
      if (typeof v === typeof DEFAULTS[k] || DEFAULTS[k] === undefined) out[k] = v;
    });
    return out;
  }
  function mergeBox(leagueBox, teamBox) { return mergeOne(mergeOne(DEFAULTS, leagueBox), teamBox); }
  function parseRoute(pathname) {
    var p = String(pathname || '').replace(/\/+$/, '');
    var m;
    if ((m = p.match(/^\/l\/([a-z0-9-]+)\/t\/([a-z0-9-]+)/))) return { league: m[1], team: m[2], token: null };
    if ((m = p.match(/^\/l\/([a-z0-9-]+)/))) return { league: m[1], team: null, token: null };
    if ((m = p.match(/^\/t\/([a-z0-9-]+)/))) return { league: null, team: m[1], token: null };
    if ((m = p.match(/^\/join\/([A-Za-z0-9]+)/))) return { league: null, team: null, token: m[1] };
    return { league: null, team: null, token: null };
  }

  var api = { DEFAULTS: DEFAULTS, mergeBox: mergeBox, parseRoute: parseRoute };
  if (!root || !root.document) return api; // Node: pure functions only

  var _client = null;
  api.client = function () { if (!_client) _client = root.supabase.createClient(SUPABASE_URL, ANON, { auth: { persistSession: true, autoRefreshToken: true } }); return _client; };
  api.session = function () { return api.client().auth.getSession().then(function (r) { return r.data.session; }); };
  api.requireSession = function () { return api.session().then(function (s) { if (!s) { root.location.href = '/signin?next=' + encodeURIComponent(root.location.pathname); return null; } return s; }); };
  api.hats = function () { return api.client().from('cp_my_hats').select('*').then(function (r) { return r.data || []; }); };
  api.route = function () { return parseRoute(root.location.pathname); };
  api.gateway = function (action, body) {
    return api.session().then(function (s) {
      return fetch(GATEWAY + '?action=' + encodeURIComponent(action), { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', apikey: ANON }, s ? { Authorization: 'Bearer ' + s.access_token } : {}), body: JSON.stringify(body || {}) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    });
  };
  api.paint = function (box) {
    var b = mergeBox(box, null);
    var cs = root.document.documentElement.style;
    cs.setProperty('--cp-primary', b.colors.primary); cs.setProperty('--cp-accent', b.colors.accent); cs.setProperty('--cp-on-primary', b.colors.on_primary);
    root.document.title = b.display_name + (root.document.title ? ' | ' + root.document.title.split(' | ').pop() : '');
    root.document.querySelectorAll('[data-cp-name]').forEach(function (el) { el.textContent = b.display_name; });
    root.document.querySelectorAll('img[data-cp-logo]').forEach(function (el) { el.src = b.logo_url; el.alt = b.display_name; });
    return b;
  };
  api.loadLeague = function (slug) { return api.client().from('cp_leagues').select('*').eq('slug', slug).maybeSingle().then(function (r) { return r.data; }); };
  api.loadTeam = function (leagueSlug, teamSlug) {
    var q = api.client().from('cp_teams').select('*, cp_leagues(*)').eq('slug', teamSlug);
    q = leagueSlug ? q.eq('cp_leagues.slug', leagueSlug) : q.is('league_id', null);
    return q.maybeSingle().then(function (r) { return r.data; });
  };
  api.signOut = function () { return api.client().auth.signOut().then(function () { root.location.href = '/signin'; }); };
  return api;
});
```

Create `cp/cp.css`:

```css
:root{--cp-primary:#1F5F3F;--cp-accent:#1A1F1C;--cp-on-primary:#FFFFFF;--cp-paper:#FBFAF6;--cp-ink:#1A1F1C;--cp-muted:#5F6B64;--cp-line:#E2E5DF;--cp-panel:#F3F4EF;--cp-bad:#B4512F;--cp-bad-soft:#F4E1D8;--cp-good-soft:#DCEBE1;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--cp-paper:#141816;--cp-ink:#ECEFEA;--cp-muted:#A3ADA6;--cp-line:#2A302C;--cp-panel:#1C211E;--cp-bad-soft:#3A271F;--cp-good-soft:#1E3328;}}
:root[data-theme="dark"]{color-scheme:dark;--cp-paper:#141816;--cp-ink:#ECEFEA;--cp-muted:#A3ADA6;--cp-line:#2A302C;--cp-panel:#1C211E;--cp-bad-soft:#3A271F;--cp-good-soft:#1E3328;}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--cp-paper);color:var(--cp-ink);font:16px/1.5 "Source Sans 3","Helvetica Neue",Arial,sans-serif;padding:0 16px env(safe-area-inset-bottom,0px)}
.cp-top{position:sticky;top:env(safe-area-inset-top,0px);background:var(--cp-primary);color:var(--cp-on-primary);margin:0 -16px;padding:12px 16px;display:flex;align-items:center;gap:12px}
.cp-top img{width:32px;height:32px;border-radius:6px;background:#fff}
.cp-top .name{font-weight:600;font-size:17px}
.cp-top .spacer{flex:1}
.cp-top button,.cp-btn{font:inherit;border:0;border-radius:8px;padding:10px 14px;cursor:pointer}
.cp-btn{background:var(--cp-primary);color:var(--cp-on-primary);font-weight:600}
.cp-btn.ghost{background:transparent;color:var(--cp-primary);border:1px solid var(--cp-line)}
.cp-wrap{max-width:720px;margin:0 auto;padding-block:20px 90px;display:flex;flex-direction:column;gap:18px}
h1{font-size:28px;line-height:1.1;margin:0}
h2{font-size:20px;margin:0}
.cp-card{background:var(--cp-panel);border:1px solid var(--cp-line);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px}
.cp-card.tap{cursor:pointer}
.cp-card .role{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--cp-muted)}
.cp-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--cp-line)}
.cp-row:last-child{border-bottom:0}
.cp-row .grow{flex:1;min-width:0}
.cp-pill{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--cp-line)}
.cp-pill.sent{background:var(--cp-good-soft)}
.cp-pill.accepted{background:var(--cp-good-soft);font-weight:600}
.cp-pill.locked{background:var(--cp-bad-soft)}
label{display:flex;flex-direction:column;gap:6px;font-weight:600}
input,select{font:inherit;padding:12px;border:1px solid var(--cp-line);border-radius:8px;background:var(--cp-paper);color:var(--cp-ink)}
input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid var(--cp-primary);outline-offset:2px}
.cp-msg{padding:12px 14px;border-radius:8px;background:var(--cp-good-soft)}
.cp-msg.bad{background:var(--cp-bad-soft)}
.cp-tabs{position:fixed;left:0;right:0;bottom:0;display:flex;background:var(--cp-paper);border-top:1px solid var(--cp-line);padding:6px 0 calc(6px + env(safe-area-inset-bottom,0px))}
.cp-tabs a{flex:1;text-align:center;font-size:12px;color:var(--cp-muted);text-decoration:none;padding:6px 0}
.cp-tabs a.on{color:var(--cp-primary);font-weight:600}
.cp-tabs svg{display:block;margin:0 auto 2px;width:22px;height:22px}
@media (min-width:768px){.cp-tabs{position:static;border:0;justify-content:flex-end;gap:8px;padding:0}.cp-tabs a{flex:0 0 auto;padding:6px 10px}.cp-wrap{padding-bottom:40px}}
[hidden]{display:none!important}
```

- [ ] **Step 4: Run the unit test**

Run: `node tests/cp-core.test.mjs`
Expected: all PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add cp/cp-core.js cp/defaults.json cp/cp.css tests/cp-core.test.mjs
touch ~/.tests-passed
git commit -m "cp spine: cp-core (client, box merge, routing, paint) with unit tests"
```

---

### Task 7: Sign-in and /me pages

**Files:**
- Create: `cp/signin.html`
- Create: `cp/me.html`
- Modify: `tests/cp.smoke.mjs` (static checks)

**Interfaces:**
- Consumes: `CP.client`, `CP.session`, `CP.hats`, `CP.paint`, `CP.mergeBox`.
- Produces: `/signin?next=` flow using `signInWithOtp` then `verifyOtp({ email, token, type: 'email' })`; `/me` renders one card per hat and routes to `/l/<slug>` or `/l/<slug>/t/<slug>` or `/t/<slug>`.

- [ ] **Step 1: Add static smoke checks**

Append to `tests/cp.smoke.mjs` before the summary:

```js
section('pages: required hooks');
function has(file, needles) { const t = fs.readFileSync(path.join(ROOT, 'cp', file), 'utf8'); for (const n of needles) (t.includes(n) ? ok : fail)(`${file} has ${n}`); }
has('signin.html', ['signInWithOtp', 'shouldCreateUser: false', 'verifyOtp', 'id="email"', 'id="code"', 'cp-core.js']);
has('me.html', ['cp_my_hats', 'requireSession', 'data-cp-name', 'cp-tabs', 'No teams yet']);
```

Run: `node tests/cp.smoke.mjs`. Expected: new lines FAIL (files missing).

- [ ] **Step 2: Write signin.html**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Sign in | CoachPilot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap">
<link rel="stylesheet" href="/cp/cp.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script src="/cp/cp-core.js"></script>
</head><body>
<div class="cp-top"><img data-cp-logo src="/CoachPilot-AppIcon.png" alt=""><span class="name" data-cp-name>CoachPilot</span></div>
<main class="cp-wrap">
  <h1>Sign in</h1>
  <form id="stepEmail">
    <label>Email<input id="email" type="email" autocomplete="email" required placeholder="you@example.com"></label>
    <p style="color:var(--cp-muted);margin:8px 0 14px">We will email you a 6-digit code. No password.</p>
    <button class="cp-btn" type="submit" id="sendBtn">Send code</button>
  </form>
  <form id="stepCode" hidden>
    <p>Enter the code we sent to <b id="sentTo"></b>.</p>
    <label>Code<input id="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label>
    <div style="display:flex;gap:10px;margin-top:14px"><button class="cp-btn" type="submit">Sign in</button><button class="cp-btn ghost" type="button" id="againBtn">Send again</button></div>
  </form>
  <div id="msg" class="cp-msg" hidden></div>
</main>
<script>
(function(){
  CP.paint(null);
  var sb = CP.client();
  var params = new URLSearchParams(location.search);
  var next = params.get('next') || '/me';
  if (!/^\/[A-Za-z0-9\/_-]*$/.test(next)) next = '/me';
  var email = '';
  var msg = document.getElementById('msg');
  function say(t, bad){ msg.textContent = t; msg.hidden = false; msg.classList.toggle('bad', !!bad); }
  CP.session().then(function(s){ if (s) location.href = next; });
  function send(){
    return sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: false } }).then(function(r){
      if (r.error) { say(r.error.message.indexOf('Signups not allowed') >= 0 ? 'We do not have an account for that email yet. Ask your coach or league for an invite.' : r.error.message, true); return false; }
      document.getElementById('sentTo').textContent = email;
      document.getElementById('stepEmail').hidden = true; document.getElementById('stepCode').hidden = false;
      document.getElementById('code').focus(); say('Code sent. Check your email.');
      return true;
    });
  }
  document.getElementById('stepEmail').addEventListener('submit', function(e){ e.preventDefault(); email = document.getElementById('email').value.trim().toLowerCase(); document.getElementById('sendBtn').disabled = true; send().finally(function(){ document.getElementById('sendBtn').disabled = false; }); });
  document.getElementById('againBtn').addEventListener('click', function(){ send(); });
  document.getElementById('stepCode').addEventListener('submit', function(e){
    e.preventDefault();
    var code = document.getElementById('code').value.trim();
    sb.auth.verifyOtp({ email: email, token: code, type: 'email' }).then(function(r){
      if (r.error) { say('That code did not work. Check it or send a new one.', true); return; }
      location.href = next;
    });
  });
})();
</script>
</body></html>
```

- [ ] **Step 3: Write me.html**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Home | CoachPilot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap">
<link rel="stylesheet" href="/cp/cp.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script src="/cp/cp-core.js"></script>
</head><body>
<div class="cp-top"><img data-cp-logo src="/CoachPilot-AppIcon.png" alt=""><span class="name" data-cp-name>CoachPilot</span><span class="spacer"></span><button id="outBtn" class="cp-btn ghost" type="button" style="color:var(--cp-on-primary);border-color:rgba(255,255,255,.4)">Sign out</button></div>
<main class="cp-wrap">
  <h1 id="hello">Your teams</h1>
  <div id="waiting" class="cp-card" hidden><h2>Waiting on you</h2><div id="waitingList"></div></div>
  <div id="hats" style="display:flex;flex-direction:column;gap:12px"></div>
  <div id="empty" class="cp-card" hidden>No teams yet. When a coach or league invites you, your team shows up here.</div>
</main>
<nav class="cp-tabs">
  <a href="/me" class="on"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>Home</a>
  <a href="/me#teams"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 20a4.5 4.5 0 0 1 7 0"/></svg>Teams</a>
  <a href="/me#me"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>Me</a>
</nav>
<script>
(function(){
  CP.paint(null);
  document.getElementById('outBtn').addEventListener('click', CP.signOut);
  CP.requireSession().then(function(s){
    if (!s) return;
    return CP.client().from('cp_people').select('name').eq('auth_user_id', s.user.id).maybeSingle().then(function(r){
      if (r.data && r.data.name) document.getElementById('hello').textContent = 'Hi ' + r.data.name.split(' ')[0];
      return CP.hats();
    }).then(function(hats){
      var wrap = document.getElementById('hats');
      var active = hats.filter(function(h){ return h.status === 'active'; });
      if (!active.length) { document.getElementById('empty').hidden = false; return; }
      var labels = { platform_admin: 'Platform admin', league_admin: 'League admin', league_scheduler: 'Scheduler', head_coach: 'Head coach', assistant_coach: 'Assistant coach', guardian: 'Parent' };
      active.forEach(function(h){
        var box = CP.mergeBox(h.league_settings, h.team_settings);
        var card = document.createElement('a');
        card.className = 'cp-card tap'; card.style.textDecoration = 'none'; card.style.color = 'inherit'; card.style.borderLeft = '6px solid ' + box.colors.primary;
        var title = h.team_name || h.league_name || 'CoachPilot';
        var sub = h.team_name && h.league_name ? h.league_name : (h.season_label || '');
        card.href = h.team_slug ? (h.league_slug ? '/l/' + h.league_slug + '/t/' + h.team_slug : '/t/' + h.team_slug) : (h.league_slug ? '/l/' + h.league_slug : '/me');
        card.innerHTML = '<div class="role"></div><h2></h2><div style="color:var(--cp-muted)"></div>';
        card.querySelector('.role').textContent = labels[h.role] || h.role;
        card.querySelector('h2').textContent = title;
        card.querySelector('div:last-child').textContent = sub;
        wrap.appendChild(card);
      });
      // Waiting on you: pending second-guardian approvals for kids I primary-guard, unsent invites I created
      return Promise.all([
        CP.client().from('cp_guardians').select('id, status, cp_players(first_name,last_name)').eq('status', 'pending'),
        CP.client().from('cp_invites').select('id,email,role,sent_at,accepted_at').is('sent_at', null).is('accepted_at', null)
      ]).then(function(rs){
        var items = [];
        (rs[0].data || []).forEach(function(g){ items.push('Approve a second guardian for ' + (g.cp_players ? g.cp_players.first_name + ' ' + g.cp_players.last_name : 'a player')); });
        (rs[1].data || []).forEach(function(i){ items.push('Invite not sent yet: ' + i.email + ' (' + i.role.replace('_',' ') + ')'); });
        if (items.length) { document.getElementById('waiting').hidden = false; var ul = document.getElementById('waitingList'); items.forEach(function(t){ var d = document.createElement('div'); d.className = 'cp-row'; d.textContent = t; ul.appendChild(d); }); }
      });
    });
  });
})();
</script>
</body></html>
```

- [ ] **Step 4: Verify in a browser**

Push to a branch is not needed; Vercel deploys `main`. Commit (next step), push, then open `https://coachpilot.org/signin` on a phone-width window. Enter Coach's ymail, get the code, sign in, land on `/me`. Expected before the mirror: "No teams yet" card. Console: no errors. Record the check in the commit message body.

- [ ] **Step 5: Run smoke and commit**

Run: `node tests/cp.smoke.mjs && node tests/cp-core.test.mjs`. Expected: all PASS.
```bash
git add cp/signin.html cp/me.html tests/cp.smoke.mjs
touch ~/.tests-passed
git commit -m "cp spine: sign-in by email code and /me hats page"
git push origin main
```

---

### Task 8: Join page

**Files:**
- Create: `cp/join.html`
- Modify: `tests/cp.smoke.mjs`

**Interfaces:**
- Consumes: `CP.gateway('invite_lookup')`, `CP.gateway('invite_accept')`, `CP.route().token`, `signin` flow.
- Produces: `/join/<token>` end-to-end: lookup, optional name, birthdate for guardians, accept, then hands off to `/signin?next=/me` with the email prefilled via `sessionStorage.cp_join_email`.

- [ ] **Step 1: Smoke check first**

Append to `tests/cp.smoke.mjs`:
```js
has('join.html', ['invite_lookup', 'invite_accept', 'id="birthdate"', 'needs_birthdate', 'cp_join_email', '410']);
```
Run: expected FAIL (file missing).

- [ ] **Step 2: Write join.html**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Join | CoachPilot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap">
<link rel="stylesheet" href="/cp/cp.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script src="/cp/cp-core.js"></script>
</head><body>
<div class="cp-top"><img data-cp-logo src="/CoachPilot-AppIcon.png" alt=""><span class="name" data-cp-name>CoachPilot</span></div>
<main class="cp-wrap">
  <h1 id="title">Checking your invite</h1>
  <p id="lead" style="color:var(--cp-muted)"></p>
  <form id="form" hidden>
    <label>Your name<input id="name" required autocomplete="name"></label>
    <label id="bdWrap" hidden style="margin-top:12px">Player's birthdate<input id="birthdate" type="date"></label>
    <p id="bdHelp" hidden style="color:var(--cp-muted);margin:6px 0 0">This confirms you are this player's guardian. It never shows anywhere else.</p>
    <button class="cp-btn" type="submit" style="margin-top:16px">Join</button>
  </form>
  <div id="msg" class="cp-msg" hidden></div>
</main>
<script>
(function(){
  CP.paint(null);
  var token = CP.route().token;
  var msg = document.getElementById('msg');
  function say(t, bad){ msg.textContent = t; msg.hidden = false; msg.classList.toggle('bad', !!bad); }
  if (!token) { document.getElementById('title').textContent = 'No invite here'; say('Open the link from your invite email.', true); return; }
  CP.gateway('invite_lookup', { token: token }).then(function(r){
    if (r.status === 410 || !r.body || !r.body.ok) { document.getElementById('title').textContent = 'This invite is no longer valid'; say((r.body && r.body.error) || 'Ask your coach to send a new one.', true); return; }
    var inv = r.body.invite;
    var who = inv.team_name || inv.league_name || 'CoachPilot';
    document.getElementById('title').textContent = 'Join ' + who;
    document.getElementById('lead').textContent = 'Invite for ' + inv.email_masked + ' as ' + inv.role.replace('_',' ') + '.';
    if (inv.needs_birthdate) { document.getElementById('bdWrap').hidden = false; document.getElementById('bdHelp').hidden = false; document.getElementById('birthdate').required = true; }
    document.getElementById('form').hidden = false;
  });
  document.getElementById('form').addEventListener('submit', function(e){
    e.preventDefault();
    var body = { token: token, name: document.getElementById('name').value.trim() };
    var bd = document.getElementById('birthdate').value; if (bd) body.birthdate = bd;
    CP.gateway('invite_accept', body).then(function(r){
      if (r.status === 200 && r.body && r.body.ok) {
        try { sessionStorage.setItem('cp_join_email', r.body.email); } catch (err) {}
        say('You are in. Next, we will email you a sign-in code.');
        setTimeout(function(){ location.href = '/signin?next=%2Fme'; }, 900);
        return;
      }
      if (r.status === 423) { document.getElementById('form').hidden = true; }
      say((r.body && r.body.error) || 'Something went wrong. Try again.', true);
    });
  });
})();
</script>
</body></html>
```

Then in `cp/signin.html`, after `var email = '';` add:
```js
  try { var pre = sessionStorage.getItem('cp_join_email'); if (pre) { document.getElementById('email').value = pre; sessionStorage.removeItem('cp_join_email'); } } catch (err) {}
```

- [ ] **Step 3: Run smoke, commit**

Run: `node tests/cp.smoke.mjs`. Expected: all PASS.
```bash
git add cp/join.html cp/signin.html tests/cp.smoke.mjs
touch ~/.tests-passed
git commit -m "cp spine: join page (lookup, birthdate claim, accept)"
```

---

### Task 9: League, team and settings pages

**Files:**
- Create: `cp/league.html`, `cp/team.html`, `cp/settings.html`
- Modify: `tests/cp.smoke.mjs`

**Interfaces:**
- Consumes: `CP.loadLeague`, `CP.loadTeam`, `CP.paint`, `CP.gateway('invite_create'|'invite_send'|'invite_resend'|'guardian_approve')`, RLS from Task 1.
- Produces: `/l/<league>` (name, logo, teams you can see, link to settings for admins), `/l/<league>/t/<team>` and `/t/<team>` (roster with guardian invite state, assistant invites, resend, approve pending guardians), `/l/<league>/admin/settings` (box editor writing `cp_leagues.settings`).

- [ ] **Step 1: Smoke checks first**

Append to `tests/cp.smoke.mjs`:
```js
has('league.html', ['loadLeague', 'CP.paint', 'cp_teams', '/admin/settings']);
has('team.html', ['loadTeam', 'cp_players', 'cp_invites', 'invite_create', 'invite_send', 'invite_resend', 'guardian_approve', 'not sent', 'data-role-gate']);
has('settings.html', ['schema_version', 'display_name', 'colors', 'contact_email', 'features', 'cp_leagues']);
```
Run: expected FAIL (files missing).

- [ ] **Step 2: Write league.html**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>League | CoachPilot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap">
<link rel="stylesheet" href="/cp/cp.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script src="/cp/cp-core.js"></script>
</head><body>
<div class="cp-top"><a href="/me" style="color:inherit;text-decoration:none">Home</a><img data-cp-logo src="/CoachPilot-AppIcon.png" alt=""><span class="name" data-cp-name>League</span><span class="spacer"></span><a id="settingsLink" href="#" hidden style="color:inherit">Settings</a></div>
<main class="cp-wrap">
  <h1 id="h">League</h1>
  <div id="teams" style="display:flex;flex-direction:column;gap:10px"></div>
  <div id="msg" class="cp-msg bad" hidden></div>
</main>
<script>
(function(){
  var r = CP.route();
  CP.requireSession().then(function(s){ if (!s) return;
    return CP.loadLeague(r.league).then(function(lg){
      if (!lg) { document.getElementById('msg').textContent = 'You do not have access to this league.'; document.getElementById('msg').hidden = false; return; }
      var box = CP.paint(lg.settings);
      document.getElementById('h').textContent = box.display_name;
      return Promise.all([CP.hats(), CP.client().from('cp_teams').select('id,slug,name,sport,season_label,settings').eq('league_id', lg.id).eq('is_active', true).order('name')]).then(function(rs){
        var isAdmin = rs[0].some(function(h){ return h.role === 'league_admin' && h.league_id === lg.id && h.status === 'active'; }) || rs[0].some(function(h){ return h.role === 'platform_admin' && h.status === 'active'; });
        if (isAdmin) { var a = document.getElementById('settingsLink'); a.hidden = false; a.href = '/l/' + lg.slug + '/admin/settings'; }
        var wrap = document.getElementById('teams');
        (rs[1].data || []).forEach(function(t){
          var tb = CP.mergeBox(lg.settings, t.settings);
          var a = document.createElement('a'); a.className = 'cp-card tap'; a.style.textDecoration = 'none'; a.style.color = 'inherit'; a.style.borderLeft = '6px solid ' + tb.colors.primary;
          a.href = '/l/' + lg.slug + '/t/' + t.slug; a.innerHTML = '<h2></h2><div style="color:var(--cp-muted)"></div>';
          a.querySelector('h2').textContent = t.name; a.querySelector('div').textContent = t.sport + ' | ' + t.season_label; wrap.appendChild(a);
        });
        if (!(rs[1].data || []).length) { var d = document.createElement('div'); d.className = 'cp-card'; d.textContent = 'No teams visible to you in this league yet.'; wrap.appendChild(d); }
      });
    });
  });
})();
</script>
</body></html>
```

- [ ] **Step 3: Write team.html**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Team | CoachPilot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap">
<link rel="stylesheet" href="/cp/cp.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script src="/cp/cp-core.js"></script>
</head><body>
<div class="cp-top"><a href="/me" style="color:inherit;text-decoration:none">Home</a><img data-cp-logo src="/CoachPilot-AppIcon.png" alt=""><span class="name" data-cp-name>Team</span></div>
<main class="cp-wrap">
  <h1 id="h">Team</h1>
  <div id="pending" class="cp-card" hidden><h2>Waiting on you</h2><div id="pendingList"></div></div>
  <section class="cp-card"><h2>Roster</h2><div id="roster"></div>
    <form id="addPlayer" data-role-gate="head_coach" hidden style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <input id="pFirst" placeholder="First name" required style="flex:1;min-width:120px"><input id="pLast" placeholder="Last name" style="flex:1;min-width:120px"><input id="pBirth" type="date" title="Birthdate" style="flex:1;min-width:150px"><button class="cp-btn" type="submit">Add player</button>
    </form>
  </section>
  <section class="cp-card" id="staffCard" data-role-gate="head_coach" hidden><h2>Staff</h2><div id="staff"></div>
    <form id="addAsst" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><input id="aEmail" type="email" placeholder="Assistant coach email" required style="flex:1;min-width:200px"><button class="cp-btn" type="submit">Invite assistant</button></form>
  </section>
  <div id="msg" class="cp-msg" hidden></div>
</main>
<script>
(function(){
  var r = CP.route(); var team, box, myRoles = [];
  var msg = document.getElementById('msg');
  function say(t, bad){ msg.textContent = t; msg.hidden = false; msg.classList.toggle('bad', !!bad); }
  function can(role){ return myRoles.indexOf(role) >= 0 || myRoles.indexOf('league_admin') >= 0 || myRoles.indexOf('platform_admin') >= 0; }
  function pill(inv){ var p = document.createElement('span'); p.className = 'cp-pill'; if (!inv) { p.textContent = 'not sent'; return p; } if (inv.accepted_at) { p.className += ' accepted'; p.textContent = 'accepted'; } else if (inv.locked_at) { p.className += ' locked'; p.textContent = 'locked'; } else if (inv.sent_at) { p.className += ' sent'; p.textContent = 'sent'; } else p.textContent = 'not sent'; return p; }
  function load(){
    return Promise.all([
      CP.client().from('cp_players').select('id,first_name,last_name,jersey,birthdate').eq('team_id', team.id).eq('is_active', true).order('last_name'),
      CP.client().from('cp_invites').select('id,email,role,player_id,sent_at,accepted_at,locked_at').eq('team_id', team.id),
      CP.client().from('cp_guardians').select('id,player_id,status,is_primary,cp_people(name,email)'),
      CP.client().from('cp_memberships').select('id,role,status,cp_people(name,email)').eq('team_id', team.id)
    ]).then(function(rs){
      var players = rs[0].data || [], invites = rs[1].data || [], guardians = rs[2].data || [], members = rs[3].data || [];
      var wrap = document.getElementById('roster'); wrap.innerHTML = '';
      players.forEach(function(p){
        var row = document.createElement('div'); row.className = 'cp-row';
        var g = document.createElement('div'); g.className = 'grow'; g.textContent = p.first_name + ' ' + p.last_name + (p.jersey ? ' #' + p.jersey : ''); row.appendChild(g);
        if (can('head_coach')) {
          var gs = guardians.filter(function(x){ return x.player_id === p.id; }); var inv = invites.filter(function(x){ return x.player_id === p.id; }).sort(function(a,b){ return a.accepted_at ? -1 : 1; })[0];
          var who = document.createElement('span'); who.style.color = 'var(--cp-muted)'; who.style.fontSize = '13px'; who.textContent = gs.length ? gs.map(function(x){ return x.cp_people ? x.cp_people.name : ''; }).join(', ') : 'no guardian yet'; row.appendChild(who);
          row.appendChild(pill(inv));
          var b = document.createElement('button'); b.className = 'cp-btn ghost'; b.type = 'button';
          if (!inv) { b.textContent = 'Invite parent'; b.onclick = function(){ var e = prompt('Parent email for ' + p.first_name + ':'); if (!e) return; CP.gateway('invite_create', { email: e, role: 'guardian', team_id: team.id, player_id: p.id }).then(function(x){ if (x.status !== 200) { say(x.body.error || 'Could not create invite', true); return; } return CP.gateway('invite_send', { invite_id: x.body.invite.id }); }).then(function(x){ if (x) say(x.body.suppressed ? 'Invite saved. Email sending is off, so nothing was sent.' : 'Invite sent.'); load(); }); }; }
          else if (!inv.accepted_at) { b.textContent = 'Resend'; b.onclick = function(){ CP.gateway('invite_resend', { invite_id: inv.id }).then(function(x){ say(x.body.suppressed ? 'Email sending is off, so nothing was sent.' : (x.body.ok ? 'Sent.' : (x.body.error || 'Failed')), !x.body.ok); load(); }); }; }
          else b.hidden = true;
          row.appendChild(b);
        }
        wrap.appendChild(row);
      });
      if (!players.length) { var d = document.createElement('div'); d.className = 'cp-row'; d.textContent = 'No players yet.'; wrap.appendChild(d); }
      var pend = guardians.filter(function(x){ return x.status === 'pending'; });
      if (pend.length && can('head_coach')) { document.getElementById('pending').hidden = false; var pl = document.getElementById('pendingList'); pl.innerHTML = '';
        pend.forEach(function(x){ var p = players.find(function(q){ return q.id === x.player_id; }); var row = document.createElement('div'); row.className = 'cp-row'; var g = document.createElement('div'); g.className = 'grow'; g.textContent = (x.cp_people ? x.cp_people.name : 'Someone') + ' wants to be a guardian of ' + (p ? p.first_name : 'a player'); row.appendChild(g); var b = document.createElement('button'); b.className = 'cp-btn'; b.type = 'button'; b.textContent = 'Approve'; b.onclick = function(){ CP.gateway('guardian_approve', { guardian_id: x.id }).then(function(){ load(); }); }; row.appendChild(b); pl.appendChild(row); }); }
      var st = document.getElementById('staff'); st.innerHTML = '';
      members.filter(function(m){ return m.role === 'head_coach' || m.role === 'assistant_coach'; }).forEach(function(m){ var row = document.createElement('div'); row.className = 'cp-row'; row.textContent = (m.cp_people ? m.cp_people.name : '') + ' (' + m.role.replace('_',' ') + ', ' + m.status + ')'; st.appendChild(row); });
      invites.filter(function(i){ return i.role === 'assistant_coach' && !i.accepted_at; }).forEach(function(i){ var row = document.createElement('div'); row.className = 'cp-row'; var g = document.createElement('div'); g.className = 'grow'; g.textContent = i.email + ' (assistant invite)'; row.appendChild(g); row.appendChild(pill(i)); st.appendChild(row); });
    });
  }
  CP.requireSession().then(function(s){ if (!s) return;
    return CP.loadTeam(r.league, r.team).then(function(t){
      if (!t) { say('You do not have access to this team.', true); return; }
      team = t; box = CP.paint(CP.mergeBox(t.cp_leagues ? t.cp_leagues.settings : null, t.settings));
      document.getElementById('h').textContent = t.name;
      return CP.hats().then(function(hats){
        myRoles = hats.filter(function(h){ return h.status === 'active' && (h.team_id === t.id || (t.league_id && h.league_id === t.league_id) || h.role === 'platform_admin'); }).map(function(h){ return h.role; });
        document.querySelectorAll('[data-role-gate]').forEach(function(el){ el.hidden = !can(el.getAttribute('data-role-gate')); });
        return load();
      });
    });
  });
  document.getElementById('addPlayer').addEventListener('submit', function(e){ e.preventDefault(); CP.client().from('cp_players').insert({ team_id: team.id, season_label: team.season_label, first_name: document.getElementById('pFirst').value.trim(), last_name: document.getElementById('pLast').value.trim(), birthdate: document.getElementById('pBirth').value || null }).then(function(x){ if (x.error) say(x.error.message, true); else { e.target.reset(); load(); } }); });
  document.getElementById('addAsst').addEventListener('submit', function(e){ e.preventDefault(); var em = document.getElementById('aEmail').value.trim(); CP.gateway('invite_create', { email: em, role: 'assistant_coach', team_id: team.id }).then(function(x){ if (x.status !== 200) { say(x.body.error || 'Could not invite', true); return; } return CP.gateway('invite_send', { invite_id: x.body.invite.id }).then(function(y){ say(y.body.suppressed ? 'Invite saved. Email sending is off, so nothing was sent.' : 'Invite sent.'); e.target.reset(); load(); }); }); });
})();
</script>
</body></html>
```

Implementer note: `prompt()` is acceptable here for the spine (coach-only surface). Replace with an inline form in the Game Plans sub-project.

- [ ] **Step 4: Write settings.html**

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Settings | CoachPilot</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600&display=swap">
<link rel="stylesheet" href="/cp/cp.css">
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>
<script src="/cp/cp-core.js"></script>
</head><body>
<div class="cp-top"><a id="back" href="/me" style="color:inherit;text-decoration:none">Back</a><img data-cp-logo src="/CoachPilot-AppIcon.png" alt=""><span class="name" data-cp-name>Settings</span></div>
<main class="cp-wrap">
  <h1>League settings</h1>
  <form id="f" class="cp-card">
    <label>Display name<input id="display_name" required></label>
    <label>Short name<input id="short_name"></label>
    <label>Logo URL<input id="logo_url" placeholder="https://..."></label>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><label style="flex:1">Primary color<input id="c_primary" type="color"></label><label style="flex:1">Accent color<input id="c_accent" type="color"></label><label style="flex:1">Text on primary<input id="c_on" type="color"></label></div>
    <label>Contact email<input id="contact_email" type="email"></label>
    <label>Support email<input id="support_email" type="email"></label>
    <fieldset style="border:1px solid var(--cp-line);border-radius:8px"><legend>Features</legend>
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:400"><input id="f_public_schedule" type="checkbox">Public schedule</label>
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:400"><input id="f_public_standings" type="checkbox">Public standings</label>
      <label style="flex-direction:row;align-items:center;gap:8px;font-weight:400"><input id="f_team_hubs" type="checkbox">Team hubs</label>
    </fieldset>
    <div id="preview" style="padding:12px;border-radius:8px;background:var(--cp-primary);color:var(--cp-on-primary)">Preview: this is how your header looks.</div>
    <button class="cp-btn" type="submit">Save</button>
  </form>
  <div id="msg" class="cp-msg" hidden></div>
</main>
<script>
(function(){
  var r = CP.route(); var lg;
  var msg = document.getElementById('msg'); function say(t, bad){ msg.textContent = t; msg.hidden = false; msg.classList.toggle('bad', !!bad); }
  var $ = function(id){ return document.getElementById(id); };
  function fill(box){ $('display_name').value = box.display_name; $('short_name').value = box.short_name; $('logo_url').value = box.logo_url; $('c_primary').value = box.colors.primary; $('c_accent').value = box.colors.accent; $('c_on').value = box.colors.on_primary; $('contact_email').value = box.contact_email; $('support_email').value = box.support_email; $('f_public_schedule').checked = !!box.features.public_schedule; $('f_public_standings').checked = !!box.features.public_standings; $('f_team_hubs').checked = !!box.features.team_hubs; }
  function read(){ var cur = lg.settings && typeof lg.settings === 'object' ? lg.settings : {}; return Object.assign({}, cur, { schema_version: 1, display_name: $('display_name').value.trim(), short_name: $('short_name').value.trim(), logo_url: $('logo_url').value.trim() || CP.DEFAULTS.logo_url, colors: { primary: $('c_primary').value, accent: $('c_accent').value, on_primary: $('c_on').value }, contact_email: $('contact_email').value.trim(), support_email: $('support_email').value.trim(), features: { public_schedule: $('f_public_schedule').checked, public_standings: $('f_public_standings').checked, team_hubs: $('f_team_hubs').checked } }); }
  CP.requireSession().then(function(s){ if (!s) return; return CP.loadLeague(r.league).then(function(l){ if (!l) { say('You do not have access to this league.', true); return; } lg = l; $('back').href = '/l/' + l.slug; var box = CP.paint(l.settings); fill(box); }); });
  ['c_primary','c_accent','c_on'].forEach(function(id){ $(id).addEventListener('input', function(){ CP.paint(read()); }); });
  $('f').addEventListener('submit', function(e){ e.preventDefault(); var box = read(); CP.client().from('cp_leagues').update({ settings: box }).eq('id', lg.id).select().then(function(x){ if (x.error || !x.data || !x.data.length) { say('Could not save. You may not be an admin of this league.', true); return; } lg = x.data[0]; CP.paint(box); say('Saved.'); }); });
})();
</script>
</body></html>
```

- [ ] **Step 5: Browser check on production**

After commit and push: as Coach (platform admin after the mirror) open `/l/bls/admin/settings`, change the primary color, Save, reload: color persists and `/l/bls` header shows it. Open `/l/bls/t/cougars`: roster of 14, each row "no guardian yet / not sent". Tap "Invite parent" on one row with a test email ending in `@zz-cp-test.invalid`: toast says sending is off; row shows "not sent"; delete that invite row with SQL afterward (`delete from cp_invites where email like '%@zz-cp-test.invalid'`).

- [ ] **Step 6: Run smoke, commit, push**

Run: `node tests/cp.smoke.mjs`. Expected: all PASS.
```bash
git add cp/league.html cp/team.html cp/settings.html tests/cp.smoke.mjs
touch ~/.tests-passed
git commit -m "cp spine: league, team roster with invite state, settings box editor"
git push origin main
```

---

### Task 10: Mirror BLS and the Cougars (one-time, read-only)

**Files:**
- Create: `scripts/cp-division-ages.json`
- Create: `scripts/cp-mirror-bls.mjs`
- Test: dry-run report + `tests/cp.smoke.mjs` live count check

**Interfaces:**
- Consumes: `flm_settings`, `flm_teams`, `flm_coaches`, `cougars_players` (read with service role), Task 1 tables.
- Produces: `cp_leagues` row `bls`; one `cp_teams` row per active `flm_teams` row with `source_flm_team_id`; `cp_people` + `head_coach` memberships `status='invited'` for every `flm_coaches` row with an email; Cougars players; Coach's three hats; `cp_settings.mirror_report`; file `~/Workspace/ops/cp-mirror-report-<date>.md`.

- [ ] **Step 1: Division to age band map**

Create `scripts/cp-division-ages.json` (Little League age charts; Coach confirms before the production run):

```json
{
  "T-Ball": [4, 6], "TB": [4, 6],
  "Coach Pitch": [6, 8], "CP": [6, 8], "Minors A": [6, 8], "Min-A": [6, 8],
  "AA": [7, 9], "Min-AA": [7, 9],
  "AAA": [8, 10], "Min-AAA": [8, 10],
  "Minors B": [8, 10], "Minors": [9, 11], "Majors": [10, 12], "Juniors": [12, 14],
  "default": [6, 12]
}
```

- [ ] **Step 2: Write the mirror script**

Create `scripts/cp-mirror-bls.mjs`:

```js
#!/usr/bin/env node
// One-time mirror of BLS (Field Command) + Cougars into the cp_ spine. READ-ONLY on flm_/cougars_ tables.
// Usage: CP_SERVICE_ROLE_KEY=... node scripts/cp-mirror-bls.mjs --dry-run   (prints report, writes nothing)
//        CP_SERVICE_ROLE_KEY=... node scripts/cp-mirror-bls.mjs --apply     (writes cp_ rows, no emails ever)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const URL_ = 'https://geigvuysptjvvqanumld.supabase.co';
const SRK = process.env.CP_SERVICE_ROLE_KEY; if (!SRK) { console.error('CP_SERVICE_ROLE_KEY missing'); process.exit(2); }
const APPLY = process.argv.includes('--apply');
const db = createClient(URL_, SRK, { auth: { persistSession: false } });
const AGES = JSON.parse(fs.readFileSync(new URL('./cp-division-ages.json', import.meta.url)));
const SEASON = 'Fall 2026';
const COACH_EMAIL = 'daniel.grande@ymail.com';
const COUGARS_FLM_NAME = /Grande/i;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
function ageBand(division) { const d = String(division || ''); for (const k of Object.keys(AGES)) if (k !== 'default' && d.toLowerCase().includes(k.toLowerCase())) return AGES[k]; return AGES.default; }
function sportOf(division, name) { const s = (division + ' ' + name).toLowerCase(); return /sb|softball/.test(s) ? 'softball' : 'baseball'; }

const report = { started: new Date().toISOString(), apply: APPLY, league: null, teams: { created: 0, existing: 0 }, coaches: { created_people: 0, memberships: 0, no_email: [] }, players: 0, coach_hats: [], unmatched: [], notes: [] };

const { data: settings } = await db.from('flm_settings').select('key,value');
const S = Object.fromEntries((settings || []).map(r => [r.key, r.value]));
const leagueName = S.league_name || 'Bonney Lake Sumner Little League';
const box = { schema_version: 1, display_name: leagueName, short_name: 'BLS', logo_url: '/CoachPilot-AppIcon.png', colors: { primary: '#B4151B', accent: '#1A1A1A', on_primary: '#FFFFFF' }, contact_email: S.contact_email || '', support_email: COACH_EMAIL, routing: S.routing || {}, practice_rules: S.practice_rules || {}, features: { public_schedule: false, public_standings: false, team_hubs: false } };

let league = (await db.from('cp_leagues').select('*').eq('slug', 'bls').maybeSingle()).data;
if (!league) { report.league = 'create'; if (APPLY) league = (await db.from('cp_leagues').insert({ slug: 'bls', name: leagueName, short_name: 'BLS', sports: ['baseball', 'softball'], settings: box }).select().single()).data; }
else report.league = 'exists';

const { data: flmTeams } = await db.from('flm_teams').select('id,name,division,nickname,coach_email,is_active').eq('is_active', true);
const { data: flmCoaches } = await db.from('flm_coaches').select('id,name,email,phone,team_id,active');
const teamMap = new Map();
for (const t of flmTeams || []) {
  const existing = (await db.from('cp_teams').select('id').eq('source_flm_team_id', t.id).maybeSingle()).data;
  if (existing) { report.teams.existing++; teamMap.set(t.id, existing.id); continue; }
  const [age_min, age_max] = ageBand(t.division);
  const name = t.nickname ? `${t.name} ${t.nickname}` : t.name;
  const row = { league_id: league?.id, slug: slugify(name), name, sport: sportOf(t.division, t.name), age_min, age_max, season_label: SEASON, source_flm_team_id: t.id, settings: { schema_version: 1 } };
  report.teams.created++;
  if (APPLY) { const { data, error } = await db.from('cp_teams').insert(row).select().single(); if (error) { report.unmatched.push({ team: name, error: error.message }); continue; } teamMap.set(t.id, data.id); }
}
for (const c of flmCoaches || []) {
  if (!c.email) { report.coaches.no_email.push(c.name); continue; }
  const email = c.email.trim().toLowerCase();
  const teamId = teamMap.get(c.team_id);
  if (!teamId) { report.unmatched.push({ coach: c.name, reason: 'team not mirrored' }); continue; }
  if (APPLY) {
    const { data: person, error } = await db.from('cp_people').upsert({ email, name: c.name || email, phone: c.phone || null }, { onConflict: 'email' }).select().single();
    if (error) { report.unmatched.push({ coach: c.name, error: error.message }); continue; }
    report.coaches.created_people++;
    const dup = (await db.from('cp_memberships').select('id').eq('person_id', person.id).eq('team_id', teamId).eq('role', 'head_coach').maybeSingle()).data;
    if (!dup) { await db.from('cp_memberships').insert({ person_id: person.id, team_id: teamId, role: 'head_coach', status: email === COACH_EMAIL ? 'active' : 'invited', season_label: SEASON, activated_at: email === COACH_EMAIL ? new Date().toISOString() : null }); report.coaches.memberships++; }
  } else { report.coaches.created_people++; report.coaches.memberships++; }
}
// Cougars players + Coach's hats
const cougarsFlm = (flmTeams || []).find(t => COUGARS_FLM_NAME.test(t.name) && /SB|softball/i.test(t.division + ' ' + t.name));
if (!cougarsFlm) report.notes.push('Cougars flm team not found by /Grande/ + softball; players not mirrored');
else {
  const cougarsTeamId = teamMap.get(cougarsFlm.id);
  const { data: kids } = await db.from('cougars_players').select('name,jersey,number,first_name,last_name');
  for (const k of kids || []) {
    const first = k.first_name || String(k.name || '').split(' ')[0]; const last = k.last_name || String(k.name || '').split(' ').slice(1).join(' ');
    report.players++;
    if (APPLY && cougarsTeamId) { const exists = (await db.from('cp_players').select('id').eq('team_id', cougarsTeamId).eq('first_name', first).eq('last_name', last).maybeSingle()).data; if (!exists) await db.from('cp_players').insert({ team_id: cougarsTeamId, season_label: SEASON, first_name: first, last_name: last, jersey: k.jersey || k.number || null }); }
  }
  if (APPLY) {
    const coach = (await db.from('cp_people').select('id').eq('email', COACH_EMAIL).maybeSingle()).data;
    if (coach) {
      for (const m of [{ role: 'platform_admin' }, { role: 'league_admin', league_id: league.id }]) {
        const dup = (await db.from('cp_memberships').select('id').eq('person_id', coach.id).eq('role', m.role).maybeSingle()).data;
        if (!dup) { await db.from('cp_memberships').insert({ person_id: coach.id, role: m.role, league_id: m.league_id || null, status: 'active', activated_at: new Date().toISOString() }); report.coach_hats.push(m.role); }
      }
    } else report.notes.push('Coach person row not found; hats not created');
  }
}
report.finished = new Date().toISOString();
const md = `# cp mirror report ${report.finished}\n\nmode: ${APPLY ? 'APPLY' : 'DRY RUN'}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`;
const out = path.join(os.homedir(), 'Workspace', 'ops', `cp-mirror-report-${report.finished.slice(0, 10)}${APPLY ? '' : '-dryrun'}.md`);
fs.writeFileSync(out, md);
if (APPLY) await db.from('cp_settings').upsert({ key: 'mirror_report', value: report, updated_at: new Date().toISOString() });
console.log(md); console.log('written to', out);
```

- [ ] **Step 3: Dry run, confirm with Coach**

Run: `CP_SERVICE_ROLE_KEY=<key> node scripts/cp-mirror-bls.mjs --dry-run`
Expected: report shows league `create`, ~36 teams created, ~27 to 36 coaches with email, `no_email` list, 14 players, zero `unmatched` or a short list. Hand Coach the `cp-division-ages.json` map and the `no_email` and `unmatched` lists; get his OK before `--apply`.

- [ ] **Step 4: Back up, then apply**

```bash
mkdir -p ~/Workspace/ops/backups && D=$(date +%F)
for t in flm_teams flm_coaches flm_settings cougars_players; do
  curl -s "https://geigvuysptjvvqanumld.supabase.co/rest/v1/$t?select=*" -H "apikey: $CP_SERVICE_ROLE_KEY" -H "Authorization: Bearer $CP_SERVICE_ROLE_KEY" > ~/Workspace/ops/backups/$t-pre-cp-mirror-$D.json
done
shasum -a 256 ~/Workspace/ops/backups/*-pre-cp-mirror-$D.json
CP_SERVICE_ROLE_KEY=<key> node scripts/cp-mirror-bls.mjs --apply
```
Expected: same counts as the dry run, report written, `cp_settings.mirror_report` set. Then `/me` as Coach shows three cards (BLS admin, Cougars head coach; the parent card arrives in Step 5).

- [ ] **Step 5: Coach's parent hat**

Coach adds himself as guardian of his daughter from `/l/bls/t/<cougars-slug>`: "Invite parent" with his own ymail is pointless (same person). Instead run once:
```sql
insert into cp_guardians (player_id, person_id, relationship, is_primary, status, approved_by)
select p.id, c.id, 'parent', true, 'approved', c.id from cp_players p, cp_people c
where p.first_name = 'Lily' and p.last_name = 'Grande' and c.email = 'daniel.grande@ymail.com' on conflict do nothing;
insert into cp_memberships (person_id, team_id, role, status, activated_at)
select c.id, p.team_id, 'guardian', 'active', now() from cp_players p, cp_people c
where p.first_name = 'Lily' and p.last_name = 'Grande' and c.email = 'daniel.grande@ymail.com';
```
Expected: `/me` shows the third card "Parent, Cougars".

- [ ] **Step 6: Live count check in smoke**

Append to `tests/cp.smoke.mjs` (read-only, uses the gateway with no auth so it cannot see data; instead verify the mirror report exists via a platform-admin-free signal: the league slug is reachable only when signed in, so check the report file):
```js
section('mirror: report file present');
const reports = fs.readdirSync(path.join(process.env.HOME, 'Workspace', 'ops')).filter(f => /^cp-mirror-report-\d{4}-\d{2}-\d{2}\.md$/.test(f));
(reports.length ? ok : fail)('apply report exists: ' + (reports[reports.length - 1] || 'none'));
```

- [ ] **Step 7: Commit**

```bash
git add scripts/cp-mirror-bls.mjs scripts/cp-division-ages.json tests/cp.smoke.mjs
touch ~/.tests-passed
git commit -m "cp spine: one-time BLS + Cougars mirror (read-only on source tables)"
git push origin main
```

---

### Task 11: Second-league proof and wrap-up

**Files:**
- Modify: `tests/cp.rls.mjs` (already proves two leagues cannot see each other; no change)
- Modify: `supabase/functions/cp-gateway/DEPLOY.md` (runbook section)
- Modify: `~/.claude/projects/-Users-danielgrande/memory/project-coachpilot-v2-platform.md` (append status)

- [ ] **Step 1: Create a second league as Coach through the UI path**

Signed in as Coach, run from the browser console on `/me`:
```js
await CP.gateway('league_create', { slug: 'zz-demo-league', name: 'Demo League', short_name: 'DEMO', sports: ['softball'] });
```
Expected: `{ status: 200, body: { ok: true, league: {...} } }`. `/me` now shows a "League admin, Demo League" card. Open `/l/zz-demo-league/admin/settings`, set a blue primary, Save. Open `/l/zz-demo-league`: blue header, "No teams visible". Open `/l/bls`: still red. Then delete the demo league: `delete from cp_leagues where slug = 'zz-demo-league'` (cascades memberships).

- [ ] **Step 2: Runbook**

Append to `DEPLOY.md`:

```markdown
## Runbook
- Tests: node tests/cp.smoke.mjs ; node tests/cp-core.test.mjs ; CP_SERVICE_ROLE_KEY=... node tests/cp.rls.mjs ; CP_SERVICE_ROLE_KEY=... node tests/cp.gateway.mjs
- Kill switches live in cp_settings: email_enabled, push_enabled, self_create_teams. Flip with: update cp_settings set value='true'::jsonb, updated_at=now() where key='email_enabled';
- Nothing links to /me, /signin, /join, /l, /t from public pages. Keep it that way until Coach says.
- The mirror is one-time. Re-running --apply is idempotent for teams (source_flm_team_id), people (email) and memberships (person+team+role).
```

- [ ] **Step 3: Memory + HQ**

Append to `project-coachpilot-v2-platform.md`: date, "Spine (sub-project 1) shipped: cp_ tables, cp-gateway, /me, /join, league/team/settings pages, BLS + Cougars mirrored read-only, email off. Next: Game Plans on the spine (sub-project 2 spec)." Write `~/.hq-session.json` with the same.

- [ ] **Step 4: Final full test run and commit**

```bash
node tests/cp.smoke.mjs && node tests/cp-core.test.mjs && CP_SERVICE_ROLE_KEY=<key> node tests/cp.rls.mjs && CP_SERVICE_ROLE_KEY=<key> node tests/cp.gateway.mjs && node tests/fields.smoke.mjs
touch ~/.tests-passed
git add supabase/functions/cp-gateway/DEPLOY.md
git commit -m "cp spine: runbook; second-league proof done"
git push origin main
```
Expected: every suite passes, including the untouched Field Command suite (proof that production was not affected).

---

## Self-review notes

- Spec coverage: section 3 tables (Task 1), section 4 sign-in and invites (Tasks 2, 4, 7, 8), section 5 roles (Task 1 policies + Task 3 matrix), section 6 settings box (Tasks 6, 9), section 7 URLs (Task 5), section 8 mirror (Task 10), section 9 `/me` (Task 7), section 10 gateway (Task 4), section 11 tests and kill switches (Tasks 1, 3, 4, 11), section 12 out of scope (no tasks touch `flm_`/`cougars_`/`ondeck_`). Staging as a second Supabase project is NOT in this plan: the Mac has no Docker and the free org is at its two-project cap; `cp_`-only additive migrations plus the disposable `zz-cp-test` league stand in for it. Flagged to Coach at handoff.
- Review Focus items: 1 and 2 and 3 in Task 4 tests; 4 in Task 3 ("two people rows"); 5 in Task 6 unit tests.
- Names used consistently: `cp_my_hats`, `CP.mergeBox`, `CP.paint`, `CP.gateway`, `CP.route`, `CP.loadLeague`, `CP.loadTeam`, gateway actions as listed in Task 4 interfaces.
- Anon key placeholder `sb_publishable_REPLACE_WITH_PROJECT_ANON_KEY` appears in four files; the implementer replaces it in Task 1 and reuses the same literal everywhere (it is public).
