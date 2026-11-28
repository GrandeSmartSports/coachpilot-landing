// CastAI's library in the Rig Card (rigs/library.js), without a browser.
// Run: node tests/rigs-library.test.mjs
//
// What this guards:
//   - the import is reproducible: running it twice gives the same file, and
//     that file is the one committed (so nothing in it was typed by hand)
//   - no em or en dash, no exclamation mark, in any word of the library
//   - every video in it is in the fixture of YouTube oEmbed checked ids, and
//     its title names the card's subject
//   - all 32 of CastAI's knots and 14 casts, each with steps, the one mistake
//     that makes it fail and a video (two duplicates folded into the card they
//     repeat); the four knots for this week first; the pendulum cast first,
//     said as the pier swing; the knots the review found wrong tie right
//   - the words: no hype, no sentence that starts small, no numbered list
//     with a gap, no method that is illegal in Washington freshwater in what
//     a person can open with the switch as set (LIB_READY in rigs/index.html):
//     no minnow or other live fish as bait (a lure or fly named Minnow is
//     fine), no one angler fishing two rods; and a self test that proves the
//     guard sees each of those
//   - the switch: the knots and casts are on; the guides, the gear and a
//     fish's About wait for a Washington rewrite, their words still here
//   - a guide's part opens on at most two sentences; the rest waits behind More
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
const KEYS = new Set(["id", "from", "hand", "joins", "group", "view", "castai", "water", "states", "latin", "aka"]);
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
const HYPE = /\b(seriously|basically|literally|insane\w*|GOAT|OG|boom|actually|prime|crush(es|ed|ing)?|smash(es|ed|ing)?|absolute(ly)?|chaos|legendary|amazing|killer|monsters?|awesome|game[- ]changers?|heaven|beast|incredibl[ey]|magic number|like a (hawk|missile|vise)|total pro|fighting machines?|ninja|turbo|ridiculous|piss|bucket-list|PhD)\b/i;
const hype = words.filter((w) => HYPE.test(w) && !/\b(deadly (conditions|fast)|turn deadly)\b/.test(w));
ok(hype.length === 0, "no hype words (actually, prime, crush, chaos, legendary, killer, like a hawk and the rest)", hype.slice(0, 3));
const deadly = words.filter((w) => /\bdeadly\b/i.test(w) && !/\bdeadly (conditions|fast)\b|\bturn deadly\b/i.test(w));
ok(deadly.length === 0, "\"deadly\" only where it means danger", deadly.slice(0, 3));
// a sentence never starts small, and no numbered list has a gap (a rule cut
// once left "(2)(3)(4)(6)" and "Mistake 2")
const small = words.filter((w) => /(^|[.?]\s+)[a-z]/.test(w) && !/^https?:/.test(w));
ok(small.length === 0, "no sentence starts with a small letter", small.slice(0, 3));
const loose = words.filter((w) => /\s[,.;:](\s|$)|\(\s*\)|\.\s*\.(?!\.)/.test(w));
ok(loose.length === 0, "no stray space before a comma or a full stop, no empty brackets, no double stop (what a cut word leaves)", loose.slice(0, 3));
const gaps = words.filter((w) => {
  const nums = [...w.matchAll(/\((\d)\)|\bMistake (\d)/g)].map((m) => +(m[1] || m[2]));
  return nums.length && nums.some((n, i) => n !== i + 1);
});
ok(gaps.length === 0, "no numbered list with a gap", gaps.slice(0, 2));
const ranges = words.filter((w) => /\d\s?-\s?\d/.test(w) && !/\d{3}-\d{4}/.test(w));
ok(ranges.length === 0, "a range reads \"2 to 4\", not \"2-4\"", ranges.slice(0, 3));
// THE SWITCH (rigs/index.html): which parts of the library a person can open.
const html = readFileSync(join(RIGS, "index.html"), "utf8");
const sw = html.match(/var LIB_READY = RIG\.libReady = (\{[^}]*\});/);
const READY = sw ? vm.runInNewContext("(" + sw[1] + ")") : {};
ok(sw && Object.keys(READY).sort().join() === "about,casting,gear,guides,knots" && READY.knots === true && READY.casting === true,
  "the switch is in rigs/index.html, one line, and the knots and casts are on", READY);
