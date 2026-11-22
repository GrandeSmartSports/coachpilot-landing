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

const GROUPS = ["technique", "before", "water", "after", "fundamental"];

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
// Shared cards are written once and referenced by id from every fish they
// are true for. A string in a cards list is that reference.
for (const c of RIG.content?.shared || []) cards.push({ ...c, _layer: "shared" });
const refs = [];
for (const sp of RIG.content?.species || []) {
  for (const c of sp.cards || []) typeof c === "string" ? refs.push(c) : cards.push({ ...c, _layer: `species:${sp.id}` });
  for (const loc of sp.locations || []) {
    for (const c of loc.cards || []) typeof c === "string" ? refs.push(c) : cards.push({ ...c, _layer: `location:${sp.id}/${loc.id}` });
  }
}
// Every card a species can show, own and shared, resolved.
const sharedById = new Map((RIG.content?.shared || []).map((c) => [c.id, c]));
const cardsOf = (sp) => [...(sp.cards || []), ...(sp.locations || []).flatMap((l) => l.cards || [])]
  .map((c) => (typeof c === "string" ? sharedById.get(c) : c)).filter(Boolean);
ok(cards.length > 0, "at least one card is defined", `found ${cards.length}`);
const dangling = refs.filter((id) => !sharedById.has(id));
ok(dangling.length === 0, "every shared card reference points at a shared card", dangling.join(", "));

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

// Staleness is opt in via shelfDays, which means a card that forgets it is
// silently exempt from the warning forever. Requiring the field on every
// dated card forces the author to decide how fast that content goes off
// rather than defaulting to "never" by omission.
const noShelf = cards.filter((c) => c.dated && typeof c.shelfDays !== "number").map((c) => c.id);
ok(noShelf.length === 0, "every dated card declares how fast it goes off (shelfDays)", noShelf.join(", "));

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
    // The card tells Coach to check before he goes. It has to give him a
    // route to, not just a name.
    ok(/href="https:\/\/wdfw\.wa\.gov/.test(regs.body),
      "squid-regs links to WDFW, not just names it");
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

// --- diagrams must survive a theme flip -----------------------------------
// The page carries a full light palette and iOS defaults to light in daylight.
// A diagram drawn in hardcoded dark-theme hex loses its labels entirely on a
// white panel: near-white text on near-white background. Every colour comes
// from a custom property so it flips with everything else.
{
  const dias = readFileSync(join(RIGS, "diagrams.js"), "utf8");
  const rawHex = [...dias.matchAll(/(?:fill|stroke|stop-color)\s*=\s*"(#[0-9a-f]{3,8})"/gi)].map((m) => m[1]);
  ok(rawHex.length === 0,
    "diagrams use theme variables, never hardcoded hex", [...new Set(rawHex)].join(", "));
}

