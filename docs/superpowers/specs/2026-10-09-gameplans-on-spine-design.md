# Game Plans on the Spine: Design Spec

**Date:** 2026-10-09
**Status:** Draft for Coach's approval (one-screen brief published separately)
**Sub-project:** 2 of the CoachPilot assembly plan. Depends on sub-project 1 (spine), merged to main 2026-10-09.
**Owner:** Cortex. Builders: Forge. QA: Patch.
**Companions:** spine spec `docs/superpowers/specs/2026-10-08-coachpilot-spine-design.md`; engine map (recon 2026-10-09) summarized in section 3; source engine `~/Projects/OnDeck/pwa/index.html` (lines 2795 to 4185 engine and sync, 5488 to 8530 UI).

## 1. Purpose

Let a coach who is not Coach run a full game week with the Game Plans engine: build attendance, batteries, batting order and a fair fielding rotation, publish it, and have assistants and parents see it, all under real accounts and roles on the spine. Coach touches nothing.

Success:
- A pilot coach, invited through the spine, creates a game, builds and publishes a lineup from their phone, and their assistant and parents see it on their own phones.
- The rotation engine produces the same quality lineups it does for the Cougars today (same rules: no back-to-back sits, outfield as a secondary sit, anchor positions, innings-played awareness) and never crashes on a full bench.
- Row-level security proves: assistant reads and drafts but cannot publish; guardians see only the published plan and only their own kid's notes; a coach on another team sees nothing.
- The Cougars keep running on the current app for the rest of Fall 2026 (Coach's rule). Nothing in `ondeck_*` changes.

## 2. Decisions (recommended by Cortex; Coach can override any)

| Decision | Choice | Why |
|---|---|---|
| Engine | Extract the pure functions into `cp/gameplans-engine.js` (UMD, no globals), unit-tested with fixtures built from real Cougars history. Fix the three known bugs on the way. | The rules are the product. Testing them in isolation is the only way to keep them while re-hosting. |
| Where plans live | New `cp_` tables (section 4). No reuse of `ondeck_*`. | Walls by tenant; the old tables are single-team by construction. |
| Draft vs published | Two tables: `cp_game_plans` (draft, coaches only) and `cp_game_plans_published` (what parents see). Publish copies draft to published. | RLS is row-level; the published copy is the wall between coach work-in-progress and families. |
| Assistant coaches | Can edit the draft (attendance, batteries, order, positions). Cannot publish, cannot invite. | Spec section 5 of the spine; assistants help build lineups in practice. |
| Parent notes | In scope. Parents write a note about their own kid or a general note; coach sees an inbox, can acknowledge and reply. Coach notes about players are private to staff. | Coach uses this today; it is small and it is the relationship feature. |
| Fairness history | Per team, from that team's published plans marked final, with `actual_innings_played`. A coach sets "game ended after inning N" on the plan when the game is over. | Replaces the manual GameChanger backfill; the engine already reads this field. |
| Player preferences | `cp_player_prefs(player_id, positions[])` edited by the head coach. | Same as `gpRoster.positions` today, but stored. |
| Cougars migration | Not now. A later one-time script copies Cougars history into `cp_game_plans_published` when Coach chooses to move. | Coach's rule: Cougars stay on the current app this season. |
| GameChanger push, walk-up music, DJ | Out of scope. | Separate tools; music is already its own app. |
| Pilot coaches | Two, named by Coach. Fresh history (their first spine game is game one). | Nothing to migrate for them. |
| URLs | `/l/<league>/t/<team>/games` (list), `/l/<league>/t/<team>/games/<gameId>/plan` (coach working page), `/l/<league>/t/<team>/games/<gameId>` (published view). Standalone teams use `/t/<team>/...`. | Matches the spine's path scheme. |

## 3. The engine (what gets extracted)

From the recon map of `index.html`:

Constants: `ALL_POS`, `TEN_POS`, `IF_POS`, `OF_POS`, `activePositions(state)`, `fieldSize(state)`, `expandPrefs(prefs, state)`.

Pure functions, with the globals they currently reach into replaced by parameters:

| Function | Signature in the module |
|---|---|
| `createFreshState(roster)` | roster = `[{ id, name, positions[] }]` |
| `generateInnings(state, { roster, history, rng })` | `history` = array of final plans for this team; `rng` injectable for tests; fixes the `sitCounts[rescue]--` crash (line 3972) by decrementing `gameSits` |
| `adjustLineupForRemoval(state, name, roster)` / `adjustLineupForAddition(state, name, roster)` | |
| `applyBatteries(state)` | returns a new state; uses `activePositions` (fixes the 9-fielder hardcode at 6524/6539) |
| `applyPosChange(state, inning, name, pos)` / `swapPlayers(state, inning, a, b)` | return new state |
| `computeFairStats(state, innings)` | `present` from `state.attendance`; inning footer valid when on-field count equals `fieldSize(state)` (fixes 6981) |
| `getPlayerGameHistory(history, name)` / `getPlayerSeasonStats(history, name)` | slice each game to `actual_innings_played` |
| `getBatOrderHistory(history, meta, seasonStart, today)` | no hardcoded `'2026-08-01'`; `seasonStart` comes from the team's season |
| `canSeeLineup(meta, role)` | role from memberships, not PIN users |
| `sanitizePublishState(state)` | strips `notes`, `playerNotes` |

State shape (unchanged, now documented): `battingOrder[]`, `attendance{}`, `batteries[{pitcher, catcher, innings[]}]`, `totalInnings`, `fielderCount` (9 or 10), `innings[{field[{pos,name}], sit[], battery}]`, `playerPositions{}`. Names stay as the key inside the state (the engine is name-based); the plan row carries a `roster_snapshot` mapping `player_id` to `name` so renames do not corrupt history.

Rules to preserve exactly (they are the product): sit scoring (`gameSits x 10`, x4 from inning 5, `satLastInning +6`, season bias), most-constrained-first assignment, position scorer (repeat penalty, infield/outfield balance, anchor at 50 percent share, outfield as secondary sit `+6` back-to-back and `+2.5` per OF inning), fallback chain (preferred, same category, rescue bench). The unit tests pin each of these with a fixture.

Test fixture: a JSON export of the Cougars' five final games (anonymized names like P01..P13) with `actual_innings_played`, plus the roster. Tests assert: no player sits two innings in a row when the bench allows; nobody plays OF back-to-back when avoidable; each inning fills exactly `fieldSize` positions; a full bench never throws; 10-fielder mode fills LC/RC; batteries land on the right innings; fairness totals sum correctly; bat-order averages exclude today's game.

## 4. Data model (additive, `cp_` only)

### cp_games
- `id uuid pk`, `team_id fk cp_teams`, `season_label text`, `opponent text`, `game_date date`, `game_time text`, `location text`, `kind text check in ('game','scrimmage')`, `status text check in ('scheduled','final','cancelled')`, `actual_innings_played int`, `created_by fk cp_people`, `created_at`, `updated_at`.
- RLS: head_coach and assistant_coach of the team and league_admin read; head_coach writes; guardians of a player on the team read (schedule is family-visible).

### cp_game_plans (draft)
- `game_id uuid pk fk cp_games`, `state jsonb`, `roster_snapshot jsonb` (`{player_id: name}`), `version int default 1`, `updated_by fk cp_people`, `updated_at`.
- RLS: head_coach and assistant_coach of the team read and write; nobody else, including league_admin (a draft is staff business).
- Optimistic concurrency: every write is `update ... where version = $expected`; zero rows = re-pull and merge (same rule the current app uses for drafts, now applied to every write including meta).

### cp_game_plans_published
- `game_id uuid pk fk cp_games`, `state jsonb` (sanitized), `published_at`, `published_by fk cp_people`, `active_inning int`, `completed_innings int[]`.
- RLS: head_coach, assistant_coach, league_admin, and guardians of any player on the team read. Only head_coach inserts/updates (publish, set live inning). Parents never see a draft because it is a different table.

### cp_player_prefs
- `player_id uuid pk fk cp_players`, `positions text[]`, `updated_at`. RLS: head_coach of the player's team all; assistant read.

### cp_game_notes
- `id`, `game_id fk`, `team_id fk`, `player_id null fk cp_players` (null = general), `author_person_id fk cp_people`, `source text check in ('coach','parent')`, `inning int null`, `text text`, `created_at`, `acknowledged_at null`, `reply_text null`, `reply_at null`.
- RLS: head_coach reads all for the team and updates ack/reply; assistant reads coach-source notes; a guardian reads and writes notes where `player_id` is their approved kid or `player_id is null and author = self`; coach-source notes are never visible to guardians.

### cp_audit
- Reused: `plan_published`, `plan_finalized`, `note_acknowledged`, `game_created`, `game_cancelled`.

History for the engine = `select state, actual_innings_played, game_date from cp_games g join cp_game_plans_published p on p.game_id = g.id where g.team_id = $team and g.status = 'final' order by game_date`.

## 5. Pages (plain HTML, `cp/cp-core.js`, `cp/cp.css`)

### Games list: `cp/games.html` at `/l/<league>/t/<team>/games`
- Coach/assistant: upcoming and past games; "New game" form (opponent, date, time, location, kind); tap a game to open its plan (coach) or published view (everyone). "Mark final" on a past game asks "how many innings were played" and writes `actual_innings_played` + `status='final'`.
- Guardian: upcoming games with a "Lineup posted" badge when published.

### Coach working page: `cp/plan.html` at `/l/<league>/t/<team>/games/<id>/plan`
Ported from the Game Prep panel, phone first, same sub-tabs:
- **Attendance**: toggle present; removing a present player runs `adjustLineupForRemoval`.
- **Battery**: pitcher/catcher by inning; 9 or 10 fielders; total innings.
- **Bat order**: drag order; GENERATE (engine) with history-aware averages and "last 3 games" column; notes review (coach notes from this team's history).
- **Field**: the working page shipped on 10/3: By Inning grid + six mini diamonds, tap an inning number to lock totals through that inning, tap a cell to change a position, swap players.
- **Fairness**: Totals slider, By Inning grid, Season overview.
- **Publish** button (head_coach only; assistants see "Ask your head coach to publish"): copies sanitized state into `cp_game_plans_published`, audits. Re-publish allowed any time.
- Live inning control (set active inning, mark complete) writes to the published row (head_coach).
- Coach notes per player (private to staff) live on the plan as `state.playerNotes` only for the draft; persistent notes go to `cp_game_notes` with `source='coach'`.
- Save: debounced 300 ms, optimistic version, "Saved" indicator; a version conflict re-pulls and reapplies the local edit sequence like today.

### Published view: `cp/game.html` at `/l/<league>/t/<team>/games/<id>`
- Everyone with access: batting order, innings grid, live inning highlight, "Lineup coming soon" when not published.
- Guardian: their kid highlighted and auto-scrolled; "Note to coach" about their kid or general.
- Assistant: same as guardian view plus the staff notes.

### Notes inbox: section on `cp/team.html`
- Head coach: unread parent notes with Acknowledge and Reply; replies visible to the author on the published view.

### Nothing else changes in `cp/team.html` except: a "Player positions" control per roster row (writes `cp_player_prefs`), and a "Games" link.

## 6. Roles and access (summary)

| Role | Games | Draft plan | Published plan | Notes |
|---|---|---|---|---|
| head_coach | create/edit/final | read/write | publish, live inning | read all team notes, ack, reply, write coach notes |
| assistant_coach | read | read/write | read | read coach notes, write coach notes |
| league_admin | read | none | read | none |
| guardian | read | none | read | write about own kid or general; read own notes and replies |
| platform_admin | read (support) | none by default | read | none |

## 7. Realtime

One channel per team page: `cp_game_plans_published` changes refresh the published view; `cp_game_notes` inserts refresh the coach inbox. Both tables are added to the realtime publication. Drafts are not broadcast (the current app's HC-ignores-remote rule stays; two coaches editing the same draft rely on the version check).

## 8. Pilot flow (what the two coaches experience)

1. Coach invites them from `/l/bls/t/<team>` (invite exists; email kill switch is turned ON for invites only at this point, by Coach).
2. They sign in with the code, land on `/me`, tap their team.
3. Roster is already mirrored from Field Command? No: Field Command has no kids. They add players (name only) on the team page, set positions for the few who have them, invite parents by email (one tap per row).
4. `/games`: New game. Open the plan. Attendance, battery, GENERATE, adjust on the field page, Publish.
5. Parents who accepted see the published view with their kid highlighted; they can send a note.
6. After the game: Mark final, enter innings played. Next game's GENERATE uses it.

Coach's involvement: send the two invites. That is all.

## 9. Testing and switches

- `tests/gameplans-engine.test.mjs`: fixture-driven unit tests (section 3), runs on every commit, no network.
- `tests/cp.gameplans.rls.mjs`: live access matrix for the five new tables with the four-user harness from the spine (draft invisible to guardian and league_admin; published visible to guardian; assistant cannot publish; stranger sees nothing). Throwaway league, cleanup in `finally`.
- `tests/cp.smoke.mjs`: extended with the new pages' hooks and the no-dash rule.
- Browser proof on the Vercel preview with a throwaway coach: create game, generate, publish, view as a throwaway guardian.
- Switches: `email_enabled` stays off until Coach sends the first invite. No page links to `/games` from any public page. The Cougars app is untouched.

## 10. Out of scope

GameChanger sync, walk-up music and DJ, photo/ICS schedule import (later), 13 to 17 player accounts, push notifications, Cougars history migration (separate script when Coach says), league-wide schedule import from Field Command games (later: `cp_games` can be seeded from `flm_games` for BLS teams in one script).

## 11. Open questions for Coach (answer any time; defaults in parentheses)

1. May assistants edit the draft? (yes)
2. Parent notes in this build? (yes)
3. Should BLS games be pre-seeded into `cp_games` from Field Command's imported schedule so pilot coaches do not retype them? (yes, one script, BLS only, no notifications)
