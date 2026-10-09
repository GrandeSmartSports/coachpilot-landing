# CoachPilot Spine: Design Spec

**Date:** 2026-10-08
**Status:** Approved in conversation by Coach (sections 1-7), pending written review
**Sub-project:** 1 of the CoachPilot assembly plan (spine). Game Plans on the spine is sub-project 2 with its own spec.
**Owner:** Cortex. Builders: Forge. QA: Patch.
**Companion:** `~/Workspace/ops/COACHPILOT-PLATFORM-DESIGN-2026-08-25.md` (platform design, Sections 1-4, 7-10 inform this spec). Assembly plan artifact: https://claude.ai/artifact/2iCYoxSqopMyohgHF5hP1b

## 1. Purpose

Give every CoachPilot surface one answer to "who are you and which team are you on." The spine is accounts, people, leagues, teams, memberships, kids and guardians, invites, per-league branding, and the `/me` page. It ships sealed off: nothing in production changes and nobody outside Coach is contacted until Coach flips a switch.

Success for this sub-project:
- Coach signs in once with his email and sees his three hats (BLS admin, Cougars head coach, parent) on `/me`.
- BLS, its 36 coaches, the Cougars and 14 players exist in the spine as a read-only mirror, with zero emails sent.
- Row-rule tests prove a coach, an assistant, a guardian and a stranger each see exactly what section 5 allows.
- A second league can be created from the admin settings page and cannot read a single BLS row.

## 2. Decisions already made (do not reopen)

| Decision | Choice | Why |
|---|---|---|
| Sign-in | Supabase Auth email OTP (6-digit code). No passwords. | Simplest for everyone, nothing stored in plain text, native to the stack. |
| Home | coachpilot.org, repo `coachpilot-landing`, new paths. | One domain, one identity. Built for growth over speed. |
| Guarding | Database row-level security keyed on `cp_memberships`. One small edge function (`cp-gateway`) for privileged jobs only. | Walls enforced in storage; least code per feature. |
| Stack | Plain HTML + supabase-js, same as everything live. | Proven under real users. LeaguePortal's Next.js app stays shelved; its schema is a reference only. |
| Branding | Per-league and per-team settings box; pages paint from it. League admin edits their own. | Principle 2: leagues run themselves. BLS must look like BLS. |
| Onboarding | Invite-only. Standalone-team self-create is a later switch. | Coach controls every entry until the second league is live. |
| Pilots | Decide later. | Nothing in this sub-project depends on it. |
| Production | `flm_`, `cougars_`, `ondeck_` tables and apps untouched. | Nothing in motion for the fall season changes. |

## 3. Data model

All tables prefixed `cp_`, in the CoachPilot Supabase project `geigvuysptjvvqanumld`. Register the prefix in the backend contract before the first migration.

### cp_people
One row per adult, forever.
- `id uuid pk`, `auth_user_id uuid unique null` (links to `auth.users`; null until first sign-in), `email citext unique`, `name text`, `phone text null`, `photo_url text null`, `created_at`, `updated_at`.
- Rule: email is the identity key. An invite to a known email attaches to the existing person.

### cp_leagues
- `id uuid pk`, `slug text unique` (`bls`), `name text`, `short_name text`, `sports text[]`, `timezone text default 'America/Los_Angeles'`, `settings jsonb` (section 6), `is_active bool`, `created_at`.

### cp_teams
- `id uuid pk`, `league_id uuid null fk cp_leagues`, `slug text` (unique within league; unique globally when league is null), `name text`, `sport text`, `age_min int`, `age_max int`, `season_label text` (`Fall 2026`), `settings jsonb` (overrides: colors, logo), `is_active bool`, `created_at`.
- A team with `league_id null` is a standalone team and is first-class.

### cp_memberships
One row per hat.
- `id uuid pk`, `person_id fk cp_people`, `league_id null fk`, `team_id null fk`, `season_label text`, `role text check in ('platform_admin','league_admin','league_scheduler','head_coach','assistant_coach','guardian')`, `status text check in ('invited','active','ended')`, `invited_by null fk cp_people`, `created_at`, `activated_at null`, `ended_at null`.
- Exactly one of `league_id` / `team_id` is set, except `platform_admin` (both null).
- `guardian` memberships are derived from `cp_guardians` for access checks; the row exists so `/me` can list hats uniformly.

### cp_players
Kids. Never a login.
- `id uuid pk`, `team_id fk cp_teams`, `season_label text`, `first_name text`, `last_name text`, `birthdate date null`, `jersey text null`, `is_active bool`, `created_at`.
- Birthdate is the claim check for guardians (section 4). It is never displayed to anyone but the kid's guardians and the head coach.