ok(!READY.guides && !READY.gear && !READY.about && L.guides.length && L.gear.length && Object.keys(L.fish).length,
  "the guides, the gear and a fish's About wait for a Washington rewrite, and their words are still in rigs/library.js", READY);
// What a person can open with the switch as set.
const visible = strings({ knots: L.knots, casts: L.casts, groups: [L.knotGroups, L.castGroups], line: L.firstKnotsLine,
  guides: READY.guides ? L.guides : [], gear: READY.gear ? L.gear : [], fish: READY.about ? L.fish : {} });
// Washington freshwater: no live fish as bait, hook and line only, one line
// per angler. None of these may be taught.
//   - a minnow, any way it is said, is bait, unless it is a lure or a fly
//     named for one (Laser Minnow, Clouser Minnow), a minnow plug or pattern,
//     or what a lure looks like ("darts like a dying minnow")
//   - any fish said to be live, used as bait
//   - one angler with two rods out: "set up two rods", "run one rod with...
//     and one rod with...", "put out a second rod"
const LURE_MINNOW = /\b(laser|clouser|muddler|countdown|floating|jointed|husky|shad|rapala|deep diving|original) minnows?\b|\bminnow[- ](plugs?|patterns?|imitat\w*|shaped|style|profile)\b|\b(like|imitat\w*|resembl\w*|mimic\w*|as) an? (\w+ )?minnow\b/gi;
const MINNOW = /\bminnows?\b/i;
const LIVE_FISH = /\blive (minnows?|shiners?|shad|bluegills?|sunfish|perch|baitfish|bait ?fish|suckers?|chubs?|sculpins?|dace|herring|smelt|goldfish|alewives?|bullheads?|carp)\b|\blive fish (as|for) bait\b/i;
const TWO_RODS = /\b(set(ting)? up|set(ting)? out|run(ning)?|fish(ing)?|us(e|ing)|put(ting)? out|rig(ging)?) (2|two|three|several|multiple|both|extra|a couple( of)?|a pair of) (rods|poles|lines)\b|\b(2|two|several|multiple) (rods|poles|lines) (out|in the water)\b|\b(put|set|run|have) out (a )?(second|another|an extra) (rod|pole|line)\b|\bone rod\b[^.]*\b(and|while|plus) (one|another|the other|a second) rod\b|\b\d\s?(-|to)\s?\d rods\b/i;
const OTHER = /\b(jug lines?|limb lines?|spider rig\w*|cast[- ]nets?|tip-?ups?)\b/i;
function notWA(w) {
  if (MINNOW.test(w.replace(LURE_MINNOW, ""))) return "minnow as bait";
  if (LIVE_FISH.test(w)) return "live fish as bait";
  if (TWO_RODS.test(w)) return "two rods";
  if (OTHER.test(w)) return "not legal gear";
  return "";
}
const illegal = visible.filter(notWA);
ok(visible.length > 300 && illegal.length === 0, "nothing a person can open teaches a method that is illegal in Washington freshwater: no minnow or other live fish as bait, no one angler with two rods, no jug or limb lines, spider rigs, cast nets or tip-ups (" + visible.length + " lines checked)",
  illegal.slice(0, 4).map((w) => notWA(w) + ": " + w.slice(0, 160)));
// The self test: the lines the check of the guides found, and the lure and
// fly names, so the guard is known to see each kind.
const CAUGHT = ["Try switching to a plain minnow on a small hook under a slip float. Let the minnow do the work.", "Small minnows on a tight-line rig", "Jigs tipped with minnows, blade baits, and crankbaits",
  "Jig and minnow combos, blade baits, and live bait rigs", "jig and minnow under a float is classic", "minnows outfish jigs when the bite is tough", "Small jig with minnow", "Fish a live shiner under a bobber",
  "Use live baitfish", "Set up two rods. One with cut shad on the bottom", "Run one rod with a glow flasher and hoochie, and one rod with a chrome flasher", "Put out a second rod near the bank", "Run 2 to 4 rods off the back"];
