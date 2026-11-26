# Rig Card Crew, pieces 2 to 4: join links, crew trips, notes, lists, catches

> **For agentic workers:** this is the binding contract between the backend and the page. Build to it exactly. If it is wrong, fix the smallest thing and say so in your report under "Rulings".

**Goal:** Coach texts Russell a personal link. One tap and Russell is in the crew, sees the same week, can build or float a trip, say he is going, pin a note to a part of the run card, and tick off what he is bringing.

**Spec:** `docs/superpowers/specs/2026-11-25-rig-card-crew-design.md` (approved by Coach). Piece 1 plan: `docs/superpowers/plans/2026-11-25-rig-card-crew-piece-1.md` (shipped).

## What changed since the spec (rulings, 2026-11-26)

1. **Texted codes cannot send today.** Supabase auth answers `sms_send_failed ... auth token is not valid` (Twilio token was rotated in September and never updated in the Supabase dashboard; only Coach can fix that). So the way in is a **join link**: the owner adds a person, gets a personal link, and texts it from his own Messages. Proven live 2026-11-26: the service role mints a magic-link `token_hash` with `auth.admin.generateLink` and `POST /auth/v1/verify {type:"magiclink", token_hash}` returns a session, with nothing sent to anyone. The phone-code screen stays in the code but only shows when the server says texting works (`sms: true`).
2. **Catches get their own table** (`castai_crew_catches`), not a new column on `catch_logs`. `~/Workspace/ops/BACKEND-CONTRACT.md` freezes CastAI's unprefixed tables and the shipped iOS app reads `catch_logs`. They get unified when Rig Card moves into CastAI.
3. **No notification settings yet.** Nothing sends, so a settings screen would be a switch wired to nothing. "New" dots in the app instead (per phone). Texts and push come with a real sender.
4. **A home-screen copy of the app does not share sign-in with Safari on iPhone.** So the sign-in screen takes a pasted link as well as a tapped one.

## Global constraints

- Signed out, the app is exactly what it is today. Nothing outside `#/crew` and `#/join` asks anyone to sign in.
- No em dashes in any copy or comment. Plain words, short. No emoji in UI.
- A member's phone number or email never leaves the function. Names only.
- All crew tables: RLS on, zero policies, `anon` and `authenticated` revoked. The edge function with the service role is the only way in. Migrations additive and idempotent. Never alter a table that does not start with `castai_crew`.
- Live tests touch only the crew named `ZZTEST crew` (owner `zztest-owner@coachpilot.org`, member `zztest-member@coachpilot.org`, passwords in `~/.cortex/rigcard-test.json`, sign in with `POST /auth/v1/token?grant_type=password`). Never read, write or list Coach's real crew (`Coach's crew`) in a test. Tests delete what they create.
- No new npm dependencies in `rigs/`. The page loads plain scripts. `rigs/crew.js` talks to `https://geigvuysptjvvqanumld.supabase.co` with the publishable key `sb_publishable_m6EWBWxKPeOaVpPQOVDjyg_sTRWlnbe`.
- Offline: anything already seen opens with no signal. A note, a tick or a going answer made with no signal queues and sends later, once, never twice.
- The page follows the sky (`rigs/sky.js`): use the CSS variables `--bg --paper --panel --panel2 --line --ink --ink2 --dim --accent --gold --on-gold --go --warn --no`. Never hard-code a light or dark colour in new UI. Gold (`--gold` with `--on-gold` text) is for the one main action on a screen.
- Tests before every commit: `npm test` must pass, then `touch ~/.tests-passed`. Commit only your own paths with explicit `git add <paths>`. Never `git add -A`. Do not push. Automated browsers run headless only.

## Tables (`supabase/migrations/20261126_0900_castai_crew_trips.sql`)