// --- river salmon, ported from the old Rig Card ----------------------------
{
  const river = (RIG.content?.species || []).find((s) => s.id === "coho");
  ok(!!river, "a river species (coho) is in the picker");
  const riverCards = cardsOf(river).map((c) => cards.find((x) => x.id === c.id));
  ok(riverCards.length >= 10, "the river species has its full set of cards, not a stub", riverCards.length);
  for (const rig of ["float-eggs", "float-jig", "corky", "blue-fox"]) {
    const b = byId.get(`salmon-${rig}-build`), f = byId.get(`salmon-${rig}-fish`);
    ok(b && b.group === "before", `salmon-${rig}-build exists under Before you go`);
    ok(f && f.group === "water", `salmon-${rig}-fish exists under At the water`);
    ok(b && b.diagram && RIG.diagrams[b.diagram], `salmon-${rig}-build carries its rig diagram`);
  }
  ok(byId.get("salmon-bait") && /bait thread/i.test(byId.get("salmon-bait").body),
    "salmon-bait carries the bait thread method");
  ok(/spawn sack/i.test(byId.get("salmon-bait")?.body || ""), "salmon-bait carries spawn sacks");
  const tyerCount = (b) => (b.match(/class="tyer"/g) || []).length;
  ok(tyerCount(byId.get("salmon-bait")?.body || "") === 2, "salmon-bait keeps both step players");
  ok(byId.get("salmon-egg-loop") && tyerCount(byId.get("salmon-egg-loop").body) === 1,
    "the egg loop knot player lives in the river species");
  for (const id of ["knot-improved-clinch", "knot-non-slip-loop"]) {
    const k = byId.get(id);
    ok(k && k._layer === "fundamentals" && tyerCount(k.body) === 1, `${id} is a Learn card with its step player`);
  }
  // Legal rules are true only on that river, so they are a location card and
  // they go off: regs move season to season.
  const green = river?.locations?.find((l) => l.id === "green-river");
  ok(!!green, "Green River is a location under the river species");
  const rules = byId.get("green-river-rules");
  ok(rules && rules._layer === "shared", "green-river-rules is written once and shared by every river fish");
  ok(rules && rules.dated && typeof rules.shelfDays === "number", "green-river-rules is dated and goes off");
  ok(/href="https:\/\/wdfw\.wa\.gov/.test(rules?.body || ""), "green-river-rules links to WDFW");
  ok(/single point hook/i.test(rules?.body || "") && /12 inches/.test(rules?.body || ""),
    "green-river-rules states the hook and weight rules");
  const leaked = riverCards.filter((c) => c._layer.startsWith("species:") && /Legal check, Green River/.test(c.body)).map((c) => c.id);
  ok(leaked.length === 0, "river-specific legal checks are not copied into species cards", leaked.join(", "));
  // The old card was one page of tabs. Leftover "sheet" and "this card"
  // wording points at a page that no longer exists.
  const stale = riverCards.concat(cards.filter((c) => c.id.startsWith("knot-")))
    .filter((c) => /\b(?:knots|eggs|jig|corky|fox) sheet\b|on this card|this whole card/i.test(c.body)).map((c) => c.id);
  ok(stale.length === 0, "no card refers to the old tabbed sheets", stale.join(", "));
}

// --- no raw colour anywhere a card draws -----------------------------------
{
  const bodyHex = cards.filter((c) => /(?:fill|stroke|stop-color)\s*=\s*"#[0-9a-f]{3,8}"/i.test(c.body)).map((c) => c.id);
  ok(bodyHex.length === 0, "card bodies use theme variables, never hardcoded hex", bodyHex.join(", "));
  // Shared parts are drawn once as <symbol>s in index.html. A <use> that
  // points at a missing symbol draws nothing and fails silently.
  const index = readFileSync(join(RIGS, "index.html"), "utf8");
  const dias = readFileSync(join(RIGS, "diagrams.js"), "utf8");
  const all = index + dias + cards.map((c) => c.body).join("");
  const defined = new Set([...all.matchAll(/<[a-zA-Z]+ [^>]*\bid="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...all.matchAll(/<use [^>]*href="#([^"]+)"/g)].map((m) => m[1]));
  const missing = [...used].filter((u) => !defined.has(u));
  ok(missing.length === 0, "every <use> points at a part that is defined", missing.join(", "));
}

// --- species on top: everything Coach actually fishes --------------------
{
  const sp = (id) => (RIG.content?.species || []).find((s) => s.id === id);
  for (const id of ["squid", "king", "coho", "pink", "chum", "steelhead", "bass", "perch"]) ok(!!sp(id), `species tab: ${id}`);
  ok(!sp("salmon"), "salmon is split into its kinds, not one tab");
  const ids = (id, loc) => ((sp(id)?.locations || []).find((l) => l.id === loc)?.cards || []).map((c) => (typeof c === "string" ? c : c.id));
  // The river rigs are shared: the same corky and float serve every kind.
  for (const id of ["king", "coho", "pink", "chum", "steelhead"]) ok(ids(id, "green-river").includes("salmon-corky-build"), `${id} gets the shared river rigs`);
  ok(ids("coho", "dash-point").includes("dash-coho") && !ids("king", "dash-point").includes("dash-coho"), "the coho hoochie program is coho only");
  const kingBody = cardsOf(sp("king")).map((c) => c.body).join(" ");
  ok(/mooch/i.test(kingBody) && /cut plug/i.test(kingBody) && /bead chain/i.test(kingBody), "kings carry the mooching rig and cut plug herring");
  ok(/deeper/i.test(kingBody) && /shallow/i.test(kingBody), "kings say how they differ from coho");
  const dash = sp("coho")?.locations?.find((l) => l.id === "dash-point");
  const green = sp("coho")?.locations?.find((l) => l.id === "green-river");
  const body = (loc) => (loc?.cards || []).map((c) => (typeof c === "string" ? sharedById.get(c) : c)).filter(Boolean).map((c) => c.body).join(" ");
  const dashBody = body(dash);
  ok(/barbless/i.test(dashBody) && /siwash/i.test(dashBody), "Dash Point says swap trebles for barbless single siwash");
  ok(/gunwale/i.test(dashBody), "Dash Point covers releasing in the water, never inside the gunwale");
  ok(/hoochie/i.test(dashBody) && /buzz bomb/i.test(dashBody), "Dash Point carries the coho hoochie and Buzz Bomb program");
  ok(dash?.tideStation?.id === "9446705", "Dash Point tides come from station 9446705");
  ok(/Nov(ember)? 16/.test(sharedById.get("dash-season")?.body || "") && sharedById.get("dash-season")?.shelfDays, "Dash Point season card is dated and states the winter closure");
  ok(!/hoochie/i.test(RIVER_BODY(green)), "no hoochies in the river rigs (saltwater only)");
  function RIVER_BODY(loc) { return (loc?.cards || []).filter((c) => typeof c === "string").map((id) => sharedById.get(id)?.body || "").join(" "); }
  const pinkBody = cardsOf(sp("pink")).map((c) => c.body).join(" ");
  ok(sp("pink")?.family === "salmon", "pink sits in the salmon family");
  ok(/odd/i.test(pinkBody) && /2027/.test(pinkBody), "pink says it runs odd years, next run 2027");
  ok(ids("pink", "dash-point").includes("dash-law") && !ids("pink", "dash-point").includes("dash-coho"), "pink gets Dash Point gear law, not the coho program");
  ok(/soft mouth|tears|lift/i.test(pinkBody) && /pink/i.test(pinkBody), "pink covers small pink lures and the soft mouth");
  ok(/not confirmed|not pulled in/i.test(cardsOf(sp("steelhead")).map((c) => c.body).join(" ")), "steelhead says plainly its season is not confirmed");
  const bassBody = (sp("bass")?.cards || []).concat(...(sp("bass")?.locations || []).map((l) => l.cards || [])).map((c) => c.body).join(" ");
  ok(/rooster tail/i.test(bassBody) && /1\/8 oz/i.test(bassBody), "bass carries the 1/8 oz chartreuse Rooster Tail");
  ok(/texas/i.test(bassBody) && /wacky/i.test(bassBody), "bass carries the Texas rig and the wacky rig");
  ok((sp("bass")?.locations || []).some((l) => l.id === "lake-fenwick"), "bass has Lake Fenwick");
  const perchLocs = (sp("perch")?.locations || []).map((l) => l.id);
  ok(perchLocs.length >= 2, "perch and trout list the year-round lakes", perchLocs.join(", "));
}

// --- kayak lives in Learn, because it is true for any fish ----------------
{
  const kayak = (RIG.content?.fundamentals || []).filter((c) => c.section === "Kayak").map((c) => c.id);
  for (const id of ["kayak-load", "kayak-pack", "kayak-anchor", "kayak-pfd", "kayak-gonogo", "kayak-reentry"])
    ok(kayak.includes(id), `Learn has kayak card ${id}`);
  const anchor = byId.get("kayak-anchor");
  ok(/3x|3 times|three times/i.test(anchor?.body || "") && /25 ft/.test(anchor?.body || ""), "anchor card carries the scope drill and the 25 ft marks");
  ok(/10 kt|10 knots/i.test(byId.get("kayak-gonogo")?.body || ""), "go/no-go states the wind limit");
  ok(/manual/i.test(byId.get("kayak-pfd")?.body || "") && /auto/i.test(byId.get("kayak-pfd")?.body || ""), "PFD card says manual on lakes, auto on the Sound");
  const secs = new Set((RIG.content?.fundamentals || []).map((c) => c.section));
  ok(secs.has("Rods") && secs.has("Knots") && secs.has("Kayak"), "Learn is split into Rods, Knots and Kayak", [...secs].join(", "));
}

// --- every card fits the jump bar ------------------------------------------
{
  const long = cards.filter((c) => !c.tab || c.tab.length > 16).map((c) => c.id);
  ok(long.length === 0, "every card has a short label for next and back", long.join(", "));
}

// --- technique: learn from people who are good at it ---------------------
{
  const tech = cards.filter((c) => c._layer === "species:squid" && c.group === "technique");
  ok(tech.length >= 2, "squid has a Technique section", tech.length);
  const body = tech.map((c) => c.body).join(" ");
  const vids = [...body.matchAll(/<a class="vid" href="(https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11})"/g)].map((m) => m[1]);
  ok(vids.length >= 8, "squid technique carries at least 8 videos", vids.length);
  ok(new Set(vids).size === vids.length, "no video listed twice");
  const tiles = [...body.matchAll(/<a class="vid"[\s\S]*?<\/a>/g)].map((m) => m[0]);
  ok(tiles.every((t) => /class="by"/.test(t) && /class="len"/.test(t) && /class="why"/.test(t)),
    "every video says who made it, how long it is, and what to watch for");
  ok(/one line/i.test(body), "technique warns that older videos predate the one line rule");
}

// --- every species teaches with video --------------------------------------
{
  const all = [];
  for (const sp of RIG.content?.species || []) {
    const mine = cardsOf(sp).filter((c) => c.group === "technique");
    const ids = [...mine.map((c) => c.body).join(" ").matchAll(/<a class="vid" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/g)].map((m) => m[1]);
    ok(ids.length >= 5, `${sp.id} has a Technique section with at least 5 videos`, ids.length);
  }
  for (const c of cards.filter((c) => c.group === "technique")) all.push(...[...c.body.matchAll(/<a class="vid" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/g)].map((m) => m[1]));
  ok(new Set(all).size === all.length, "no video appears twice anywhere in the library");
  const tiles = cards.filter((c) => c.group === "technique").flatMap((c) => [...c.body.matchAll(/<a class="vid"[\s\S]*?<\/a>/g)].map((m) => m[0]));
  ok(tiles.every((t) => /class="by"/.test(t) && /class="len"/.test(t) && /class="why"/.test(t)), "every video tile in the library is complete");
  const salt = cards.filter((c) => c._layer === "location:coho/dash-point" && c.group === "technique").map((c) => c.body).join(" ");
  ok(/barbless/i.test(salt), "salt water videos come with the barbless warning");
}

// --- fly, crab, clams, surf perch, cutthroat (2026-11-21) -------------------
{
  const sp = (id) => (RIG.content?.species || []).find((s) => s.id === id);
  for (const id of ["crab", "clams", "surfperch", "cutthroat"]) ok(!!sp(id), `species tab: ${id}`);
  const flyCards = cards.filter((c) => c.section === "Fly");
  ok(flyCards.length >= 8, "Learn has a Fly section", flyCards.length);
  const keep = byId.get("crab-keep")?.body || "";
  ok(/6 1\/4/.test(keep) && /5 a day/.test(keep) && /6 inches/.test(keep), "crab keep card carries Puget Sound and coast sizes and limits");
  ok(/females/i.test(keep) && /soft shell/i.test(keep), "crab keep card says females and soft shells go back");
  ok(/sunset/.test(byId.get("crab-gear")?.body || "") && /half red/i.test(byId.get("crab-gear")?.body || ""), "crab gear card carries the hours and buoy rules");
  const clam = byId.get("clam-rules")?.body || "";
  ok(/15 clams/.test(clam) && /first 15/.test(clam) && /own container/.test(clam), "razor clam rules: 15, first 15, own container");
  for (const id of ["crab-license", "dash-crab", "westport-crab", "clam-rules", "razor-dates", "clam-sound", "surf-rules", "src-rules"]) {
    const c = byId.get(id);
    ok(c && c.dated && c.shelfDays, `${id} is dated and goes off`);
  }
  ok(byId.get("razor-dates")?.shelfDays <= 7, "dig dates go off within a week");
  const spots = RIG.content?.spots || [];
  ok(spots.some((s) => s.types.includes("beach")) && spots.some((s) => s.types.includes("fly")), "there are beach and fly spots");
  const known = new Set(spots.map((s) => s.id));
  const orphan = (RIG.content?.species || []).flatMap((s) => (s.locations || []).map((l) => l.id)).filter((id) => !known.has(id));
  ok(orphan.length === 0, "every species location is a registered spot", orphan.join(", "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