### cp_guardians
- `id uuid pk`, `player_id fk cp_players`, `person_id fk cp_people`, `relationship text` (`parent`,`grandparent`,`other`), `is_primary bool`, `status text check in ('pending','approved')`, `approved_by null fk cp_people`, `created_at`.
- First guardian on a kid is primary and auto-approved when they arrive through the coach's invite. Additional guardians are `pending` until the primary guardian or the head coach approves.

### cp_invites
- `id uuid pk`, `token text unique`, `email citext`, `role text`, `league_id null`, `team_id null`, `player_id null` (for guardian invites), `invited_by fk cp_people`, `expires_at timestamptz` (30 days), `sent_at null`, `accepted_at null`, `created_at`.
- State shown on rosters: not sent (`sent_at null`), sent, accepted.

### cp_settings (platform)
- `key text pk`, `value jsonb`. Keys: `email_enabled` (false), `push_enabled` (false), `self_create_teams` (false).

### cp_audit
- `id`, `actor_person_id`, `action text`, `subject_table text`, `subject_id uuid`, `meta jsonb`, `created_at`. Every write that touches a kid row or an invite logs here. Append-only.

## 4. Sign-in and invite chain

**Sign-in:** Supabase Auth, email OTP, 6 digits, 30-day sessions with silent refresh. On first successful sign-in, a trigger links `auth.users.id` to `cp_people.auth_user_id` by email (creating the person row if none exists). Password sign-in is disabled for the spine. OnDeck's existing password accounts are unaffected (separate app, same auth project; the spine never reads `ondeck_*`).

**Invite chain:**
1. Platform admin (Coach) invites a league admin or head coach.
2. Head coach invites assistant coaches and guardians (per player).
3. A guardian can invite a second guardian for their kid; the primary guardian or the head coach approves.
4. Nobody else can invite. Assistants and guardians cannot.

**Accepting an invite:** `/join/<token>`. Known email: sign in by code, membership flips to `active`, land on the target team or league. Unknown email: one screen (name), then code, then same. Guardian invites additionally ask the guardian to confirm the kid's birthdate before the guardian row is approved; three wrong tries locks the invite and flags the coach.

**Sending:** `cp-gateway` action `invite_send`. Honors `cp_settings.email_enabled`. When false, logs the intended send to `cp_audit` and marks nothing as sent. Resend is one tap on the roster.

## 5. Roles and access (enforced by RLS)

| Role | Can see | Can change | Cannot |
|---|---|---|---|
| platform_admin | leagues, teams, people, memberships, audit, usage | leagues, platform settings, league admin invites | team content by default (no implicit team membership) |
| league_admin | everything in their league: teams, rosters, memberships, schedules | league settings box, teams, coach invites | any coach's private notes (future), other leagues |
| league_scheduler | schedules and fields in their league | schedules | rosters, settings, invites |
| head_coach | their team end to end, including guardians' contact info | roster, players, assistant and guardian invites, team settings overrides | other teams, league settings |
| assistant_coach | everything the head coach sees except guardian contact details | drafts (future, Game Plans) | publish, invite, edit roster |
| guardian | their kid(s), the team's published content, schedule, hub | their own profile, second-guardian invite | other kids' details, roster contact info, drafts |

RLS pattern: every `cp_` table policy joins `cp_memberships` (or `cp_guardians`) on `auth.uid()` via `cp_people.auth_user_id`. Helper SQL functions: `cp_my_person_id()`, `cp_is_team_member(team_id, roles[])`, `cp_is_league_member(league_id, roles[])`, `cp_is_guardian_of(player_id)`. No table has a permissive anon policy. Service role is used only inside `cp-gateway`.

## 6. Branding: the settings box

`cp_leagues.settings` and `cp_teams.settings` (jsonb, versioned with `schema_version`):

```
{
  "schema_version": 1,
  "display_name": "Bonney Lake Sumner Little League",
  "short_name": "BLS",
  "logo_url": "...",
  "colors": { "primary": "#B4151B", "accent": "#1A1A1A", "on_primary": "#FFFFFF" },
  "contact_email": "...",
  "support_email": "...",
  "routing": { "field_issue": "fields@...", "equipment_bb": "...", "player_agent_by_division": { "Minors A SB": "..." } },
  "practice_rules": { ... },
  "features": { "public_schedule": false, "public_standings": false, "team_hubs": false }
}
```