```
castai_crew_settings   key text pk, value text not null, updated_at timestamptz default now()      seed ('sms','off')
castai_crew_invites    token_hash text pk (sha256 hex of the token; the token is never stored),
                       crew_id uuid not null -> castai_crew cascade, user_id uuid not null -> auth.users cascade,
                       created_by uuid null -> auth.users set null, created_at timestamptz default now(),
                       expires_at timestamptz not null, last_used_at timestamptz null, revoked boolean not null default false
castai_crew_trips      id uuid pk default gen_random_uuid(), crew_id uuid not null -> castai_crew cascade,
                       created_by uuid null -> auth.users set null,
                       plan_id text not null, spot_id text not null, species text not null, title text not null,
                       trip_date date not null, from_hour numeric null, to_hour numeric null (each 0..24),
                       status text not null default 'idea' check in ('idea','planned','done'),
                       note text null (max 280), created_at, updated_at timestamptz default now()
castai_crew_trip_going trip_id -> trips cascade, user_id -> auth.users cascade, answer text check in ('going','maybe','out'),
                       updated_at timestamptz default now(), primary key (trip_id, user_id)
castai_crew_comments   id uuid pk, trip_id -> trips cascade, user_id uuid null -> auth.users set null,
                       section text null check in ('plan','what','gear','bait','how','wx','river','spot','expect','rules'),
                       body text not null (1..1000), hidden boolean not null default false, client_id uuid null,
                       created_at timestamptz default now(); unique (trip_id, client_id) where client_id is not null
castai_crew_list_items id uuid pk, trip_id -> trips cascade, label text not null (1..120),
                       assigned_to uuid null -> auth.users set null, done boolean not null default false,
                       created_by uuid null -> auth.users set null, client_id uuid null, sort integer not null default 0,
                       created_at timestamptz default now(); unique (trip_id, client_id) where client_id is not null
castai_crew_catches    id uuid pk, trip_id -> trips cascade, user_id uuid null -> auth.users set null,
                       species text not null (1..40), length_in numeric null, weight_lb numeric null,
                       lure text null (max 80), notes text null (max 500), client_id uuid null,
                       created_at timestamptz default now(); unique (trip_id, client_id) where client_id is not null
```

## The function: `POST https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-crew`

Body is JSON with `action`. Errors are `{ "error": "<plain words>" }` with a real status (400 bad input, 401 no good token, 403 not allowed, 404 not found or not your crew, 410 dead link). Never a 500 for bad input.

**No token needed**

| action | body | answer |
|---|---|---|
| `hello` | | `{ ok: true, sms: boolean }` |
| `join` | `{ token, peek?: true }` | peek: `{ ok, name, crew }` and nothing is minted. Otherwise `{ ok, name, crew, token_hash }`; the page then calls `/auth/v1/verify` with `{ type: "magiclink", token_hash }`. A revoked, expired or unknown token: 410 `{ error: "That link is not good any more. Ask for a new one." }` |