const PASSED = ["P-Line Laser Minnow", "Clouser Minnow (size 4 to 8). Weighted fly that dives", "Use Clouser Minnows, small baitfish patterns, and shrimp flies", "crankbaits and minnow plugs",
  "Twitch it and it darts like a dying minnow", "A bigger fly that imitates a minnow", "A live fish with a hook inside beats a dead fish with a hook removed", "Joining two lines of similar diameter", "Overlap the two lines by about 6 inches",
  "One rod is perfect for your first year", "Perfect for live bait, kids learning to fish"];
const missed = CAUGHT.filter((w) => !notWA(w)), wrongly = PASSED.filter(notWA);
ok(missed.length === 0 && wrongly.length === 0, "self test: the guard catches minnows and live fish as bait and two rods, and lets lure and fly names pass", { missed, wrongly });
const held = strings({ guides: L.guides, gear: L.gear, fish: L.fish }).filter(notWA);
console.log("note  held back by the switch, the guard would stop " + held.length + " lines of the guides, the gear and the fish pages");

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
const rapala = L.knots.find((k) => k.id === "rapala-knot"), flip = L.casts.find((c) => c.id === "flipping");
ok(L.knots.filter((k) => !k.added).length === 31 && new Set(L.knots.map((k) => k.id)).size === L.knots.length && rapala && rapala.aka.includes("rapala loop"),
  "all 32 of CastAI's knots: 31 cards, and the Rapala loop (the same knot) folded into the Rapala knot", L.knots.length);
ok(L.knots.filter((k) => k.added).map((k) => k.id).sort().join() === "anchor-hitch,bowline", "plus the two rope knots the kayak anchor card names, which CastAI is missing");
ok(L.casts.length === 13 && new Set(L.casts.map((k) => k.id)).size === 13 && flip && flip.aka.includes("pitch and flip"),
  "all 14 of CastAI's casts: 13 cards, and Pitch and flip (Pitching and Flipping said again) folded into Flipping", L.casts.length);
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
ok(/8 on braid/.test(uni.steps.join(" ")) && /8 wraps/.test(uni.fails) && !/fewer/i.test(JSON.stringify(uni)), "the uni knot's braid wraps are corrected (more on braid, not fewer), in its steps and its red box", [uni.steps[3], uni.fails, uni.tip]);
const egg = L.knots.find((k) => k.id === "egg-loop-knot") || { about: "", steps: [], fails: "" };
ok(!/fly/i.test(egg.about) && /shank/.test(egg.steps.join(" ")), "the egg loop is a bait snell on the shank, not a fly knot", egg.about);
ok(/wrap the long end/i.test(egg.steps.join(" ")) && /opposite way/i.test(egg.steps.join(" ")) && /push a little line back through the eye/i.test(egg.steps.join(" ")) && /long end/i.test(egg.fails),
  "the egg loop wraps with the long end, goes back through the eye the opposite way, and the loop opens by pushing line back", egg.steps);
function cardById(id) {
  let hit = null;
  (function walk(v) { if (hit || !v || typeof v !== "object") return; if (v.id === id && typeof v.body === "string") { hit = v; return; } Object.values(v).forEach(walk); })(C);
  return hit;
}
const eggCard = cardById("salmon-egg-loop");
ok(eggCard && /data-steps="6"/.test(eggCard.body) && /long end/.test(eggCard.body) && !/same direction as your first pass/.test(eggCard.body),
  "and the app's own egg loop drawing ties it the same way, in six steps");
const f8 = L.knots.find((k) => k.id === "figure-eight-loop") || { steps: [] };
ok(/down through the circle/.test(f8.steps.join(" ")) && !/up through the circle/.test(f8.steps.join(" ")), "the figure eight loop finishes down through the circle (up through ties an overhand loop)", f8.steps);
const du = L.knots.find((k) => k.id === "double-uni") || { steps: [] };
ok(/8 times/.test(du.steps[1] || "") && /braid/.test(du.steps[1] || "") && /5 times/.test(du.steps[3] || "") && /leader/.test(du.steps[3] || "") && !/Uni Knot/.test(du.steps.join(" ")),
  "the double uni's steps give the braid 8 wraps and the leader 5, as its red box says", du.steps);