- Pages load the box once, set CSS variables, title, favicon and logo from it. No league or team string lives in code.
- Team box inherits league box; team may override `colors`, `logo_url`, `display_name`.
- League admin edits their box at `/l/<slug>/admin/settings`. Platform admin can edit any.
- Missing keys fall back to CoachPilot defaults; `schema_version` lets old boxes keep working when keys are added.

## 7. URLs

- `/me` signed-in home
- `/join/<token>` invite acceptance
- `/l/<league>` league home (gated until `features.public_schedule` etc. are on)
- `/l/<league>/admin` league admin, `/l/<league>/admin/settings` the box
- `/l/<league>/t/<team>` team home; `/t/<team>` standalone team
- Later: `<league>.coachpilot.org` CNAME to the same pages (not in this sub-project).
- None of these are linked from any existing public page until Coach says.

## 8. Mirroring BLS and the Cougars (one-time, read-only)

A script (`scripts/cp-mirror-bls.mjs`), run against staging first, then production, with a pre-run backup:
1. Insert BLS as `cp_leagues` (slug `bls`) with a settings box built from `flm_settings` (league name, routing emails, practice rules).
2. For each active `flm_teams` row: insert `cp_teams` (division, sport, coach-derived name, `season_label 'Fall 2026'`, age band from division map).
3. For each `flm_coaches` row: upsert `cp_people` by email; insert `head_coach` membership on their team(s) with `status 'invited'`, `sent_at null`. No invite row is sent. Field Command sign-in is untouched.
4. Cougars: ensure the team row maps to the Cougars `flm_teams` row; insert 14 `cp_players` from `cougars_players`; insert Coach as `head_coach` active, `league_admin` active on BLS, `platform_admin` active, and guardian of his daughter.
5. Write a mirror report (counts, unmatched rows) to `~/Workspace/ops/cp-mirror-report-<date>.md`.

The mirror does not create a link. Field Command, the Cougars hub and Game Plans continue to read their own tables. The later switches that point them at the spine are separate sub-projects.

## 9. The /me page

- Top strip: next practice, next game, items waiting on you (pending guardian approvals, unsent invites). Sourced from the spine only; Field Command games are not read in this sub-project.
- Hat cards: one per active membership, painted with that league's or team's box. Tap to enter.
- Phone: bottom tabs (Home, Teams, Inbox, Me). Desktop: same content, wider. Same DOM, CSS show-hide, never forked (mobile tab shell rule).
- Empty state for a person with one hat: the card is the page.

## 10. cp-gateway (edge function, service role)

Actions, each PIN-free and auth-token-gated (verifies the caller's Supabase session, then checks membership server-side):
- `invite_create`, `invite_send`, `invite_resend`, `invite_revoke`
- `invite_accept` (token + code already verified client-side via Supabase Auth; this flips membership and guardian rows)
- `guardian_approve`
- `league_create` (platform_admin only)
- `mirror_status` (platform_admin only; reads the latest mirror report)
Everything else (reads, roster edits, settings box edits) goes straight through RLS from the page.
Deploy with `--no-verify-jwt` is NOT used here; this function verifies JWTs. Document that difference next to the flm-gateway deploy note.

## 11. Testing and kill switches

- `tests/cp.rls.mjs`: creates four test users on staging (coach, assistant, guardian, stranger) plus a second league; asserts every row in section 5. Runs on every commit touching `cp_` or `cp-gateway`. Test data is cleaned at the end of the run.
- `tests/cp.smoke.mjs`: sign-in by code against staging, `/me` renders hats, `/join` happy path, box paints CSS variables.
- `email_enabled=false`, `push_enabled=false`, `self_create_teams=false` at launch. Any send path reads the flag at call time.
- Staging = second free Supabase project (new, named `coachpilot-staging`). No production migration runs before the same migration passed on staging.
- Backups: pg_dump of `flm_`, `cougars_`, `ondeck_` before the production mirror, SHA-verified, three copies, per the live-data rule, even though the mirror only reads them.

## 12. Out of scope (this sub-project)

- Game Plans on the spine (sub-project 2).
- Team hub template, Field Command multi-league, player development (phases 3 to 5).
- 13 to 17 player accounts, SMS, payments, iOS, subdomains, public pages, course/LMS work.
- Any change to `flm_`, `cougars_`, `ondeck_` tables or apps.

## 13. Open questions (answer before planning, not blocking the spec)

- Division to age band map for BLS teams (T-Ball through Majors): Cortex will propose from Little League age charts; Coach confirms.
- Which email is Coach's spine identity: `Daniel.Grande@ymail.com` (matches Field Command and OnDeck admin).
