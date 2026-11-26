# Rig Card Crew, piece 1: sign in and the crew

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Coach invites Russell by name and phone; Russell taps a link, enters a code texted to him, and is in Coach's crew looking at the same week.

**Architecture:** Crew tables in the existing CoachPilot Supabase, reached only through one edge function (`castai-crew`) with the service role, exactly like `bls-board`. The Rig Card page talks to Supabase auth's REST endpoints directly (no npm, no bundler) so the page stays a static file that works offline.

**Tech Stack:** Static HTML/JS (`rigs/`), Supabase Postgres + edge functions (Deno), Supabase phone auth over Twilio, node test scripts + Playwright smokes.

**Spec:** `docs/superpowers/specs/2026-11-25-rig-card-crew-design.md`

## Global Constraints

- Signed out, the app is exactly what it is today. Signing in never gates what already works.
- No em dashes anywhere in copy. Period, comma or colon.
- Sign-ups stay disabled on the project. Members exist only because the owner invited them. Verified 2026-11-25: an unknown phone gets `{"code":422,"error_code":"otp_disabled"}` and no text is sent.
- No new npm dependencies in `rigs/`. The page loads plain scripts.
- Every write goes through the edge function with the service role. The browser never holds the service key.
- A member's phone number is never shown to another member. A name is enough.
- Tests before every commit: `npm test`, then `touch ~/.tests-passed`.

## Review Focus

1. **A phone typed any human way** ("253 555 0147", "(253) 555-0147", "2535550147") must reach the same account as `+12535550147`, or the code never arrives. Task 2.
2. **Send code tapped twice** must say when the next code can be sent, not fail silently. Supabase rate limits per phone. Task 3.
3. **The code screen with no signal** must say so and keep the typed number, not hang. Task 3.
4. **An invited phone that already has a CastAI account** attaches to that account; it must never create a second one or error. Task 2.
5. **A session that has expired** must land the member back at signed out with the app still fully usable, never a half-signed-in screen. Task 3.

---

### Task 1: Crew tables

**Files:**
- Create: `supabase/migrations/20261125_0900_castai_crew.sql`
- Test: `tests/castai-crew-schema.test.mjs`

**Interfaces:**
- Produces: tables `castai_crew` (`id uuid pk`, `name text`, `owner uuid references auth.users`, `created_at timestamptz`) and `castai_crew_members` (`crew_id uuid references castai_crew on delete cascade`, `user_id uuid references auth.users on delete cascade`, `role text check in ('owner','member')`, `display_name text`, `invited_by uuid`, `joined_at timestamptz`, primary key `(crew_id, user_id)`).

- [ ] **Step 1: Write the failing test** `tests/castai-crew-schema.test.mjs` reads the migration file and asserts: both `create table if not exists` statements present; `enable row level security` on both; `revoke all on public.castai_crew from anon` and the same for `castai_crew_members` and for `authenticated`; no `create policy` in the file (service role only); a unique index so one crew cannot hold the same person twice.
- [ ] **Step 2: Run it** `node tests/castai-crew-schema.test.mjs`. Expected: FAIL, file not found.
- [ ] **Step 3: Write the migration.** Additive and idempotent, in the style of `supabase/migrations/20261123210000_castai_wdfw_rules.sql`.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Apply it** with the Supabase MCP `apply_migration`, name `castai_crew`.
- [ ] **Step 6: Commit** the migration and test.

### Task 2: The crew edge function

**Files:**
- Create: `supabase/functions/castai-crew/index.ts`, `supabase/functions/castai-crew/crew-core.mjs`
- Test: `tests/castai-crew.test.mjs`

**Interfaces:**
- Consumes: Task 1's tables.
- Produces: `crew-core.mjs` exporting `normalizePhone(raw) -> "+1XXXXXXXXXX"` (throws `Error("that does not look like a US phone number")` on anything that is not 10 digits, or 11 starting with 1) and `canInvite(member) -> boolean` (true only for `role === "owner"`), and `inviteOutcome({user, member}) -> "already" | "attach" | "create"` ("already" when they are in the crew, "attach" when the phone has an account but no membership, "create" when neither exists).
- Produces: `POST /castai-crew` with `{action}` and the caller's `Authorization: Bearer <access_token>`:
  - `state` -> `{ me: {id, name} | null, crew: {id, name, role} | null, members: [{id, name, role}] }`. No phone numbers in the reply.
  - `invite` with `{name, phone}` -> `{ ok: true, created: boolean }`. Owner only. Normalizes the phone, looks for an existing `auth.users` row with it, creates one with the service role only when there is none, then adds the membership. Re-inviting someone already in the crew returns `{ ok: true, created: false }` and changes nothing.
  - Unknown action -> 400. Missing or bad token -> 401. Not the owner -> 403.

- [ ] **Step 1: Write the failing test** `tests/castai-crew.test.mjs` covering `crew-core.mjs` only, no network:

```js
ok(normalizePhone("253 555 0147") === "+12535550147", "spaces and no country code");
ok(normalizePhone("(253) 555-0147") === "+12535550147", "brackets and a dash");
ok(normalizePhone("+1 253 555 0147") === "+12535550147", "already international");
ok(threw(() => normalizePhone("555-0147")), "too short is refused");
ok(threw(() => normalizePhone("+44 7700 900123")), "not a US number is refused");
ok(canInvite({ role: "owner" }) && !canInvite({ role: "member" }), "only the owner invites");
// An invited phone that already has a CastAI account is attached, never duplicated.
ok(inviteOutcome({ user: { id: "u1" }, member: { user_id: "u1" } }) === "already", "already on the crew");
ok(inviteOutcome({ user: { id: "u1" }, member: null }) === "attach", "existing account is attached");
ok(inviteOutcome({ user: null, member: null }) === "create", "a new number gets an account");
```

- [ ] **Step 2: Run it.** Expected: FAIL, module not found.
- [ ] **Step 3: Write `crew-core.mjs`** with those three functions and no imports, so both the Deno function and node tests load it.
- [ ] **Step 4: Run it.** Expected: PASS.
- [ ] **Step 5: Write `index.ts`** following `supabase/functions/castai-rules/index.ts` for CORS and the service-role client. It resolves the caller with `supabase.auth.getUser(token)`, then reads or writes through the service role.
- [ ] **Step 6: Deploy** with the Supabase MCP `deploy_edge_function`, name `castai-crew`, `verify_jwt: false` (the function checks the token itself so it can answer 401 in its own words).
- [ ] **Step 7: Add live checks to the same test file:** POST with no token returns 401; POST with `{action:"nonsense"}` and no token returns 401; a malformed body returns 400 or 401, never 500.
- [ ] **Step 8: Run `npm test`, then commit.**

### Task 3: Signing in on the page

**Files:**
- Create: `rigs/crew.js`
- Modify: `rigs/index.html` (script tag, a Crew view, the click handler), `rigs/sw.js` (precache `rigs/crew.js`, bump `CACHE`)
- Test: `tests/rigs-crew.smoke.mjs`

**Interfaces:**
- Consumes: Task 2's function.
- Produces: `RIG.crew` with `sendCode(phone) -> Promise<{ok}|{error, retryAfter}>`, `verify(phone, code) -> Promise<{ok}|{error}>`, `session() -> {token, userId, name} | null`, `signOut()`, `state() -> Promise<crewState>` and `invite(name, phone) -> Promise`.
- The session lives in `localStorage` under `rig.session.v1` and is refreshed with the refresh token when `expires_at` has passed.

- [ ] **Step 1: Write the failing smoke** `tests/rigs-crew.smoke.mjs`, with `/auth/v1/otp`, `/auth/v1/verify` and `castai-crew` all stubbed by `page.route`:
  - signed out, the Trips tab still lists the week and nothing asks for a sign-in;
  - the Crew view takes a phone number, sends a code, then takes the code and shows the crew name and the other members' names;
  - a second tap on Send code inside the cooldown shows "A code was just sent. Try again in N seconds." and sends nothing;
  - with the auth host unreachable, the screen says the code could not be sent and keeps the typed number;
  - an expired session (stubbed 401 on `state`) drops back to signed out and the week still renders;
  - no phone number appears anywhere in the signed-in UI.
- [ ] **Step 2: Run it.** Expected: FAIL, no Crew view.
- [ ] **Step 3: Write `rigs/crew.js`** against Supabase's auth REST endpoints (`POST /auth/v1/otp` with `create_user:false`, `POST /auth/v1/verify` with `type:"sms"`), the publishable key in the `apikey` header. Map `otp_disabled` to "That number is not on the crew yet. Ask Coach to add you."
- [ ] **Step 4: Add the Crew view to `rigs/index.html`.** It sits behind the existing Learn tab's list as a row, so the tab bar does not grow.
- [ ] **Step 5: Run it.** Expected: PASS.
- [ ] **Step 6: Run `npm test`, then commit.**

### Task 4: Inviting, and what a member sees

**Files:**
- Modify: `rigs/crew.js`, `rigs/index.html`
- Test: `tests/rigs-crew.smoke.mjs` (extend)

**Interfaces:**
- Consumes: Task 3's `RIG.crew`.

- [ ] **Step 1: Write the failing tests** in the same smoke: as owner, the Crew view shows an Add someone form (name and phone) and the member list; adding someone calls `invite` and the new name appears; as a member, there is no Add someone form; the member list never shows a phone number; Sign out returns the app to exactly the signed-out screens.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Build the Crew view's two states** (owner and member) and wire `invite`.
- [ ] **Step 4: Run them.** Expected: PASS.
- [ ] **Step 5: End to end with Coach once**, on his own number, since he is the owner and needs the first account: he taps Send code, reads the text, types it, and lands signed in. This is the only step that spends money (about a penny) and the only one that proves Twilio is wired to this project.
- [ ] **Step 6: Run `npm test`, then commit and push.**