const arbor = L.knots.find((k) => k.id === "arbor-knot") || {};
ok(/braid/i.test(arbor.tip || ""), "the arbor knot warns that braid spins on a bare spool", arbor.tip);
ok(/palomar/i.test((L.knots.find((k) => k.id === "improved-clinch") || {}).fails || ""), "the improved clinch card says: on braid, tie a Palomar");
const riverBraid = ["salmon-float-eggs-build", "salmon-corky-build"].map(cardById).map((c) => ((c && c.body.match(/<li>Tie the main line to[^]*?<\/li>/)) || [""])[0]);
ok(riverBraid.length === 2 && riverBraid.every((x) => /Palomar/.test(x)), "the river rigs tie the 30 lb braid main line to the swivel with a Palomar", riverBraid);
// "Says it again": a third of the shorter line's words are in the other (the
// uni's tip said its braid wraps, the Davy's its Palomar, the Alberto's its
// side by side wraps, each in other words).
const STOPW = new Set("the and you your for with that this then than from not are its into out off but can will just one two all any get got has have".split(" "));
const wset = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOPW.has(w)).map((w) => w.replace(/(ing|ed|es|s)$/, "")));
const share = (a, b) => { const A = wset(a), B = wset(b); let n = 0; A.forEach((w) => { if (B.has(w)) n++; }); return A.size && B.size ? n / Math.min(A.size, B.size) : 0; };
const said = L.knots.filter((k) => k.tip && (share(k.tip, k.fails) >= 1 / 3 || k.tip.split(/[.?]/).some((x) => x.trim().length > 12 && k.fails.includes(x.trim()))));
ok(said.length === 0 && ["uni", "davy-knot", "alberto-knot"].every((id) => !L.knots.find((k) => k.id === id).tip), "no card says its red box twice, not even in other words (the uni, the Davy and the Alberto say it once)", said.map((k) => k.id + ": " + k.tip));

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
const parts = L.guides.concat(L.gear).flatMap((g) => g.sections).flatMap((s) => s.items || []);
const sentencesOf = (t) => String(t || "").split(/(?<=[.?])\s+(?=[A-Z0-9])/).filter(Boolean);
const walls = parts.filter((it) => sentencesOf(it.text).length > 2 || (it.points.length && it.text));
ok(parts.length > 200 && walls.length === 0, "a guide's part opens on its points, or on at most two sentences; the rest waits behind More (" + parts.length + " parts)", walls.slice(0, 2).map((x) => x.name));
ok(!JSON.stringify(L.guides.concat(L.gear)).includes("ruledOut"), "no section carries a rules note (the Rules row is the one place)");
const seasons = L.guides.find((g) => g.id === "seasons");
ok(seasons && seasons.title === "Lake seasons" && !seasons.sections.some((s) => s.id === "saltwater-seasons"), "the seasons guide is lake seasons: CastAI's Gulf and Atlantic saltwater seasons are not in it");
ok(L.species["striped-bass"].wa === false && L.species.burbot.wa === true, "the Washington flags are right where the review checked them (no stripers, burbot here)");

// ---- fish -----------------------------------------------------------------------------
ok(Object.keys(L.species).length === 121 && L.species["coho-salmon"] && L.species["coho-salmon"].wa === true, "all 121 of CastAI's fish are there by id, with the states they live in");
const tabIds = C.species.map((s) => s.id);
ok(Object.keys(L.fish).every((id) => tabIds.includes(id)), "only fish the Fish tab already shows get a page's About (no new species)", Object.keys(L.fish));
ok(!/through ice/.test(L.fish.perch.text || "") && !(L.fish.perch.lures || []).includes("Ice jig"), "the perch page leaves out ice fishing");
ok(!L.fish.cutthroat.habitat, "the sea-run cutthroat page leaves out CastAI's mountain stream habitat");

// ---- corrections ----------------------------------------------------------------------
const OVR = JSON.parse(readFileSync(join(ROOT, "scripts/castai-library-overrides.json"), "utf8"));
const keys = Object.keys(OVR).filter((k) => k !== "_about");
const does = (o) => (o.set && Object.keys(o.set).length) || (o.add && o.add.id) || o.drop || o.mergeInto || (o.replace && o.replace.length) || o.items || o.types;
ok(keys.every((k) => OVR[k].reason && OVR[k].source && does(OVR[k])), "every correction has what it sets, adds, replaces, drops or folds, a reason and a source",
  keys.filter((k) => !(OVR[k].reason && OVR[k].source && does(OVR[k]))));
