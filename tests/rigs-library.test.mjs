// CastAI's library in the Rig Card (rigs/library.js), without a browser.
// Run: node tests/rigs-library.test.mjs
//
// What this guards:
//   - the import is reproducible: running it twice gives the same file, and
//     that file is the one committed (so nothing in it was typed by hand)
//   - no em or en dash, no exclamation mark, in any word of the library
//   - every video in it is in the fixture of YouTube oEmbed checked ids, and
//     its title names the card's subject
//   - all 32 knots and 14 casts, each with steps, the one mistake that makes
//     it fail and a video; the four knots for this week first; the pendulum
//     cast first, said as the pier swing
//   - rules are never imported as fact: no limit, season, size, license or
//     closure line in it, and the salmon guide's rules section is a link
//   - every correction has a reason and a source and is in the fixes doc
//   - THE GUARD: every knot and casting technique named in any text a person
//     reads in the app has a card, and the names used with Coach today
//     ("double uni", "arbor knot", "pendulum cast") resolve
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RIGS = join(ROOT, "rigs");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 900)); }
};
function load(file, ctx) { vm.runInContext(readFileSync(join(RIGS, file), "utf8"), ctx, { filename: file }); }
const ctx = vm.createContext({ window: {}, console });
ctx.window.window = ctx.window;
load("library.js", ctx);
load("content.js", ctx);
const L = ctx.window.RIG.library, C = ctx.window.RIG.content;
const libText = readFileSync(join(RIGS, "library.js"), "utf8");

// ---- reproducible ----------------------------------------------------------------
const SRC = process.env.CASTAI_RESOURCES || "/Users/danielgrande/Projects/CastAI/CastAI/Resources";
if (existsSync(join(SRC, "FishingKnots.json"))) {
  const tmp = mkdtempSync(join(tmpdir(), "rig-lib-"));
  try {
    const run = (n) => {
      const env = { ...process.env, LIBRARY_OUT: join(tmp, n + ".js"), LIBRARY_DOC: join(tmp, n + ".md") };
      execFileSync(process.execPath, [join(ROOT, "scripts/import-castai-library.mjs")], { env, stdio: "pipe" });
      return [readFileSync(env.LIBRARY_OUT, "utf8"), readFileSync(env.LIBRARY_DOC, "utf8")];
    };
    const a = run("a"), b = run("b");
    ok(a[0] === b[0] && a[1] === b[1], "the import is reproducible: two runs give the same library and the same fixes doc");
    ok(a[0] === libText, "rigs/library.js is exactly what the import writes (nothing in it by hand)");
    ok(a[1] === readFileSync(join(ROOT, "docs/castai-library-fixes.md"), "utf8"), "docs/castai-library-fixes.md is exactly what the import writes");
  } finally { rmSync(tmp, { recursive: true, force: true }); }
} else {
  console.log("SKIP reproducibility: CastAI's library is not on this machine (" + SRC + ")");
}

// ---- the words -------------------------------------------------------------------
// every string a person can read (ids and other keys are not read)
const KEYS = new Set(["id", "from", "hand", "joins", "group", "view", "castai", "water", "states", "latin"]);
function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => { if (!KEYS.has(k)) strings(x, out); });
  return out;
}
const words = strings({ knots: L.knots, casts: L.casts, guides: L.guides, gear: L.gear, fish: L.fish, species: L.species, groups: [L.knotGroups, L.castGroups], line: L.firstKnotsLine });
ok(!/[\u2013\u2014]/.test(libText), "no em dash or en dash anywhere in rigs/library.js", (libText.match(/.{30}[\u2013\u2014].{30}/) || [])[0]);
const bang = words.filter((w) => /!/.test(w) && !/^https?:/.test(w));
ok(bang.length === 0, "no exclamation marks in what a person reads", bang.slice(0, 3));
const dashes = words.filter((w) => / -- |--/.test(w));
ok(dashes.length === 0, "no double hyphen standing in for a dash", dashes.slice(0, 3));
const hype = words.filter((w) => /\b(seriously|basically|literally|insane|GOAT|OG|boom)\b/.test(w));
ok(hype.length === 0, "no hype words", hype.slice(0, 3));

