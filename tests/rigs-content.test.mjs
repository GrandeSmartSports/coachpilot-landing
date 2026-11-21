// Content-model tests for the Fishing Library.
// Run: node tests/rigs-content.test.mjs
// Loads rigs/content.js and rigs/diagrams.js in a sandbox and checks the
// shape and the invariants the spec cares about. No network, no services.
//
// The spec's structural rule is that a fact lives in exactly ONE layer:
// Fundamentals (true everywhere), Species, or Location. The duplicate-body
// check below is what enforces it. Two copies of a fact drift, and a drifted
// fact read at a pier is worse than no fact.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RIGS = join(ROOT, "rigs");

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 400)); }
};

const GROUPS = ["before", "water", "after", "fundamental"];

// --- load the data files in a browser-ish sandbox -------------------------
function load() {
  const sandbox = { window: {}, console };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  for (const f of ["content.js", "diagrams.js"]) {
    const p = join(RIGS, f);
    if (!existsSync(p)) throw new Error(`missing rigs/${f}`);
    vm.runInContext(readFileSync(p, "utf8"), sandbox, { filename: f });
  }
  return sandbox.window.RIG || {};
}

let RIG = null, loadErr = null;
try { RIG = load(); } catch (e) { loadErr = e; }
ok(!loadErr, "rigs/content.js and rigs/diagrams.js load without throwing", loadErr && loadErr.message);

if (!RIG) {
  console.log(`\n${pass} passed, ${fail + 1} failed`);
  process.exit(1);
}

ok(RIG.content && typeof RIG.content === "object", "RIG.content exists");
ok(Array.isArray(RIG.content?.fundamentals), "RIG.content.fundamentals is an array");
ok(Array.isArray(RIG.content?.species), "RIG.content.species is an array");
ok(RIG.diagrams && typeof RIG.diagrams === "object", "RIG.diagrams exists");

// --- collect every card, remembering where it came from -------------------
const cards = [];
for (const c of RIG.content?.fundamentals || []) cards.push({ ...c, _layer: "fundamentals" });
for (const sp of RIG.content?.species || []) {
  for (const c of sp.cards || []) cards.push({ ...c, _layer: `species:${sp.id}` });
  for (const loc of sp.locations || []) {
    for (const c of loc.cards || []) cards.push({ ...c, _layer: `location:${sp.id}/${loc.id}` });
  }
}
ok(cards.length > 0, "at least one card is defined", `found ${cards.length}`);

// --- species shape --------------------------------------------------------
const badSpecies = (RIG.content?.species || []).filter(
  (s) => !s.id || !s.name || !Array.isArray(s.locations) || !Array.isArray(s.cards)
).map((s) => s.id || "(no id)");
ok(badSpecies.length === 0, "every species has id, name, locations[] and cards[]", badSpecies.join(", "));

// --- card shape -----------------------------------------------------------
const badShape = cards.filter((c) => !c.id || !c.title || typeof c.body !== "string").map((c) => c.id || "(no id)");
ok(badShape.length === 0, "every card has id, title and a string body", badShape.join(", "));

const badGroup = cards.filter((c) => !GROUPS.includes(c.group)).map((c) => `${c.id}:${c.group}`);
ok(badGroup.length === 0, `every card.group is one of ${GROUPS.join("|")}`, badGroup.join(", "));

// --- ids unique across ALL layers ----------------------------------------
const seen = new Map();
const dupes = [];
for (const c of cards) {
  if (seen.has(c.id)) dupes.push(`${c.id} (${seen.get(c.id)} and ${c._layer})`);
  else seen.set(c.id, c._layer);
}
ok(dupes.length === 0, "every card id is unique across all three layers", dupes.join(" | "));

// --- diagram keys resolve -------------------------------------------------
const badDia = cards.filter((c) => c.diagram && !(c.diagram in (RIG.diagrams || {})))
  .map((c) => `${c.id} -> ${c.diagram}`);
ok(badDia.length === 0, "every card.diagram key exists in RIG.diagrams", badDia.join(" | "));

// --- the no-drift rule ----------------------------------------------------
const norm = (s) => s.replace(/\s+/g, " ").trim();
const byBody = new Map();
const dupBodies = [];
for (const c of cards) {
  const k = norm(c.body);
  if (!k) continue;
  if (byBody.has(k)) dupBodies.push(`${byBody.get(k)} and ${c.id}`);
  else byBody.set(k, c.id);
}
ok(dupBodies.length === 0, "no card body is written verbatim in two cards", dupBodies.join(" | "));

// --- a fundamental must be true everywhere --------------------------------
// A Layer 1 card that names a species is not a fundamental, it is species
// content filed in the wrong layer, and it will contradict the species card.
const SPECIES_WORDS = /\b(squid|steelhead|salmon|coho|chinook|trout|clam|crab)\b/i;
const leaky = (RIG.content?.fundamentals || [])
  .filter((c) => SPECIES_WORDS.test(c.body) || SPECIES_WORDS.test(c.title))
  .map((c) => c.id);
ok(leaky.length === 0, "no fundamentals card names a species", leaky.join(", "));

// --- dated content must carry a real date --------------------------------
// Anything with a shelf life is stamped so Field mode can warn when it has
// gone off. A malformed date silently disables that warning.
const badDates = cards.filter((c) => c.dated && !/^\d{4}-\d{2}-\d{2}$/.test(c.dated))
  .map((c) => `${c.id}:${c.dated}`);
ok(badDates.length === 0, "every dated card carries an ISO yyyy-mm-dd date", badDates.join(", "));

const byId = new Map(cards.map((c) => [c.id, c]));