const doc = readFileSync(join(ROOT, "docs/castai-library-fixes.md"), "utf8");
ok(keys.every((k) => doc.includes(k)), "every correction is listed in docs/castai-library-fixes.md for the CastAI lane", keys.filter((k) => !doc.includes(k)));
ok(/Rules taken out/.test(doc) && /SalmonFishingGuide › regulations/.test(doc), "the fixes doc lists the rules taken out");
ok(existsSync(join(ROOT, "docs/castai-library-share.md")), "docs/castai-library-share.md says where the library lives and the path to one library");

// ---- THE GUARD ---------------------------------------------------------------------------
// Every knot and casting technique a person can read about in the app must
// have a card to learn it from. Three checks, and a self test that proves
// the guard can see a card go missing:
//   1. FROZEN NAMES (tests/fixtures/library-names.json): every name CastAI or
//      the app has used for a knot or a cast. Each must resolve to a card. The
//      list never shrinks by itself, so a card that goes missing fails here
//      even if nothing in the app names it today.
//   2. Every frozen name the app's text uses resolves (and the names with no
//      card yet, written anywhere, fail until they have one).
//   3. Any other name the app writes that ends in knot, hitch, bend, loop,
//      twist or cast, in any case, must resolve or be a plain word ("a tight
//      loop", "your next cast").
const NAMES = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/library-names.json"), "utf8"));
const n2 = (s) => " " + norm(s).replace(/\bfigure of eight\b/g, "figure eight").replace(/\bfigure 8\b/g, "figure eight") + " ";
function cardsOf(lib) {
  const out = [];
  lib.knots.forEach((k) => out.push({ kind: "knot", id: k.id, names: k.aka.concat([k.name, k.castai]) }));
  lib.casts.forEach((c) => out.push({ kind: "cast", id: c.id, names: c.aka.concat([c.name, c.castai]) }));
  return out;
}
function resolver(cards) {
  return (name) => {
    const k = n2(name).trim(), bare = k.replace(/ (knot|cast|casting)$/, "");
    return cards.filter((c) => c.names.some((x) => { const y = n2(x).trim(), yb = y.replace(/ (knot|cast|casting)$/, ""); return y === k || yb === bare; }));
  };
}
// Where a person reads words: the page, and every content file it loads.
const FILES = ["index.html", "content.js", "runs.js", "trips.js", "crew.js", "fish.js", "rules.js", "spots-scene.js", "waters.js", "diagrams.js", "library.js"]
  .filter((f) => existsSync(join(RIGS, f)));
// (a video's YouTube title is kept for the oEmbed check and never shown)
const TEXT = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(RIGS, f), "utf8").replace(/("video":\{"id":"[^"]*","title":)"(?:[^"\\]|\\.)*"/g, '$1""')]));
// Plain words that come before "loop", "cast" and the rest and are not a
// knot's or a cast's name ("a tight loop", "your next cast", "the D loop").
const PLAIN = new Set(("a an the this that these those your my our their its his her every each any one two three four five first second third last next " +
  "other another same new old big bigger small smaller tiny little long longer short shorter tight tighter wide wider open closed loose good bad better best " +
  "perfect nice clean neat quick quicker fast slow easy simple basic standard normal regular whole full half single double triple d of to in on at by for with " +
  "or and from into onto off out over under up down back side forward far near low high deep shallow heavy light strong weak final extra main " +
  "practice practicing learn learning make making made tie tied tying ties do doing done use used using try your youre you each every " +
  "is are was be been it its if then than so as not no just only also very more most less least all some few many much such " +
  "line lines leader tag end ends hook hooks lure lures fly flies rod rods reel reels spool water knots loops casts bait shank eye swivel " +
  "power accurate accuracy distance false backcast forward cast roll hauling haul spey overhead sidearm pitch flip skip lob pendulum " +
  "precise cannot can hard harder soft underhand overhand gentle smooth compact clean low flat never wet both fishing through slim fat minimal profile " +
  "connection original").split(" "));
