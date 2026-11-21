# Fishing Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an offline-capable fishing library at coachpilot.org/rigs with a Library mode for study and trip planning and a Field mode that shows only the current trip's cards, with the squid branch complete including a rod course.

**Architecture:** Static page on the existing Vercel site. Three files split by responsibility: `index.html` (shell, CSS, app JS), `content.js` (all text as data), `diagrams.js` (SVG markup keyed by id). A cache-first service worker precaches every asset so the page opens with no cell signal. Content lives in three layers (Fundamentals, Species, Location) and each fact is written in exactly one of them.

**Tech Stack:** Vanilla JS (IIFE, no framework, no build step), self-hosted woff2 fonts, service worker + webmanifest, Node test scripts in the repo's existing `tests/*.test.mjs` style, Playwright for smoke.

**Spec:** `/Users/danielgrande/Workspace/ops/FISHING-LIBRARY-DESIGN.md`

## Global Constraints

- Deploy is `git push` to `GrandeSmartSports/coachpilot-landing` main. Vercel auto-builds. Never `npx surge`.
- No framework, no build step, no runtime dependencies.
- MUST work with zero cell signal. No request to any third-party origin at load time, fonts included.
- Reuse the existing Rig Card CSS custom properties verbatim: `--bg:#0a0d10 --panel:#141a20 --panel2:#1a222a --line:#26313a --ink:#f4f7f9 --dim:#8899a5 --accent:#ff6a2b --go:#8fe85f --warn:#ffc53d --no:#ff5a4e --rope:#f0f4f7`.
- Gotcha: `.box b { display:block; text-transform:uppercase }`. Inline emphasis inside a box body uses `<strong>`, never `<b>`.
- Copy rules: plain English, no jargon left undefined, no em dashes anywhere in user-visible text, no emoji in product UI.
- Phone first, dark, one-handed.
- Rod spec, fixed: 9 ft, light power, fast action, 10 to 15 lb braid.
- Tests before every commit. After tests pass, `touch ~/.tests-passed`.
- Surgical edits only. Never regenerate a whole file to change one section.

## Review Focus

1. **Stale shell after a deploy.** SW serves the old cached page forever, or breaks mid-update, and Coach gets last month's content at the rail. Expected: new version installs in the background and takes over on next open, never a blank page. Test in Task 1.
2. **A saved trip pointing at a deleted card id.** Content edit removes a card the stored trip still references. Expected: the trip drops the missing card silently and still renders. Test in Task 4.
3. **Conditions data older than the night being fished.** Expected: Field mode shows a loud stale banner naming the date the data was good for, never bare numbers. Test in Task 5.
4. **localStorage unavailable or full.** iOS private browsing throws on write. Expected: the app still runs in Library mode and says the trip could not be saved, rather than throwing and rendering nothing. Test in Task 4.
5. **A font file missing from the precache list.** Expected: text still legible at field sizes via a system fallback stack, and the asset test fails loudly in CI so it never ships. Test in Task 1.

---

### Task 1: Offline shell