// --- squid, Before you go -------------------------------------------------
for (const id of ["squid-gear", "squid-regs", "squid-conditions"]) {
  const c = byId.get(id);
  ok(!!c, `${id} exists`);
  if (c) ok(c.group === "before", `${id} is in the Before you go group`, c.group);
}

// The spec strip states what the JOB needs first, and what Coach owns second.
// Reversed, the card recommends the rod that already failed at Redondo.
{
  const gear = byId.get("squid-gear");
  if (gear) {
    const needs = gear.body.indexOf("sp-needs");
    const have = gear.body.indexOf("have");
    ok(needs >= 0, "squid-gear marks the needed spec");
    ok(have >= 0, "squid-gear marks what is owned");
    ok(needs >= 0 && have >= 0 && needs < have,
      "squid-gear states what the job needs BEFORE what Coach owns", `needs@${needs} have@${have}`);
    ok(/9\s*(ft|foot|')/i.test(gear.body) && /light/i.test(gear.body) && /fast/i.test(gear.body),
      "squid-gear carries the settled rod spec: 9 ft, light, fast");
  }
}

// A regs card that only links out is useless at a rail with no signal, which
// is the condition this whole page is built for.
{
  const regs = byId.get("squid-regs");
  if (regs) {
    ok(/10\s*(lb|pound)/i.test(regs.body) && /5\s*quart/i.test(regs.body),
      "squid-regs states the actual daily limit, not just a link");
    ok(/one line|single line|1 line/i.test(regs.body),
      "squid-regs carries the 2026 one-line-per-harvester rule");
    ok(/\bwdfw\b/i.test(regs.body), "squid-regs names its source");
    ok(!!regs.dated, "squid-regs is dated");
  }
}

// --- the rod course (Layer 1) --------------------------------------------
// Coach asked to be taught what the numbers mean, not just told what to buy.
// These five are the course, and they live in Fundamentals because they are
// true of every rod on every shelf. The "no fundamentals card names a
// species" check above is what keeps them that way.
{
  const ids = ["rod-length", "rod-power", "rod-action", "rod-line-rating", "rod-reading-the-blank"];
  for (const id of ids) {
    const c = byId.get(id);
    ok(!!c, `${id} exists`);
    if (c) ok(c.group === "fundamental", `${id} is a fundamental`, c.group);
  }
  const power = byId.get("rod-power");
  if (power) ok(/ultra\s*light|medium heavy/i.test(power.body),
    "rod-power names the actual rating words found on a blank");
  const action = byId.get("rod-action");
  if (action) ok(/where/i.test(action.body),
    "rod-action explains that action is WHERE the rod bends, not how much");
  const blank = byId.get("rod-reading-the-blank");
  if (blank) ok(/above the handle|handle/i.test(blank.body),
    "rod-reading-the-blank says where on the rod to look");

  // The gear card must point at the course rather than restating it.
  const gear = byId.get("squid-gear");
  if (gear) ok(ids.some((id) => gear.body.includes(id)),
    "squid-gear links into the rod course instead of repeating it");
}

// --- squid, At the water --------------------------------------------------
{
  const ids = ["squid-rig", "squid-lures", "squid-casting", "squid-bite", "squid-feel"];
  for (const id of ids) {
    const c = byId.get(id);
    ok(!!c, `${id} exists`);
    if (c) ok(c.group === "water", `${id} is in the At the water group`, c.group);
  }
  // The two cards that exist because of what went wrong on 2026-11-17.
  const bite = byId.get("squid-bite");
  if (bite) ok(/weight/i.test(bite.body) && /not a (strike|tap|bite)/i.test(bite.body),
    "squid-bite says the take is a weight change, not a strike");
  const feel = byId.get("squid-feel");
  if (feel) ok(/slack/i.test(feel.body),
    "squid-feel covers never letting the line go slack");
  // The rig must agree with the regs card: one line, up to four lures.
  const rig = byId.get("squid-rig");
  if (rig) ok(/four|4\b/i.test(rig.body) && /one line|single line/i.test(rig.body),
    "squid-rig agrees with the one line, four lure rule");
}

// --- squid, After ---------------------------------------------------------
{
  for (const id of ["squid-clean", "squid-cook"]) {
    const c = byId.get(id);
    ok(!!c, `${id} exists`);
    if (c) ok(c.group === "after", `${id} is in the After group`, c.group);
  }
  // The specific failure from the first cleaning, 2026-11-18: pulling the head
  // without freeing the guts first tears the head off and leaves the insides.
  const clean = byId.get("squid-clean");
  if (clean) {
    ok(/sweep|finger/i.test(clean.body), "squid-clean covers freeing the guts before pulling");
    ok(/tentacle/i.test(clean.body), "squid-clean covers the tentacles, which were thrown out the first time");
    ok(/beak/i.test(clean.body), "squid-clean covers the beak");
  }
  // Everything learned actually cooking it on 2026-11-20.
  const cook = byId.get("squid-cook");
  if (cook) {
    ok(/375/.test(cook.body), "squid-cook states the oil temperature");
    ok(/60 to 90|90 second/i.test(cook.body), "squid-cook states the 60 to 90 second rule");
    ok(/buttermilk/i.test(cook.body), "squid-cook uses the buttermilk soak");
    ok(/cornstarch/i.test(cook.body), "squid-cook keeps the cornstarch in the dredge");
    ok(/drizzle|rake|crumb/i.test(cook.body), "squid-cook carries the dredge clumping trick");
    ok(/back to 375|climb back|recover/i.test(cook.body), "squid-cook covers letting the oil recover between batches");
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
