# The shop home screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app opens in Coach's painted shop, where six labelled things open the app's places and three lines (Today, Learn, Get ready) answer the day.

**Architecture:** A new painter `rigs/shop.js` draws the shop as an SVG in the same hand as `rigs/scene.js`, under the sky engine's variables, with six tappable groups. Pure functions in the same file pick the three lines from data the app already has (`RIG.trips.read`, `RIG.trips.myWin`, the run cards' gear states, the library's "Learn these first"). `rigs/index.html` routes `#/` to the shop; Hot Trips moves to `#/trips`, which already exists.

**Tech Stack:** Static PWA, plain ES5-style JS (no lookbehind regex: older iPhones fail to parse the whole script), SVG, node test scripts and Playwright smoke tests (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-27-the-shop-home-design.md`

## Global Constraints

- The design identity, `~/memory/design-identity/IDENTITY.md`, and its gate: screenshot at 390 by 844 by day and night, side by side with `reference/rigcard-on-the-water/real-app/`, before calling a task done.
- The shop shows only gear the app knows he owns. Nothing is drawn as his that no data confirms. No brand or model names on the drawn gear.
- No jerseys. One crew.
- The address stays `coachpilot.org/rigs`; the gold hook icon stays.
- The app's name lives in one place (`rigs/brand.js`); the placeholder stays "Rig Card" until Coach picks.
- Every new file is in `rigs/sw.js`'s SHELL list and `CACHE` is bumped once per merge.
- No em dashes in text a person reads. Few words. Every colour from the sky variables.
- Tests use fixtures and stubs; the live crew walk uses the ZZTEST crew only.

## Review Focus

1. First open with no forecast yet, or offline: the shop and all six labels draw at once; Today says it is checking, then fills, or shows the last saved read. (Task 3 test `today line while the forecast loads and offline`.)
2. Signed out, or no gear list for the next season: Get ready says something true ("Next up: squid, Dec 11") instead of a blank or a count of zero things. (Task 2 test `get ready with nothing to get`.)
3. 360 px wide, and a 1280 px desktop: every tap spot is at least 44 by 44 px, no label covers another, the three lines stay on the first screen at 390 by 664. (Task 3 smoke `tap spots and labels at 360, 390x664 and 1280`.)
4. Night and the seven other skies: labels and lines pass 4.5 to 1. (Task 3 smoke `contrast under all eight skies`.)
5. Deep links keep working: `#/trips/...`, `#/join/...`, `#/crew/...`, `#/fish/...` open their screens directly, never the shop; after Join the welcome note shows on the shop. (Task 4 smoke `deep links skip the shop`.)

---

### Task 1: The name in one place

**Files:**
- Create: `rigs/brand.js`
- Modify: `rigs/index.html` (head: load `brand.js` first; `<title>`; any text that says "Rig Card"), `rigs/manifest.webmanifest`, `rigs/sw.js`
- Test: `tests/rigs-brand.test.mjs` (add to `npm test` and `test:rigs`)

**Interfaces:**
- Produces: `RIG.brand = { name: "Rig Card", short: "Rig Card" }`.

- [ ] **Step 1: Write the failing test.** `tests/rigs-brand.test.mjs` loads `rigs/brand.js` in node and asserts: the manifest's `name` and `short_name` equal `RIG.brand.name` and `RIG.brand.short`; `rigs/index.html`'s `<title>` equals `RIG.brand.name`; no other literal "Rig Card" appears in text a person reads in `rigs/index.html`, `rigs/content.js`, `rigs/guides.js` (comments and test files excluded).
- [ ] **Step 2: Run it.** `node tests/rigs-brand.test.mjs`. Expected: FAIL (no brand.js).
- [ ] **Step 3: Implement.** `rigs/brand.js`; page text reads `RIG.brand.name`; a check script `scripts/brand-check.mjs` that rewrites the manifest's two names from brand.js, so a rename is one edit plus one command.
- [ ] **Step 4: Run it.** Expected: PASS. Then `npm test`: all green.
- [ ] **Step 5: Commit.** `git commit -m "Rig Card: the app's name lives in one place (rigs/brand.js)"`

### Task 2: The shop's three lines (pure logic)

**Files:**
- Create: `rigs/shop.js` (logic half)
- Test: `tests/rigs-shop.test.mjs` (add to `npm test` and `test:rigs`)

**Interfaces:**
- Consumes: `RIG.trips.plan`, `RIG.trips.read`, `RIG.trips.myWin`, `RIG.runs` (each run's `gear` items with `s` of `"need"`, `"check"` or owned), `RIG.library.first` or the ids the Learn tab's "Learn these first" uses (read `renderLearn` in `rigs/index.html` and reuse that list), `RIG.guides.year(todayIso)`.
- Produces: `RIG.shop.lines({ today: "YYYY-MM-DD", nowHour: number, wx, tides, flow, win, seen: string[] }) -> { today: { head: string, line: string, href: string } | null, learn: { head, line, href }, ready: { head, line, href } | null }`

- [ ] **Step 1: Write the failing tests** with the fixtures from `tests/rigs-read.test.mjs` (Nov 27, 2026, real NOAA tides):
  - `today line from the read`: with `win = { winFrom: 20, winTo: 0 }` the Today line equals the read's own headline for the week's best trip ("Squid, Redondo" style head; line starts "8 to 12: fair"), `href` is that trip's run card.
  - `today line while the forecast loads and offline`: `wx` null gives `{ head: "Today", line: "Checking the water", href: "#/trips" }`; a saved read passed as `saved` is used instead when present.
  - `learn of the day`: the first unseen id of the "Learn these first" list (arbor, double uni, Palomar, dropper loop, the pier swing), then the next one the next day; `seen` skips ids already opened; never empty.
  - `get ready from the next season`: on 2026-11-27 the next squid nights' run card has gear with `s: "need"`; line reads "Squid, Dec 11: 3 things" (count = need + check), `href` the run card's gear section.
  - `get ready with nothing to get`: when the next season's run has no need or check items, line reads "Next up: squid, Dec 11. You have the gear." ; when no season is within 30 days, `ready` is null and nothing is drawn.
- [ ] **Step 2: Run.** `node tests/rigs-shop.test.mjs`. Expected: FAIL (no RIG.shop).
- [ ] **Step 3: Implement `RIG.shop.lines`** in `rigs/shop.js`. Today uses the same pick the call card uses (`plan(...).call` or its equivalent in `callHtml`), read through `RIG.trips.read` with the saved window. Get ready looks 30 days ahead with `RIG.guides.year` and the planner's seasons.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -m "Rig Card: the shop's three lines (today, learn, get ready)"`

### Task 3: The painted shop and its six tap spots

**Files:**
- Modify: `rigs/shop.js` (painter half), `rigs/scene.css` (shop classes)
- Modify: `rigs/index.html` (`renderShop()`; route `#/` to it; the dock gains a home button before the tabs, an inline SVG of a garage door, `aria-label` "Home", `data-home`)
- Test: `tests/rigs-shop.smoke.mjs` (add to `npm test` and `test:rigs`, its own fixed port, for example 8873)

**Interfaces:**
- Consumes: `RIG.shop.lines` (Task 2), `RIG.sky` palettes, `setScene`, `topHtml`.
- Produces: `RIG.shop.paint(el: Element, opts: { owned: { kayaks: number }, night: boolean, glow: string | null }) -> void` drawing one SVG with six groups `g[data-spot="kayaks"|"rods"|"board"|"pegboard"|"chest"|"calendar"]`, each wrapped in an `<a>` to `#/trips`, `#/learn`, `#/crew`, `#/gear`, `#/catches`, `#/learn/guides/year`, each with a visible label (`data-spot-label`); `RIG.shop.spots` lists the six with label and href.

- [ ] **Step 1: Write the failing smoke tests:**
  - `the shop is the first screen`: opening `#/` shows `[data-view="shop"]` with the SVG and six `[data-spot]` links, each with its label text (Trips, Learn, Crew, Gear, Catches, Seasons) and each href above.
  - `the three lines`: `[data-shop-lines]` holds Today, Learn and Get ready rows (Get ready absent when `lines().ready` is null) with the texts from Task 2's fixtures.
  - `tap spots and labels at 360, 390x664 and 1280`: each spot's link box is at least 44 by 44, no two label boxes overlap, and at 390 by 664 the three lines are inside the viewport.
  - `contrast under all eight skies`: every label and line passes 4.5 to 1 (3 to 1 at 24 px and up), with the existing contrast helper.
  - `lit at night`: under the night palette the shop's light group is present and the scene's brightest warm pixels inside the wall area pass the same "lit" threshold the pier night test uses.
  - `home button`: on `#/trips` the dock's `[data-home]` goes to `#/`.
- [ ] **Step 2: Run.** `node tests/rigs-shop.smoke.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement** the painter (the wall, the open door with the sky through it, two kayaks on wall racks, a rod rack, a corkboard with the crew's next trip as a pinned card when there is one, a pegboard of lures, a chest, a wall calendar showing this month; shop lights at night), `renderShop()`, the route, and the home button. Hot Trips stays at `#/trips` unchanged.
- [ ] **Step 4: Update every existing smoke test that opens the base URL expecting Hot Trips to open `#/trips` explicitly** (search the tests for `goto(base` and `"#/"`), keeping every assertion.
- [ ] **Step 5: Run** `npm test`. Expected: all green. Then the identity gate: screenshots of `#/` at 390 by 844 under overcast, golden and night, looked at next to the reference pictures.
- [ ] **Step 6: Commit.** `git commit -m "Rig Card: the app opens in the shop (six tap spots, three lines)"`

### Task 4: Gear and Catches screens, deep links, the welcome

**Files:**
- Modify: `rigs/index.html` (`renderGear()` at `#/gear`, `renderCatches()` at `#/catches`; the welcome note after Join shows on the shop)
- Test: extend `tests/rigs-shop.smoke.mjs`; update `tests/rigs-crew.smoke.mjs` for the welcome's new place

**Interfaces:**
- Consumes: the run cards' gear states; `RIG.crew.cached()` and `RIG.crew.cachedTrip(id)` for catches.
- Produces: `#/gear`: the next season's gear first (need, check, owned), then each upcoming trip's list, each row linking to its run card's gear section. `#/catches`: catches from the crew trips this phone holds, newest first, each linking to its crew trip; signed out or none, one line on how catches get logged.

- [ ] **Step 1: Write the failing smoke tests:** `gear screen` (the next season first, counts match `gearSum`), `catches screen` (newest first from stubbed crew trips; empty state line), `deep links skip the shop` (each of `#/trips/<key>`, `#/join/<token>`, `#/crew`, `#/fish/coho` renders its own view, not `[data-view="shop"]`), `welcome on the shop` (after Join, the "You are in" note shows on `#/`).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the two screens in the look (scene on top, first card across the waterline) and move the welcome.
- [ ] **Step 4: Run** `npm test` and `npm run test:crew-live-page`. Expected: green.
- [ ] **Step 5: Commit.** `git commit -m "Rig Card: gear and catches from the shop; deep links skip it"`

### Task 5 (pass 2): The live shop

**Files:**
- Modify: `rigs/shop.js`, `rigs/index.html`
- Test: extend `tests/rigs-shop.test.mjs` and `tests/rigs-shop.smoke.mjs`

**Interfaces:**
- Consumes: Task 2's `lines().ready`, the crew's newest catch, the run cards' owned gear.
- Produces: `RIG.shop.paint` honours `opts.glow` (the spot named by Get ready gets a soft gold glow and a "Get ready" tag), `opts.lastCatch` (the chest shows the newest catch's fish as a small drawing from `rigs/fish.js`), `opts.ownedLures` (the pegboard draws one lure per owned lure item, up to 12).

- [ ] **Step 1: Write the failing tests:** `glow follows get ready` (with Task 2's squid fixture the rods spot carries the glow and tag; with `ready` null nothing glows), `chest shows the last catch` (stubbed newest catch coho draws the coho), `pegboard draws owned lures only` (count equals owned lure items, max 12, zero when none).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: green. Identity gate screenshots by day and night.
- [ ] **Step 5: Commit.** `git commit -m "Rig Card: the live shop (get ready glow, the last catch, owned lures)"`
