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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