**Bearer token needed** (the caller's Supabase access token). Every trip, comment, item and catch is checked to belong to the caller's own crew; otherwise 404.

| action | body | answer |
|---|---|---|
| `state` | | `{ me: {id, name}, crew: {id, name, role} \| null, members: [{id, name, role}], trips: [Trip], sms: boolean }` |
| `invite` | `{ name, phone? }` owner only | `{ ok, created: boolean, name, userId, link }`. With a phone: an existing account with that phone is attached, never doubled; already on the crew returns `created: false` and a fresh link. Without a phone: a new account. Every invited account gets a placeholder email if it has none (needed to mint the sign-in), never shown anywhere. |
| `link` | `{ userId }` owner, or yourself | `{ ok, name, link }`. Older links for that person are revoked. |
| `member_remove` | `{ userId }` owner only, never the owner himself | `{ ok }`. Their links are revoked. |
| `trip_create` | `{ planId, spotId, species, title, date, from?, to?, status?, note?, clientId? }` | `{ ok, trip: Trip }`. The creator is marked going. `status` is `idea` or `planned` (default `idea`). |
| `trip_update` | `{ tripId, status?, date?, from?, to?, note?, title? }` | `{ ok, trip: Trip }`. Rules below. |
| `trip_delete` | `{ tripId }` creator or owner | `{ ok }` |
| `trip` | `{ tripId }` | `{ trip: Trip, comments: [Comment], list: [Item], catches: [Catch] }` |
| `going` | `{ tripId, answer }` (`going`, `maybe`, `out`) | `{ ok, going: [{id, name, answer}] }` |
| `comment_add` | `{ tripId, section?, body, clientId? }` | `{ ok, comment: Comment }` |
| `comment_delete` | `{ commentId }` yours, or the owner | `{ ok }` (soft: `hidden`) |
| `list_add` | `{ tripId, label, assignedTo?, clientId? }` | `{ ok, item: Item }` |
| `list_update` | `{ itemId, done?, assignedTo? (uuid or null), label? }` | `{ ok, item: Item }`. Anyone on the crew ticks and assigns. Only the adder or the owner renames. |
| `list_delete` | `{ itemId }` the adder or the owner | `{ ok }` |
| `catch_add` | `{ tripId, species, lengthIn?, weightLb?, lure?, notes?, clientId? }` | `{ ok, catch: Catch }` |
| `catch_delete` | `{ catchId }` yours only | `{ ok }` |

A repeated `*_add` with the same `clientId` returns the row already made (this is what makes the offline queue safe).

```
Trip    { id, planId, spotId, species, title, date: "YYYY-MM-DD", from: number|null, to: number|null,
          status, note, by: {id, name}|null, going: [{id, name, answer}],
          counts: { comments, list, listDone, catches }, updatedAt: ISO }
Comment { id, section: string|null, body, by: {id, name}|null, at: ISO, mine: boolean }
Item    { id, label, assignedTo: {id, name}|null, done: boolean, mine: boolean }
Catch   { id, species, lengthIn: number|null, weightLb: number|null, lure, notes, by: {id, name}|null, at: ISO, mine: boolean }
```

`state.trips` holds trips dated from 30 days ago onward, oldest first. `updatedAt` is the newest of the trip's own change, its going answers, notes, list and catches.

**Rules (pure functions in `crew-core.mjs`, unit tested)**

- `canEditTrip(member, trip)`: the owner, or the person who made the trip.
- `statusChangeAllowed(member, trip, to, todayIso)`: `idea -> planned` anyone on the crew. `planned -> idea` and `done -> planned` only `canEditTrip`. `-> done`: `canEditTrip` any time, anyone once the trip date is today or past.
- `tripInput(body, todayIso)`: returns the cleaned fields or throws an `Error` whose message is plain words. Date is a real `YYYY-MM-DD`, no more than 366 days ahead, no more than 30 days back. Hours 0 to 24, `to` after `from`. `title` 1 to 120, `note` up to 280, `planId` and `spotId` 1 to 80 of `[a-z0-9-]`.
- `cleanText(value, max)`: trims; throws when empty or longer than `max`.
- `SECTIONS`: the ten run card section ids above.
- "Today" on the server is the date in `America/Los_Angeles`.
- Join links: 32 random bytes, base64url. Stored as sha256 hex. Good for 30 days, reusable until revoked (a phone that loses its sign-in can use the same text again). The link is `https://coachpilot.org/rigs/#/join/<token>`.

## The page

`rigs/crew.js` grows to: `hello()`, `join(tokenOrLink, {peek})`, `state()`, `trip(id)`, `createTrip(fields)`, `updateTrip(id, fields)`, `deleteTrip(id)`, `going(id, answer)`, `addComment(tripId, section, body)`, `deleteComment(id)`, `addItem(tripId, label, assignedTo)`, `updateItem(id, fields)`, `deleteItem(id)`, `addCatch(tripId, fields)`, `deleteCatch(id)`, `invite(name, phone)`, `link(userId)`, `removeMember(userId)`, `pending()`, `flush()`, `markSeen(tripId)`, `isNew(trip)`. Every call resolves, never rejects: `{...answer}` or `{ error }` or `{ signedOut: true }` or `{ offline: true }`. Last `state` and each opened `trip` are cached in `localStorage` for no-signal reads. Queued writes live in `rig.crewq.v1`, each with a `clientId`, shown in the UI as "waiting to send", flushed on the next good call, on `online`, and when the app comes back to the front.

`rigs/trips.js` gains `RIG.trips.detail({ planId, iso, from, to, wx, tides, flow })` -> `{ status: "ok", trip }` (the same trip object the week uses, whatever its score) or `{ status: "nogo", why }` or `{ status: "dark", sunset }` or `{ status: "closed" }` (out of season or closed that date) or `{ status: "nodata" }` (forecast does not reach that day) or `{ status: "unknown" }` (no such plan).

Routes in `rigs/index.html`:

- `#/join/<token>`: peeks, then says who invited you and to which crew, with one gold **Join** button. Nothing is minted until the tap (message previews load pages). After joining: the Trips tab, signed in.
- `#/crew` signed out: when `hello().sms` is false there is no phone form at all. It says to ask Coach for your link, and takes a pasted link (full link or bare token) with a **Join** button.
- `#/crew` signed in: members. The owner gets **Add someone** (name, phone optional). After adding: **Text <name> the link** (opens Messages with the words and the link already written; `sms:&body=` on iPhone, `sms:?body=` elsewhere) and **Copy the link**. Per member, for the owner: **New link**, **Remove**. Everyone: **Sign out**.
- Trips tab, signed in and on a crew: a **Crew trips** group above the week. One row per trip: day and date, title, an `Idea` or `On` tag, who is going by first name, a small dot when `isNew`. A **Plan a trip** row opens `#/crew/new`.
- A Hot Trip run card, signed in and on a crew: **We are doing this** (makes it `planned`) and **Float it** (makes it an `idea`), prefilled from that trip.
- `#/crew/new`: pick the trip (the app's plans whose rules are confirmed, grouped by fish), the date, an optional window, idea or planned, an optional note.
- `#/crew/trip/<id>`: title, date, status, who made it. A conditions line from `RIG.trips.detail` (go with its reasons, or the no-go and why, or dark, or out of season, or "the forecast reaches 7 days out"). **Going / Maybe / Out** with names under each. The run card sections with a note count on each row; opening one (`#/crew/trip/<id>/<section>`) shows the section and its notes with a box to add one. Notes on the whole trip. **The list**: tick, who has it (tap to pick a member or nobody), add a line. **Catches** once the day has come. **Text the crew** (Messages, with what, when to leave and the link). Status buttons the rules allow, and Delete for the maker or the owner.

## Tests

- `tests/castai-crew.test.mjs`: every rule function above, no network.
- `tests/castai-crew-schema.test.mjs`: every table in the migration is RLS on, no policies, revoked.
- `tests/castai-crew.live.test.mjs`: signs in as the two ZZTEST accounts and walks every action against the deployed function, including a member being refused owner actions, a trip from another crew answering 404, a repeated `clientId` not doubling, a join link minting a real session, a revoked link answering 410. Skips cleanly when `~/.cortex/rigcard-test.json` is missing. Leaves no trips behind.
- `tests/rigs-crew.smoke.mjs` and `tests/rigs-crew-trips.smoke.mjs`: the page with every network call stubbed, at 390 px wide: join by tap and by paste, signed-out screens unchanged, crew trips above the week, a trip made from a Hot Trip and from scratch, going, a note pinned to a section, the list, a catch, a queued note with no signal that sends once when the signal returns, and no phone number or email anywhere on screen.
- `tests/rigs-trips.test.mjs`: `detail()` for ok, nogo, dark, closed, nodata, unknown.