function guard(lib) {
  const cards = cardsOf(lib), resolve = resolver(cards);
  // 1. every frozen name resolves to a card
  const lost = NAMES.names.filter((x) => !resolve(x).length);
  // 2. frozen names and no-card-yet names the app's text uses
  const found = new Map(), noCardYet = [];
  for (const [f, raw] of Object.entries(TEXT)) {
    const t = n2(raw);
    for (const v of NAMES.names) if (t.includes(n2(v))) { if (!found.has(v)) found.set(v, new Set()); found.get(v).add(f); }
    for (const v of NAMES.noCardYet) if (t.includes(n2(v)) && !resolve(v).length) noCardYet.push(v + " (" + f + ")");
  }
  const named = [...found.keys()].filter((v) => !resolve(v).length).map((v) => v + " (" + [...found.get(v)].join(", ") + ")");
  // 3. any other name ending in knot, hitch, bend, loop, twist or cast
  const unknown = new Map();
  for (const [f, raw] of Object.entries(TEXT)) {
    // what a person reads: code comments and tags out, and a name is words
    // with spaces between ("data-knot" and "lib-cast" are code)
    const t = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\"'])\/\/.*$/gm, "$1").replace(/<[^>]+>/g, " ").replace(/\\n/g, " ");
    for (const m of t.matchAll(/(?<![-\w.])((?:[A-Za-z'\u2019]+ ){0,3})(knot|hitch|bend|loop|twist|cast)s?\b(?!-)/gi)) {
      const all = norm(m[1]).split(" ").filter(Boolean), kind = m[2].toLowerCase();
      if (!all.length) continue;
      // the name without its plain words, tried whole and by its last words
      const ws = all.filter((w) => !PLAIN.has(w));
      if (!ws.length) continue;
      const tries = ws.map((w, j) => ws.slice(j).join(" ")).concat(all.map((w, j) => all.slice(j).join(" ")));
      if (tries.some((x) => resolve(x + " " + kind).length || resolve(x).length)) continue;
      // keyed by the word right before it: "clove hitch", "reach cast"
      const key = ws[ws.length - 1] + " " + kind;
      if (NAMES.notNames.includes(key)) continue;
      if (!unknown.has(key)) unknown.set(key, f);
    }
  }
  return { lost, named, noCardYet, unknown, found, resolve };
}
const G = guard(L);
// GUARD_DUMP=1 lists what the guard does not know, one per line
if (process.env.GUARD_DUMP) console.log([...G.unknown.keys()].sort().join("\n"));
ok(NAMES.names.length >= 100 && /never shrinks/i.test(NAMES._about || ""), "the frozen list of every knot and cast name CastAI or the app has used is in place (" + NAMES.names.length + ")");
ok(G.lost.length === 0, "every frozen knot and cast name resolves to a card", G.lost.slice(0, 8));
ok(G.found.size >= 20, "the guard finds the knots and casts the app names (" + G.found.size + ")", [...G.found.keys()].slice(0, 12));
ok(G.named.length === 0 && G.noCardYet.length === 0, "every knot and casting technique named in the app has a card", G.named.concat(G.noCardYet));
ok(G.unknown.size === 0, "no knot, hitch, bend, loop, twist or cast is named, in any case, that the guard does not know", [...G.unknown.entries()].slice(0, 400));
for (const phrase of ["double uni", "arbor knot", "pendulum cast", "pier swing", "Palomar", "dropper loop", "improved clinch", "egg loop", "roll cast", "non slip loop knot", "bobber stop", "rapala loop", "pitch and flip"]) {
  const r = G.resolve(phrase);
  ok(r.length >= 1, '"' + phrase + '" resolves to a card (' + r.map((c) => c.kind + " " + c.id).join(", ") + ")");
}
// The self test: take each card out in memory, one at a time. The guard must
// fail every time (a card nobody names still has its frozen names).
const blind = [];
for (const c of L.knots.concat(L.casts)) {
  const lib = { knots: L.knots.filter((k) => k !== c), casts: L.casts.filter((k) => k !== c) };
  const g = guard(lib);
  if (!(g.lost.length || g.named.length)) blind.push(c.id);
}
ok(blind.length === 0, "self test: with any one of the " + (L.knots.length + L.casts.length) + " cards gone, the guard fails", blind);
const noSlip = guard({ knots: L.knots.filter((k) => k.id !== "non-slip-loop"), casts: L.casts });
ok(noSlip.named.some((x) => /non slip loop/.test(x)), "self test: with the non slip loop card gone, the guard names the rig step that still says it", noSlip.named);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