// ---- videos ----------------------------------------------------------------------
const FIX = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/castai-videos.json"), "utf8"));
const vids = [...libText.matchAll(/"video":\{"id":"([^"]+)","title":"((?:[^"\\]|\\.)*)"/g)].map((m) => ({ id: m[1], title: m[2] }));
ok(vids.length >= 46, "the library carries its videos (" + vids.length + ")");
const unchecked = vids.filter((v) => !FIX.videos[v.id]);
ok(unchecked.length === 0, "every video in rigs/library.js is in the fixture of oEmbed checked ids", unchecked.map((v) => v.id));
ok(/oEmbed/.test(FIX.how || ""), "the fixture says how each id was checked");
const norm = (s) => String(s).toLowerCase().replace(/[\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const SUBJ = { "pendulum-cast": /pendulum|underhand/, "overhead-cast": /overhead|cast a spinning reel/, "figure-eight-loop": /figure (of )?(eight|8)/, "figure-eight-knot": /figure (of )?(eight|8)|stopper/,
  "surgeons-loop": /surgeon s? loop|surgeons? loop/, "pitch-flip": /flip|pitch/, "pitching": /pitch/, "flipping": /flip/, "skip-cast": /skip/, "two-handed-spey-cast": /spey/,
  "circle-hook-snell": /snell/, "bobber-stop-knot": /bobber stop/, "anchor-hitch": /anchor (hitch|bend)/, "sidearm-cast": /sidearm|side arm/, "kayak-cast": /kayak/ };
function subjectOk(item) {
  const t = norm(FIX.videos[item.video.id].title);
  const re = SUBJ[item.id] || new RegExp("\\b" + norm(item.name).replace(/\b(knot|cast)\b/g, "").trim().replace(/s\b/g, "s?").replace(/ /g, "\\s?"));
  return re.test(t);
}
const offSubject = L.knots.concat(L.casts).filter((x) => x.video && !subjectOk(x)).map((x) => x.id + ": " + FIX.videos[x.video.id].title);
ok(offSubject.length === 0, "every knot and cast video's checked title names that knot or cast", offSubject);

// ---- knots and casts ---------------------------------------------------------------
ok(L.knots.filter((k) => !k.added).length === 32 && new Set(L.knots.map((k) => k.id)).size === L.knots.length, "all 32 of CastAI's knots", L.knots.length);
ok(L.knots.filter((k) => k.added).map((k) => k.id).sort().join() === "anchor-hitch,bowline", "plus the two rope knots the kayak anchor card names, which CastAI is missing");
ok(L.casts.length === 14 && new Set(L.casts.map((k) => k.id)).size === 14, "all 14 of CastAI's casts", L.casts.length);
ok(JSON.stringify(L.firstKnots) === JSON.stringify(["arbor-knot", "double-uni", "palomar", "dropper-loop"]), "the four knots for this week lead: arbor, double uni, Palomar, dropper loop", L.firstKnots);
const groups = L.knotGroups.map((g) => g.id);
ok(JSON.stringify(groups) === JSON.stringify(["reel", "line", "hook", "loop", "rope"]) && L.knots.every((k) => groups.includes(k.joins)) && groups.every((g) => L.knots.some((k) => k.joins === g)),
  "knots are grouped by what they join: reel, line to line, hook and lure, loops, rope");
const thin = L.knots.concat(L.casts).filter((x) => !(x.steps.length >= 3 && x.fails && x.line && x.video && x.steps.every((s) => s.length > 8)));
ok(thin.length === 0, "every knot and cast has a line, at least three steps, the mistake that makes it fail, and a video", thin.map((x) => x.id));
ok(L.knots.filter((k) => k.hand).map((k) => k.id).sort().join() === "egg-loop-knot,improved-clinch,non-slip-loop", "the three knots the app draws by hand are marked to keep their drawings");
const hands = ["knot-improved-clinch", "knot-non-slip-loop"].every((id) => C.fundamentals.some((c) => c.id === id && /class="tyer"/.test(c.body)));
ok(hands, "and their drawn cards are still in the app");
ok(L.casts[0].id === "pendulum-cast" && /pier swing/i.test(L.casts[0].line), "the pendulum cast comes first, and its line calls it the pier swing", L.casts[0]);
const uni = L.knots.find((k) => k.id === "uni");
ok(/8 wraps on braid/.test(uni.tip), "the uni knot's braid wraps are corrected (more on braid, not fewer)", uni.tip);
const egg = L.knots.find((k) => k.id === "egg-loop-knot");
ok(!/fly/i.test(egg.about) && /shank/.test(egg.steps.join(" ")), "the egg loop is a bait snell on the shank, not a fly knot", egg.about);

// ---- guides and gear ----------------------------------------------------------------
ok(L.guides.length === 6 && L.gear.length === 2, "six guides and two gear parts", L.guides.map((g) => g.id));
const nSec = L.guides.concat(L.gear).reduce((n, g) => n + g.sections.length, 0);
ok(nSec >= 60, "every section of every guide came across (" + nSec + ")");
const salmonRules = L.guides.find((g) => g.id === "salmon").sections.find((s) => s.id === "regulations");
ok(salmonRules && salmonRules.rules === true && !salmonRules.items, "the salmon guide's rules section is a link to the checked rules, not CastAI's rules", salmonRules);
const RULEISH = /\b(daily limit|bag limit|possession limit|size limit|minimum size|regulations?|licen[cs]e|catch record card|endorsement|emergency rule|closures?|adipose|selective gear|barbless hooks? (are )?required)\b/i;
const ruled = strings({ g: L.guides, gear: L.gear, k: L.knots, c: L.casts, f: L.fish, s: L.species }).filter((w) => RULEISH.test(w) && !/^https?:/.test(w));
ok(ruled.length === 0, "no rule is imported as fact: no limit, size, license, closure or gear rule in the library", ruled.slice(0, 4));
const titled = L.guides.concat(L.gear).flatMap((g) => g.sections).filter((s) => !s.rules && !(s.items && s.items.length) && !(s.steps && s.steps.length));
ok(titled.length === 0, "no empty section", titled.map((s) => s.id));

// ---- fish -----------------------------------------------------------------------------
ok(Object.keys(L.species).length === 121 && L.species["coho-salmon"] && L.species["coho-salmon"].wa === true, "all 121 of CastAI's fish are there by id, with the states they live in");
const tabIds = C.species.map((s) => s.id);
ok(Object.keys(L.fish).every((id) => tabIds.includes(id)), "only fish the Fish tab already shows get a page's About (no new species)", Object.keys(L.fish));
ok(!/through ice/.test(L.fish.perch.text || "") && !(L.fish.perch.lures || []).includes("Ice jig"), "the perch page leaves out ice fishing");
ok(!L.fish.cutthroat.habitat, "the sea-run cutthroat page leaves out CastAI's mountain stream habitat");

// ---- corrections ----------------------------------------------------------------------
const OVR = JSON.parse(readFileSync(join(ROOT, "scripts/castai-library-overrides.json"), "utf8"));
const keys = Object.keys(OVR).filter((k) => k !== "_about");
ok(keys.every((k) => OVR[k].reason && OVR[k].source && ((OVR[k].set && Object.keys(OVR[k].set).length) || (OVR[k].add && OVR[k].add.id))), "every correction has what it sets or adds, a reason and a source", keys.filter((k) => !(OVR[k].reason && OVR[k].source)));
const doc = readFileSync(join(ROOT, "docs/castai-library-fixes.md"), "utf8");
ok(keys.every((k) => doc.includes(k)), "every correction is listed in docs/castai-library-fixes.md for the CastAI lane", keys.filter((k) => !doc.includes(k)));
ok(/Rules taken out/.test(doc) && /SalmonFishingGuide › regulations/.test(doc), "the fixes doc lists the rules taken out");
ok(existsSync(join(ROOT, "docs/castai-library-share.md")), "docs/castai-library-share.md says where the library lives and the path to one library");

// ---- THE GUARD ---------------------------------------------------------------------------
// Every knot and casting technique a person can read about in the app must
// have a card to learn it from. A name is matched loosely (case, hyphens,
// apostrophes, "knot" or not). Names the app might use that have no card yet
// are listed too, so writing one of them anywhere fails here until it has one.
const n2 = (s) => " " + norm(s).replace(/\bfigure of eight\b/g, "figure eight").replace(/\bfigure 8\b/g, "figure eight") + " ";
const cards = [];
L.knots.forEach((k) => cards.push({ kind: "knot", id: k.id, names: k.aka.concat([k.name, k.castai]) }));
L.casts.forEach((c) => cards.push({ kind: "cast", id: c.id, names: c.aka.concat([c.name, c.castai]) }));
L.guides.concat(L.gear).forEach((g) => g.sections.forEach((s) => (s.items || []).forEach((it) => cards.push({ kind: "guide", id: g.id + "/" + s.id, names: [it.name] }))));
function resolveName(name) {
  const k = n2(name).trim(), bare = k.replace(/ (knot|cast|casting)$/, "");
  return cards.filter((c) => c.names.some((x) => { const y = n2(x).trim(), yb = y.replace(/ (knot|cast|casting)$/, ""); return y === k || yb === bare || (c.kind === "guide" && y.includes(bare)); }));
}
const KNOWN = [
  // in the library (from every card's own names)
  ...cards.filter((c) => c.kind !== "guide").flatMap((c) => c.names),
  // knots with no card yet: write one of these and this test asks for its card
  "bowline", "clove hitch", "cleat hitch", "trucker's hitch", "sheet bend", "orvis knot", "duncan loop", "j knot", "seaguar knot", "yucatan knot",
  "pr bobbin", "turle knot", "two half hitches", "reef knot", "square knot", "taut line hitch", "anchor bend", "fisherman's bend", "world's fair knot",
  "pitzen knot", "eugene bend", "homer rhode loop", "lefty's loop", "triple surgeon's knot", "tucked sheet bend", "hangman's knot", "huffnagle", "trilene",
  // casts with no card yet
  "single haul", "reach cast", "tuck cast", "curve cast", "steeple cast", "switch cast", "snap t", "snake roll", "single spey", "double spey",
  "off the ground cast", "tension cast", "parachute cast", "slack line cast", "false cast", "false casting", "backhand cast", "flip cast", "dapping"
].map((x) => x.toLowerCase());
const vocab = [...new Set(KNOWN)].filter((x) => n2(x).trim().length > 3 && !/^(uni|snell|albright|palomar|skipping|pitching|flipping)$/.test(n2(x).trim()))
  .sort((a, b) => b.length - a.length);
// Where a person reads words: the page, and every content file it loads.
const FILES = ["index.html", "content.js", "runs.js", "trips.js", "crew.js", "fish.js", "rules.js", "spots-scene.js", "waters.js", "diagrams.js", "library.js"]
  .filter((f) => existsSync(join(RIGS, f)));
const found = new Map();
for (const f of FILES) {
  let t = n2(readFileSync(join(RIGS, f), "utf8"));
  for (const v of vocab) {
    const key = n2(v);
    if (!t.includes(key)) continue;
    if (!found.has(v)) found.set(v, new Set());
    found.get(v).add(f);
    t = t.split(key).join(" ");
  }
}
// and any "Something knot" or "Something hitch" the list above does not know
const STOP = new Set(["the", "a", "this", "that", "your", "any", "every", "one", "loop", "fishing", "best", "strong", "strongest", "easy", "easiest", "first", "line", "leader", "reel", "detailed", "tiny", "quick", "how", "tie", "tying",
  "braid", "simple", "basic", "stopper", "same", "slip", "overhand", "double overhand", "tied", "tie", "dry", "wet", "each", "second", "loose", "little", "small", "favorite", "only",
  "connection", "terminal", "end", "other", "main", "good", "new", "learn", "use", "knots", "essential", "of", "or", "and", "to", "my", "two", "three", "five", "4"]);
const unknown = new Map();
for (const f of FILES) {
  const raw = readFileSync(join(RIGS, f), "utf8");
  for (const m of raw.matchAll(/\b((?:[A-Z][a-z'\u2019]+ ){0,2}[A-Z][a-z'\u2019]+) ([Kk]not|[Hh]itch|[Bb]end)\b/g)) {
    // the name without filler ("The Davy Knot", "Albright Fishing Knot"),
    // tried whole and by its last words ("San Diego Jam")
    const all = m[1].toLowerCase().split(" "), ws = all.filter((w) => !STOP.has(w));
    if (!ws.length) continue;
    const tries = all.map((w, i) => all.slice(i).join(" ")).concat(ws.map((w, i) => ws.slice(i).join(" ")));
    if (tries.some((t) => resolveName(t + " " + m[2]).length || resolveName(t).length)) continue;
    unknown.set(m[0], f);
  }
}
const noCard = [...found.entries()].filter(([v]) => !resolveName(v).length).map(([v, fs]) => v + " (" + [...fs].join(", ") + ")");
ok(found.size >= 20, "the guard finds the knots and casts the app names (" + found.size + ")", [...found.keys()].slice(0, 12));
ok(noCard.length === 0, "every knot and casting technique named in the app has a card", noCard);
ok(unknown.size === 0, "no knot, hitch or bend is named that the guard does not know", [...unknown.entries()].slice(0, 8));
for (const phrase of ["double uni", "arbor knot", "pendulum cast", "pier swing", "Palomar", "dropper loop", "improved clinch", "egg loop", "roll cast"]) {
  const r = resolveName(phrase).filter((c) => c.kind !== "guide");
  ok(r.length >= 1, '"' + phrase + '" resolves to a card (' + r.map((c) => c.kind + " " + c.id).join(", ") + ")");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