**Files:**
- Create: `rigs/index.html`, `rigs/sw.js`, `rigs/manifest.webmanifest`, `rigs/fonts/` (woff2 files), `rigs/icon-192.png`, `rigs/icon-512.png`
- Modify: `vercel.json` (add `/rigs` to `/rigs/` redirect, alongside the existing `/fields` entry)
- Test: `tests/rigs-offline.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `rigs/sw.js` exporting a `PRECACHE` array of asset paths; `window.RIG` namespace object created in `index.html` for later tasks to hang modules on.

Port the ENTIRE current Rig Card artifact (slug `9d05efdf-2262-4158-a15a-1d5dda162019`, version `1795036591-3642`, 1388 lines) into `rigs/index.html` verbatim first, then make the changes below. Its content, including all five river rig tabs, the knot step-animator and every SVG, must survive byte-for-byte except where a later task edits it.

- [ ] **Step 1: Write the failing test** `tests/rigs-offline.test.mjs` with three checks: `no external origins` (scan `rigs/*.html` and `rigs/*.js` for `//fonts.googleapis.com`, `//fonts.gstatic.com`, and any `https://` in a `src`/`href`/`@import`, expect zero hits), `precache covers every asset` (extract every local `src`, `href`, and `url()` from `rigs/index.html`, assert each appears in `sw.js`'s PRECACHE array), and `font files exist on disk` (each `rigs/fonts/*.woff2` referenced by CSS resolves).
- [ ] **Step 2: Run it to confirm it fails** — `node tests/rigs-offline.test.mjs`. Expected: FAIL, `rigs/index.html` does not exist.
- [ ] **Step 3: Create `rigs/index.html`** as the verbatim port described above. Replace the Google Fonts `<link>` with an `@font-face` block pointing at `rigs/fonts/`. Download Barlow Condensed (600, 700) and Inter (400, 600) woff2 into `rigs/fonts/`. Add a system fallback stack after each family name so missing fonts degrade rather than break.
- [ ] **Step 4: Create `rigs/sw.js`** with `const PRECACHE = [...]` listing every asset, an `install` handler that `caches.open(CACHE).addAll(PRECACHE)` then `skipWaiting()`, an `activate` handler that deletes caches whose name is not the current `CACHE` constant then `clients.claim()`, and a `fetch` handler that is cache-first for same-origin GET and falls back to network. Bump `CACHE` by version string. Follow the comment style of `fields/sw.js`.
- [ ] **Step 5: Register the SW** in `index.html` behind an `if ("serviceWorker" in navigator)` guard, scope `/rigs/`, matching the registration pattern at `fields/index.html:2781`.
- [ ] **Step 6: Create `rigs/manifest.webmanifest`** with name "Rig Card", `display: "standalone"`, `start_url: "/rigs/"`, `theme_color: "#0a0d10"`, and the two icons. Link it from `index.html`.
- [ ] **Step 7: Add the `/rigs` to `/rigs/` redirect** to the `redirects` array in `vercel.json`, directly after the `/fields` entry.
- [ ] **Step 8: Run the tests** — `node tests/rigs-offline.test.mjs`. Expected: PASS, all three checks.
- [ ] **Step 9: Add the stale-shell test** to the same file: assert `sw.js` contains a cache-deletion branch in `activate` AND that `CACHE` is a versioned string literal, so a content change forces a new cache. (Review Focus 1 and 5.)
- [ ] **Step 10: Run tests, then `touch ~/.tests-passed`, then commit**

```bash
node tests/rigs-offline.test.mjs && touch ~/.tests-passed
git add rigs tests/rigs-offline.test.mjs vercel.json
git commit -m "feat(rigs): offline shell at /rigs with self-hosted fonts and precaching SW"
```

---

### Task 2: Content data model

**Files:**
- Create: `rigs/content.js`, `rigs/diagrams.js`
- Test: `tests/rigs-content.test.mjs`

**Interfaces:**
- Consumes: `window.RIG` from Task 1.
- Produces: `RIG.content = { fundamentals: Card[], species: Species[] }` where `Card = { id: string, group: "before"|"water"|"after"|"fundamental", title: string, body: string (HTML), diagram?: string (diagrams.js key), dated?: "YYYY-MM-DD" }` and `Species = { id, name, locations: Location[], cards: Card[] }` and `Location = { id, name, cards: Card[] }`. `RIG.diagrams = { [key: string]: string }` holding SVG markup.

- [ ] **Step 1: Write the failing test** `tests/rigs-content.test.mjs`: `every card id is unique across all three layers`, `every card.diagram key exists in RIG.diagrams`, `every card.group is one of the four allowed values`, and `no card body appears verbatim in two cards` (the no-drift rule from the spec).
- [ ] **Step 2: Run it to confirm it fails** — `node tests/rigs-content.test.mjs`. Expected: FAIL, `rigs/content.js` not found.
- [ ] **Step 3: Create `rigs/content.js`** assigning `RIG.content` with the shape above, seeded with the squid species and one location (Redondo), cards empty for now. Load it with a plain `<script>` tag before the app JS, not `fetch`, so it needs no network and no CORS handling.
- [ ] **Step 4: Create `rigs/diagrams.js`** assigning `RIG.diagrams`, seeded by moving the existing squid jig SVG out of the ported markup and in under a key.
- [ ] **Step 5: Add both files to the SW PRECACHE array** in `rigs/sw.js`.
- [ ] **Step 6: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 3: Library navigation

**Files:**
- Modify: `rigs/index.html` (app JS and shell markup)
- Test: `tests/rigs-nav.smoke.mjs` (Playwright)

**Interfaces:**
- Consumes: `RIG.content` from Task 2.
- Produces: `RIG.go(speciesId, locationId?, cardId?)` for navigation; hash routing in the form `#/squid/redondo/the-bite`.

- [ ] **Step 1: Write the failing smoke test** `tests/rigs-nav.smoke.mjs`: loads `/rigs/`, asserts the species picker lists Squid, clicks it, asserts the location layer shows Redondo, asserts the three card groups "Before you go", "At the water" and "After" render as headings.
- [ ] **Step 2: Run it to confirm it fails** — `npx playwright test tests/rigs-nav.smoke.mjs`. Expected: FAIL, no species picker.
- [ ] **Step 3: Implement the species picker and the three-layer renderer** in the app JS. Location is a thin modifier: a location's cards are appended to the species' cards, never a separate page. Deep links via hash restore state on load.
- [ ] **Step 4: Run the smoke test** — expected PASS.
- [ ] **Step 5: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 4: Trip state and Field mode

**Files:**
- Modify: `rigs/index.html`
- Test: `tests/rigs-trip.smoke.mjs`

**Interfaces:**
- Consumes: `RIG.go` from Task 3.
- Produces: `RIG.trip = { add(cardId), remove(cardId), list(): string[], setDate(iso), clear() }`, persisted under localStorage key `rig.trip.v1`.

- [ ] **Step 1: Write the failing smoke test** `tests/rigs-trip.smoke.mjs`: add two cards to the trip, reload the page, assert both persist; switch to Field mode, assert exactly those two cards render and no others; assert the app opens straight back into Field mode on the next load.
- [ ] **Step 2: Add two resilience tests to the same file:** a stored trip containing an unknown card id still renders the known ones (Review Focus 2), and with `localStorage` stubbed to throw on `setItem` the page still renders Library mode and shows a "could not save this trip" notice rather than a blank screen (Review Focus 4).
- [ ] **Step 3: Run to confirm they fail** — `npx playwright test tests/rigs-trip.smoke.mjs`.
- [ ] **Step 4: Implement `RIG.trip`** with the signature above, every read and write wrapped so a storage exception degrades to in-memory only.
- [ ] **Step 5: Implement the Library/Field toggle.** Field mode renders only `RIG.trip.list()` cards, at larger type, with the nav chrome hidden. The last mode is remembered so the pier case is zero taps.
- [ ] **Step 6: Run the smoke tests** — expected PASS on all four.
- [ ] **Step 7: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 5: Squid, Before you go

**Files:**
- Modify: `rigs/content.js`
- Test: `tests/rigs-content.test.mjs` (extend)

**Interfaces:**
- Consumes: the `Card` shape from Task 2.
- Produces: cards `squid-gear`, `squid-regs`, `squid-conditions`.

- [ ] **Step 1: Write the failing tests** in `tests/rigs-content.test.mjs`: `every card with a dated field has a visible date string in its body`, and `squid-gear states the spec before the inventory match` (assert the body's "what the job needs" text appears at a lower string index than "what you have").
- [ ] **Step 2: Run to confirm failure** — `node tests/rigs-content.test.mjs`.
- [ ] **Step 3: Write the `squid-gear` card.** Spec strip, two lines, in order: what the job needs (9 ft, light power, fast action, 10 to 15 lb braid), then what you have, read from `~/Workspace/ops/FISHING-INVENTORY.md`. Line 1 always renders even when line 2 is empty. Reuse the published-but-unused `.sp .have` CSS.
- [ ] **Step 4: Write the `squid-regs` card** with the actual daily limit and license line in plain text, a `dated` field, and the WDFW link beneath. The numbers must be researched and cited, never recalled.
- [ ] **Step 5: Write the `squid-conditions` card** explaining what makes a good squid night: full dark, high slack rather than a long ebb, and a dark moon. Carry a `dated` field.
- [ ] **Step 6: Implement the stale banner.** When a card has `dated` and `RIG.trip` has a date more than 24h later, Field mode renders a `.box.red` above it naming the date the data was good for. (Review Focus 3.)
- [ ] **Step 7: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 6: Squid, At the water

**Files:**
- Modify: `rigs/content.js`, `rigs/diagrams.js`
- Test: `tests/rigs-content.test.mjs` (extend)

**Interfaces:**
- Produces: cards `squid-rig`, `squid-lures`, `squid-casting`, `squid-bite`, `squid-feel`.

- [ ] **Step 1: Write the failing test:** all five card ids exist and each belongs to group `water`.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Move the existing squid tab content** from the ported markup into these cards, splitting it along the five headings. Content is reorganized, not rewritten.
- [ ] **Step 4: Write `squid-bite` and `squid-feel` as new content.** The take is a weight change, not a strike. The line never goes slack on the lift. These are the two cards that explain the failure mode Coach hit on 2026-11-17.
- [ ] **Step 5: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 7: Squid, After

**Files:**
- Modify: `rigs/content.js`
- Test: `tests/rigs-content.test.mjs` (extend)

**Interfaces:**
- Produces: cards `squid-clean`, `squid-cook`.

- [ ] **Step 1: Write the failing test:** both ids exist, group `after`, and `squid-cook` contains the string `375` (the oil temperature the spec fixes).
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Move the Clean and Cook tab content** into the two cards.
- [ ] **Step 4: Add the two findings from the 2026-11-20 cook:** drizzle 2 tbsp of the buttermilk into the dry dredge and rake it to make clinging crumbs, and let the oil climb back to 375 between batches or batch two comes out pale and greasy.
- [ ] **Step 5: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 8: Rod course

**Files:**
- Modify: `rigs/content.js`
- Test: `tests/rigs-content.test.mjs` (extend)

**Interfaces:**
- Produces: fundamentals cards `rod-length`, `rod-power`, `rod-action`, `rod-line-rating`, `rod-reading-the-blank`.

This is the card set Coach asked for by name. It teaches, it does not just prescribe.

- [ ] **Step 1: Write the failing test:** all five ids exist with group `fundamental`, and none of their bodies name a species (assert against a word list), because Fundamentals is Layer 1 and must stay true everywhere.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Write the five cards,** in this order: length (what it buys, clearance and line control, not distance), power (how much force to bend it, and why light reads a squid), action (where it bends, and why fast telegraphs a take), line rating (what the numbers mean and what happens outside them), reading the blank (how to find all four printed above the handle on any rod in a shop).
- [ ] **Step 4: Cross-link `squid-gear` to these cards** rather than restating any of it. The no-drift rule.
- [ ] **Step 5: Run tests, `touch ~/.tests-passed`, commit**

---

### Task 9: River species bridge

**Files:**
- Modify: `rigs/index.html`, `rigs/content.js`
- Test: `tests/rigs-nav.smoke.mjs` (extend)

**Interfaces:**
- Consumes: `RIG.go` from Task 3.

- [ ] **Step 1: Write the failing smoke test:** the species picker lists Steelhead/Salmon; selecting it reaches the ported Float + Eggs, Bait, Float + Jig, Corky and Blue Fox content; the Knots tab is still reachable and its step-animator still advances on click.
- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Route Steelhead/Salmon in the picker to the ported river tabs unchanged.** One navigation only. Do not leave the old tab bar visible beside the new picker.
- [ ] **Step 4: Verify the knot animator still works** after the port. It is the most fragile ported thing: it measures SVG path lengths at runtime and silently degrades if the markup moved.
- [ ] **Step 5: Run every test in the suite, `touch ~/.tests-passed`, commit, push to main**

```bash
node tests/rigs-offline.test.mjs && node tests/rigs-content.test.mjs \
  && npx playwright test tests/rigs-nav.smoke.mjs tests/rigs-trip.smoke.mjs \
  && touch ~/.tests-passed
git add -A rigs tests docs/superpowers/plans
git commit -m "feat(rigs): squid branch complete, river bridge, rod course"
git push origin main
```
