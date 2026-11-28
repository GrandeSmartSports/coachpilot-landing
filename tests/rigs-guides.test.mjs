// The Rig Card's own guides (rigs/guides.js), without a browser.
// Run: node tests/rigs-guides.test.mjs
//
// What this guards, on every line a person can read in a guide, a gear part
// or a fish's About the fish (tokens filled from the app's data first):
//   - THE WASHINGTON GUARD: no minnow or other live fish taught as bait (a
//     lure or fly named Minnow is fine), no one angler with two rods, no gear
//     Washington does not allow, no hype, no em or en dash, no exclamation,
//     no Southern water treated as local, no sentence that starts small
//   - no rule number restated: a limit, a size, an age or a day's date may
//     only be the words of a link (to the app's rules card for that water)
//   - a place named with a season is a spot the app plans in that season
//     (rigs/trips.js), and water the app does not plan is never given one
//   - every link in a guide resolves to a screen in the app, and every
//     source is the pamphlet on eRegulations, the NWS, or a screen in the app
//   - THE YEAR: every month matches the app's own season data, the way Hot
//     Trips lists trips (RIG.trips.plansOn), with what is held back and why
//   - the guides are the eight asked for, points first, each section with
//     its sources; the nine fish pages' About is the Rig Card's
//   - CastAI's guides, gear and fish text are never read by the page
//   - and a self test: the guards catch each kind of bad line
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RIGS = join(ROOT, "rigs");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 1200)); }
};
const ctx = vm.createContext({ console });
ctx.window = ctx;
for (const f of ["content.js", "trips.js", "runs.js", "lakes.js", "lakefish.js", "library.js", "guides.js"]) vm.runInContext(readFileSync(join(RIGS, f), "utf8"), ctx, { filename: f });
const RIG = ctx.RIG, G = RIG.guides, T = RIG.trips, C = RIG.content, L = RIG.library;
const raw = readFileSync(join(RIGS, "guides.js"), "utf8");
const html = readFileSync(join(RIGS, "index.html"), "utf8");

// ---- what a person reads ------------------------------------------------------
// Every line, with where it is, before and after the tokens are filled.
const LINES = [];
const add = (where, s) => { if (typeof s === "string" && s) LINES.push({ where, raw: s, text: G.text(s) }); };
for (const g of G.guides) {
  add(g.id, g.title); add(g.id, g.line); (g.notes || []).forEach((x) => add(g.id + " notes", x));
  for (const x of g.sections) {
    const w = g.id + "/" + x.id;
    add(w, x.title); add(w, x.line);
    (x.points || []).forEach((p) => add(w, p)); (x.more || []).forEach((p) => add(w + " more", p));
    (x.go || []).forEach((p) => add(w + " go", p[0]));
  }
}
for (const [id, a] of Object.entries(G.about)) {
  add("about " + id, a.what); ["tell", "where", "takes"].forEach((k) => (a[k] || []).forEach((p) => add("about " + id, p)));
}
const LINK = /\[([^\]]+)\]\(([^)\s]*)\)/g;
const plain = (t) => t.replace(LINK, "$1");
const outsideLinks = (t) => t.replace(LINK, " ");
ok(LINES.length > 300, "the guides and the About blocks carry their words (" + LINES.length + " lines)");

// ---- every token is filled ----------------------------------------------------------
const tokens = [...new Set(LINES.flatMap((l) => l.raw.match(/\{[a-z]+:[a-z0-9-]+\}/g) || []))];
const empty = tokens.filter((t) => !G.text(t).trim());
ok(tokens.length >= 20 && empty.length === 0, "every {token} fills from the app's data (" + tokens.length + " of them): a renamed plan or spot fails here", empty);
ok(LINES.every((l) => !/[{}]/.test(l.text)), "no token is left unfilled on the screen", LINES.filter((l) => /[{}]/.test(l.text)).map((l) => l.where + ": " + l.text));

// ---- THE WASHINGTON GUARD ---------------------------------------------------------
const LURE_MINNOW = /\b(laser|clouser|muddler|countdown|floating|jointed|husky|shad|rapala|deep diving|original) minnows?\b|\bminnow[- ](plugs?|patterns?|imitat\w*|shaped|style|profile)\b|\b(like|imitat\w*|resembl\w*|mimic\w*|as) an? (\w+ )?minnow\b/gi;
const MINNOW = /\bminnows?\b/i;
const LIVE_FISH = /\blive (minnows?|shiners?|shad|bluegills?|sunfish|perch|baitfish|bait ?fish|suckers?|chubs?|sculpins?|dace|herring|smelt|goldfish|alewives?|bullheads?|carp)\b|\blive fish (as|for) bait\b/i;
const TWO_RODS = /\b(set(ting)? up|set(ting)? out|run(ning)?|fish(ing)?|us(e|ing)|put(ting)? out|rig(ging)?) (2|two|three|several|multiple|both|extra|a couple( of)?|a pair of) (rods|poles|lines)\b|\b(2|two|several|multiple) (rods|poles|lines) (out|in the water)\b|\b(put|set|run|have) out (a )?(second|another|an extra) (rod|pole|line)\b|\bsecond rod\b|\bone rod\b[^.]*\b(and|while|plus) (one|another|the other|a second) rod\b|\b\d\s?(-|to)\s?\d rods\b/i;
const OTHER = /\b(jug lines?|limb lines?|spider rig\w*|cast[- ]nets?|tip-?ups?|snag(ging)? (a |the )?(fish|salmon)|chumming|chum the water|gaff(ing)? (a |the )?(salmon|steelhead|fish))\b/i;
const HYPE = /\b(seriously|basically|literally|insane\w*|GOAT|boom|actually|prime|crush(es|ed|ing)?|smash(es|ed|ing)?|absolute(ly)?|chaos|legendary|amazing|killer|monsters?|awesome|game[- ]changers?|heaven|beast|incredibl[ey]|ninja|turbo|ridiculous|bucket-list|epic|ultimate|magic(al)?|hidden gem|lifetime|destroy\w*|missiles?|royalty|circus|bonkers|easy money|trophy|unreal|world[- ]class|best ever|must[- ]have|guaranteed|never fails|secret|dynamite|slay\w*|hammer(s|ed|ing)?|fight(s)? (dirty|like)|worth every)\b/i;
const NOT_LOCAL = /\b(mangroves?|stripers?|striped bass|flatheads?|blue catfish|shellcrackers?|redears?|threadfin|gizzard shad|snook|redfish|tarpon|Gulf|Atlantic|Florida|Texas(?! rig)|bayous?|reservoirs? of the south)\b/i;
function notWA(w) {
  if (MINNOW.test(w.replace(LURE_MINNOW, ""))) return "minnow as bait";
  if (LIVE_FISH.test(w)) return "live fish as bait";
  if (TWO_RODS.test(w)) return "two rods";
  if (OTHER.test(w)) return "not legal gear";
  if (HYPE.test(w)) return "hype";
  if (NOT_LOCAL.test(w)) return "not Washington water";
  if (/[–—]/.test(w) || / -- |--/.test(w)) return "a dash";
  if (/!/.test(w)) return "an exclamation";
  if (/(^|[.?]\s+)[a-z]/.test(w)) return "a sentence that starts small";
  if (/\s[,.;:](\s|$)|\(\s*\)|\.\s*\.|,\s*,|\s{2,}/.test(w)) return "a broken sentence (what a cut word or an empty token leaves)";
  if (/\d\s?-\s?\d/.test(w.replace(/\b(19|20)\d\d-\d\d\b/g, ""))) return "a range written 2-4, not 2 to 4";
  return "";
}
const bad = LINES.filter((l) => notWA(plain(l.text)));
ok(bad.length === 0, "THE WASHINGTON GUARD: no line teaches a minnow or live fish as bait, two rods, gear Washington bans, hype, Southern water, a dash, an exclamation or a broken sentence (" + LINES.length + " lines)",
  bad.slice(0, 6).map((l) => notWA(plain(l.text)) + " | " + l.where + ": " + plain(l.text)));

// ---- no rule number restated ---------------------------------------------------------------
// a day's date: "Nov 16", "Nov. 16", "November 16" (never "November. 30 min")
const UNIT = "(?!\\s?(min|mph|ft|hr|lb|oz|mi|yd|yards?|km|minutes|hours?|feet|miles|%|F\\b))";
const RULE_NUM = [
  [new RegExp("\\b((Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\\.?|January|February|March|April|May|June|July|August|September|October|November|December) \\d{1,2}\\b" + UNIT), "a day's date"],
  [/\b\d{1,2}\/\d{1,2}\b(?! oz)/, "a date"],
  [/\b\d+ (a|per) (day|person|angler)\b|\b(daily|bag|possession) limits? of\b|\blimit of \d|\b\d+ (salmon|fish|crab|clams?|trout|perch|bass) (a|per)\b/i, "a limit"],
  [/\b\d+(\.\d+)?\s?(-|\s)?(in|inch|inches|")\s*(min|minimum|or (more|longer|bigger)|and up)\b|\b(min(imum)?|max(imum)?)\.? (size )?(of )?\d/i, "a size"],
  [new RegExp("\\b(under|over|older than|younger than) (age )?\\d{1,2}\\b" + UNIT + "|\\b\\d{1,2} (and|or) (older|over|up)\\b|\\bage \\d+", "i"), "an age"]
];
const ruleNum = (t) => (RULE_NUM.find(([re]) => re.test(t)) || [, ""])[1];
const restated = LINES.filter((l) => ruleNum(outsideLinks(l.text)));
ok(restated.length === 0, "no limit, size, age or day's date is restated outside a link to the rules", restated.slice(0, 5).map((l) => ruleNum(outsideLinks(l.text)) + " | " + l.where + ": " + l.text));

// ---- places and seasons ------------------------------------------------------------------
// A place named on a line that names a season must be a spot the app plans
// in every month the line names. Water the app does not plan cannot be
// given a season at all.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const SEASONS = { spring: [3, 4, 5], summer: [6, 7, 8], fall: [9, 10, 11], autumn: [9, 10, 11], winter: [12, 1, 2] };
const PLACES = [
  [/\bRedondo\b/, ["redondo"]], [/\bLes Davis\b/, ["les-davis"]], [/\bDes Moines\b/, ["des-moines-pier"]], [/\bPoint Defiance\b/, ["point-defiance"]],
  [/\bFox Island\b/, ["fox-island"]], [/\bDash Point\b/, ["dash-point"]], [/\b(the )?Green\b(?! (jigs?|and|bars?|head))/, ["green-river"]],
  [/\bPuyallup\b/, ["puyallup-sumner", "puyallup-128th", "puyallup-orting"]], [/\bSumner\b/, ["puyallup-sumner"]], [/\b128th\b/, ["puyallup-128th"]],
  [/\bTokul\b|\bSnoqualmie\b/, ["tokul"]], [/\bCowlitz\b/, ["cowlitz"]], [/\bFenwick\b/, ["lake-fenwick"]], [/\bTapps\b/, ["lake-tapps"]],
  [/\bAmerican Lake\b/, ["american-lake"]], [/\bWestport\b/, ["westport"]], [/\bOcean Shores\b|\bCopalis\b|\bMocrocks\b/, ["ocean-shores"]]
];
const UNPLANNED = /\b(Skokomish|Snohomish|Skykomish|Skagit|Nisqually|Hood Canal|Lake Washington|Carbon|White River|Hoh|Columbia|Sol Duc|Kalama|Duwamish|Stillaguamish|Samish|Elwha|Quillayute|Wynoochee|Satsop|Humptulips|Chehalis|Wenatchee|Yakima|Rocky Ford|Pass Lake|Bogachiel|Queets|Sammamish|Tolt|Cedar River|Deschutes|Kitsap|Edmonds|Seattle|Everett)\b/;
function monthsNamed(t) {
  const low = t.toLowerCase(), out = new Set();
  // "October to February" is every month from one to the other
  for (const m of low.matchAll(/\b(january|february|march|april|may|june|july|august|september|october|november|december) to (january|february|march|april|may|june|july|august|september|october|november|december)\b/g)) {
    let a = MONTHS.indexOf(m[1]) + 1; const b = MONTHS.indexOf(m[2]) + 1;
    for (let i = 0; i < 12; i++) { out.add(a); if (a === b) break; a = (a % 12) + 1; }
  }
  MONTHS.forEach((m, i) => { if (new RegExp("\\b" + m + "\\b").test(low)) out.add(i + 1); });
  for (const [w, ms] of Object.entries(SEASONS)) if (new RegExp("\\b" + w + "\\b").test(low)) ms.forEach((m) => out.add(m));
  return [...out];
}
function inMonth(p, m) {
  for (const y of [2026, 2027]) {
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (let d = 1; d <= n; d++) if (T.season(p, { y, m, d, iso: y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0") })) return true;
  }
  return false;
}
// The fish a line names, as the plans' species ("salmon" is any of them).
const FISH = [[/\bsurf ?perch\b/i, ["surfperch"]], [/\b(kings?|chinook|blackmouth)\b/i, ["king"]], [/\b(coho|silvers?)\b/i, ["coho"]], [/\b(pinks?|humpy|humpies)\b/i, ["pink"]],
  [/\bchum\b/i, ["chum"]], [/\bsteelhead\b/i, ["steelhead"]], [/\bsquid\b/i, ["squid"]], [/\bcutthroat\b/i, ["cutthroat"]], [/\b(perch|trout)\b/i, ["perch"]],
  [/\bbass\b/i, ["bass"]], [/\bcrab\b/i, ["crab"]], [/\bclams?\b/i, ["clams"]], [/\bsalmon\b/i, ["king", "coho", "pink", "chum"]]];
function fishNamed(t) {
  let rest = t; const out = new Set();
  for (const [re, sp] of FISH) if (re.test(rest)) { sp.forEach((x) => out.add(x)); rest = rest.replace(new RegExp(re.source, "gi"), " "); }
  return [...out];
}
function seasonFault(t) {
  t = t.replace(/\bColumbia River (Salmon and Steelhead )?[Ee]ndorsement\b/g, "the endorsement");
  const ms = monthsNamed(t);
  if (!ms.length) return "";
  const u = t.match(UNPLANNED);
  if (u) return u[0] + " is water the app does not plan, given a season";
  const fish = fishNamed(t);
  for (const [re, ids] of PLACES) {
    if (!re.test(t)) continue;
    const plans = T.plans.filter((p) => ids.includes(p.spot) && (!fish.length || fish.includes(p.species)));
    if (!plans.length) return t.match(re)[0] + " has no plan for " + fish.join(", ");
    const miss = ms.filter((m) => !plans.some((p) => inMonth(p, m)));
    if (miss.length) return t.match(re)[0] + " is not planned " + (fish.length ? "for " + fish.join(", ") + " " : "") + "in month " + miss.join(", ");
  }
  return "";
}
const offSeason = LINES.filter((l) => seasonFault(plain(l.text)));
ok(offSeason.length === 0, "every place named with a season is a spot the app plans in each month named, and no unplanned water gets a season",
  offSeason.slice(0, 5).map((l) => seasonFault(plain(l.text)) + " | " + l.where + ": " + plain(l.text)));
const named = LINES.filter((l) => monthsNamed(plain(l.text)).length && PLACES.some(([re]) => re.test(plain(l.text))));
ok(named.length >= 15, "and the guard has lines to check: " + named.length + " name a place and a season");

// ---- every link is a screen in the app ------------------------------------------------------------
const speciesById = Object.fromEntries(C.species.map((s) => [s.id, s]));
const shared = Object.fromEntries(C.shared.map((c) => [c.id, c]));
const cardsOf = (sp, loc) => [].concat(sp.cards || [], (loc && loc.cards) || []).map((c) => typeof c === "string" ? shared[c] : c).filter(Boolean);
const courses = [...new Set(C.fundamentals.map((c) => c.section).filter((s) => s && s !== "Knots"))].map((s) => s.toLowerCase());
const spotsOfType = (t) => C.spots.filter((s) => s.types.includes(t) && (C.species.some((sp) => (sp.locations || []).some((l) => l.id === s.id)) || (s.cards || []).length));
function screen(h) {
  const p = h.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!/^#\//.test(h)) return "not an app route";
  if (["trips", "fish", "lakes", "learn", "crew", "water"].includes(p[0]) && p.length === 1) return "";
  if (p[0] === "trips") return p[1] === "map" && p.length === 2 ? "" : "a Hot Trip link only lives a week";
  if (p[0] === "water") return C.types.some((t) => t.id === p[1]) && spotsOfType(p[1]).length && p.length === 2 ? "" : "no such way to fish";
  if (p[0] === "fish") return RIG.lakeFish.fish[p[1]] && p.length === 2 ? "" : "no such lake fish";
  if (p[0] === "lake") {
    const l = RIG.lakesData.lakes.find((x) => x.id === p[1]);
    if (!l || p.length !== 2) return "no such lake";
    return ["lake-fenwick-king", "american-lake-pierce", "lake-tapps-pierce"].includes(l.id) ? "that lake is a spot: link the spot" : "";
  }
  if (p[0] === "spot") return C.spots.some((s) => s.id === p[1]) && p.length === 2 ? "" : "no such spot";
  if (p[0] === "learn") {
    if (p.length === 2 && (courses.includes(p[1]) || ["knots", "casting", "guides", "gear"].includes(p[1]) || C.fundamentals.some((c) => c.id === p[1]))) return "";
    if (p[1] === "knots") return L.knots.some((k) => k.id === p[2]) && p.length === 3 ? "" : "no such knot";
    if (p[1] === "casting") return L.casts.some((k) => k.id === p[2]) && p.length === 3 ? "" : "no such cast";
    if (p[1] === "gear") return G.guide("gear").sections.some((x) => x.id === p[2]) && p.length === 3 ? "" : "no such gear part";
    if (p[1] === "guides") {
      const g = G.guide(p[2]);
      if (!g || g.home) return "no such guide";
      return p.length === 3 || (p.length === 4 && g.sections.some((x) => x.id === p[3])) ? "" : "no such guide section";
    }
    return "no such Learn screen";
  }
  const sp = speciesById[p[0]];
  if (!sp) return "no such screen";
  if (p.length === 1) return "";
  const loc = (sp.locations || []).find((l) => l.id === p[1]);
  if (!loc) return "no such place for " + sp.id;
  if (p.length === 2) return "";
  return p.length === 3 && cardsOf(sp, loc).some((c) => c.id === p[2]) ? "" : "no such card";
}
const hrefs = [];
LINES.forEach((l) => { for (const m of l.text.matchAll(LINK)) hrefs.push([l.where, m[2]]); });
G.guides.forEach((g) => g.sections.forEach((x) => (x.go || []).forEach((p) => hrefs.push([g.id + "/" + x.id + " go", p[1]]))));
const yr = G.year("2026-11-23");
yr.forEach((m) => [].concat(m.peak, m.good).forEach((g) => g.places.forEach((p) => hrefs.push(["year " + m.iso, p.href]))));
Object.values(G.sources).forEach((s) => { if (s.href) hrefs.push(["source " + s.name, s.href]); });
const broken = hrefs.filter(([, h]) => screen(h));
ok(hrefs.length >= 120 && broken.length === 0, "every link in a guide resolves to a screen in the app (" + new Set(hrefs.map((x) => x[1])).size + " screens, " + hrefs.length + " links)",
  broken.slice(0, 6).map(([w, h]) => w + ": " + h + " (" + screen(h) + ")"));
ok(G.guides.filter((g) => g.home).every((g) => g.home === "#/learn/" + g.id), "a guide with its own home (Gear) has it on the Learn tab");
const srcs = Object.entries(G.sources);
ok(srcs.every(([, s]) => s.name && (s.href ? /^#\//.test(s.href) : /^https:\/\/(www\.eregulations\.com\/washington\/fishing\/|www\.weather\.gov\/)/.test(s.url))),
  "every source is the 2026-27 pamphlet on eRegulations, the NWS, or a screen in the app", srcs.filter(([, s]) => !(s.href || /eregulations|weather\.gov/.test(s.url))));
ok(!/wdfw\.wa\.gov/i.test(raw), "rigs/guides.js never sends anyone to, or quotes, wdfw.wa.gov (it was not read)");
const unsourced = G.guides.flatMap((g) => (g.year ? [g] : g.sections).filter((x) => !(x.src && x.src.length && x.src.every((k) => G.sources[k]))).map((x) => g.id + "/" + (x.id || "")));
ok(unsourced.length === 0, "each section names its sources, and each source is real", unsourced);

// ---- the guides asked for, points first ------------------------------------------------------
ok(G.guides.map((g) => g.id).join() === "start,water,year,salmon,fly,handling,gear,safety",
  "the eight guides: Start here, Reading water, The year, Salmon, Fly fishing, Handling and release, Gear, Staying safe", G.guides.map((g) => g.id));
const secs = G.guides.flatMap((g) => g.sections.map((x) => ({ g: g.id, ...x })));
const shape = secs.filter((x) => !(x.points && x.points.length >= 2 && x.points.length <= 6 && (x.more || []).length <= 4 && x.title && x.line && x.line.length <= 36 && x.points.every((p) => plain(G.text(p)).length <= 170)));
ok(secs.length >= 35 && shape.length === 0, "every section is a headline with a short line that fits its row, 2 to 6 short points first and at most 4 lines behind More (" + secs.length + " sections)",
  shape.map((x) => x.g + "/" + x.id));
const ids = G.guides.map((g) => g.sections.map((x) => x.id));
ok(ids.every((a) => new Set(a).size === a.length), "no section id twice in a guide");
const rulesSecs = secs.filter((x) => x.rules);
ok(rulesSecs.length >= 2 && rulesSecs.every((x) => (x.go || []).length >= 3 && x.go.every(([, h]) => !screen(h))),
  "a guide's Rules section is links to the app's rules cards, never the rules", rulesSecs.map((x) => x.g + "/" + x.id));
const start = G.guide("start"), five = start.sections.find((x) => x.id === "five");
const fiveLinks = five.points.map((p) => (p.match(/\]\((#\/[^)]+)\)/) || [])[1]);
ok(five.points.length === 5 && fiveLinks.every((h) => h && !screen(h)) && five.points.every((p) => /\{when:/.test(p) && /\{drive:/.test(p)),
  "Start here's five first trips each link a spot in the app, with its months and its drive filled from the plans", fiveLinks);
ok(["license", "card", "passes", "rules"].every((id) => start.sections.some((x) => x.id === id)) && /Discover Pass/.test(JSON.stringify(start)) && /Vehicle Access Pass/.test(JSON.stringify(start)),
  "Start here covers the license, the catch record card, the Discover Pass against the Vehicle Access Pass, and where the rules live");
const salmon = G.guide("salmon");
ok(["King", "Coho", "Pink", "Chum", "Sockeye"].every((n) => new RegExp("\\b" + n).test(JSON.stringify(salmon.sections.find((x) => x.id === "tell")))),
  "Salmon in Washington tells all five apart");
ok(G.guide("gear").sections.filter((x) => /^kit-/.test(x.id)).length >= 4, "Gear has starting kits from small to big");
const prices = LINES.filter((l) => /\$\s?\d|\b\d+ dollars?\b|\b(cost|costs|price|priced)\b/i.test(plain(l.text)) && !/\babout\b[^.]*\bper the app's\b/i.test(plain(l.text)) && !/^No prices/.test(plain(l.text)));
ok(prices.length === 0, "no price without \"about\" and its source", prices.map((l) => l.where + ": " + plain(l.text)));

// ---- THE YEAR --------------------------------------------------------------------------------------
// Each month against the planner itself: the trips in it are the ones
// RIG.trips.plansOn lists on some day of it (Hot Trips' own test), peak when
// some confirmed day is peak, and what is in season but held back is named.
function expectMonth(y, m) {
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate(), on = new Set(), peak = new Set(), held = new Set();
  for (let d = 1; d <= n; d++) {
    const iso = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"), day = { y, m, d, iso };
    const listed = T.plansOn(iso).map((p) => p.id);
    listed.forEach((id) => { const p = T.plans.find((x) => x.id === id); if (p.gen) return; on.add(id); if (T.season(p, day) === "peak") peak.add(id); });
    T.plans.forEach((p) => { if (!p.gen && !listed.includes(p.id) && T.season(p, day) && T.spots.some((s) => s.id === p.spot)) held.add(p.listAs || p.name); });
  }
  return { on, peak, held: [...held].filter((h) => !T.plans.some((p) => (p.listAs || p.name) === h && on.has(p.id))) };
}
function checkYear(today) {
  const ms = G.year(today), out = [];
  const y0 = +today.slice(0, 4), m0 = +today.slice(5, 7);
  if (ms.length !== 12) out.push("not twelve months");
  ms.forEach((mo, i) => {
    const y = y0 + Math.floor((m0 - 1 + i) / 12), m = ((m0 - 1 + i) % 12) + 1;
    if (mo.y !== y || mo.m !== m || mo.now !== (i === 0)) out.push(mo.label + ": wrong month order");
    const e = expectMonth(y, m), got = new Set(mo.plans);
    const missing = [...e.on].filter((id) => !got.has(id)), extra = [...got].filter((id) => !e.on.has(id));
    if (missing.length || extra.length) out.push(mo.label + ": missing " + missing + " extra " + extra);
    const places = [].concat(mo.peak, mo.good).flatMap((g) => g.places);
    const wrongPeak = places.filter((p) => p.peak !== e.peak.has(p.plan)).map((p) => p.plan);
    if (wrongPeak.length) out.push(mo.label + ": peak wrong for " + wrongPeak);
    if (mo.peak.some((g) => !g.places.some((p) => p.peak)) || mo.good.some((g) => g.places.some((p) => p.peak))) out.push(mo.label + ": a group under the wrong head");
    const heldGot = mo.held.map((h) => h.name).sort().join("|"), heldWant = e.held.sort().join("|");
    if (heldGot !== heldWant) out.push(mo.label + ": not listed " + heldGot + " want " + heldWant);
    if (mo.held.some((h) => !h.why)) out.push(mo.label + ": a held trip with no reason");
  });
  return { ms, out };
}
for (const today of ["2026-11-23", "2027-05-03", "2027-09-13", "2026-12-07"]) {
  const { ms, out } = checkYear(today);
  ok(out.length === 0 && ms.some((m) => m.plans.length), "THE YEAR from " + today + ": all twelve months match the app's own seasons, as Hot Trips lists them (" + ms.reduce((n, m) => n + m.plans.length, 0) + " month-trips)", out.slice(0, 5));
}
const nov = yr[0];
ok(nov.now && nov.plans.includes("squid-redondo") && nov.plans.includes("chum-green-river") && !nov.plans.includes("trout-tapps") && nov.held.some((h) => /Allan Yorke/.test(h.why)),
  "November: squid and chum in, Lake Tapps held back with the closed ramp as the reason", nov);
const aug27 = yr.find((m) => m.iso === "2027-08");
ok(aug27 && aug27.held.some((h) => /Puyallup/.test(h.name)) && !aug27.plans.some((id) => /puyallup/.test(id)) && aug27.plans.includes("king-dash-point"),
  "August 2027: kings at Dash Point in, the Puyallup held until its 2027 dates are read", aug27 && aug27.held);
ok(yr.every((m) => !m.plans.some((id) => T.plans.find((p) => p.id === id).gen)), "stocked lakes are left to Lakes near you, not guessed into a month");

// ---- About the fish --------------------------------------------------------------------------------
const NINE = ["king", "coho", "pink", "steelhead", "cutthroat", "surfperch", "bass", "perch", "crab"];
ok(Object.keys(G.about).sort().join() === NINE.slice().sort().join() && NINE.every((id) => speciesById[id]),
  "About the fish: the nine pages CastAI wrote one for, each a fish the Fish tab shows", Object.keys(G.about));
const thinAbout = NINE.filter((id) => { const a = G.about[id]; return !(a.what && a.tell.length && a.where.length && a.takes.length && a.src.length && a.src.every((k) => G.sources[k])); });
ok(thinAbout.length === 0, "each says what the fish is, how to tell it, where the app fishes it, what takes it, and its sources", thinAbout);
const castaiSaid = NINE.filter((id) => L.fish[id] && [L.fish[id].text, L.fish[id].fact].filter(Boolean).some((t) => JSON.stringify(G.about[id]).includes(t.slice(0, 40))));
ok(castaiSaid.length === 0, "and none of them is CastAI's text", castaiSaid);

// ---- CastAI's guide text is not read by the page --------------------------------------------------
const reads = html.match(/\b(L|lib\(\)|RIG\.library)\.(guides|gear|fish)\b/g) || [];
ok(reads.length === 0, "rigs/index.html never reads CastAI's guides, gear or fish text from rigs/library.js", reads);
const sw = html.match(/var LIB_READY = RIG\.libReady = (\{[^}]*\});/);
const READY = sw ? vm.runInNewContext("(" + sw[1] + ")") : {};
ok(READY.guides && READY.gear && READY.about && READY.knots && READY.casting, "the switch is on for guides, gear and About, from rigs/guides.js", READY);
ok(/"\/rigs\/guides\.js"/.test(readFileSync(join(RIGS, "sw.js"), "utf8")) && /\/rigs\/guides\.js/.test(html), "rigs/guides.js is in the service worker's shell and the page loads it after the first screen");

// ---- self test: the guards see each kind of bad line --------------------------------------------------
const CAUGHT = [
  ["Fish a live shiner under a bobber.", notWA], ["Small jig with minnow.", notWA], ["Set up two rods at the lake.", notWA], ["A second rod with a worm.", notWA],
  ["Worth every minute of the fight.", notWA], ["The ultimate gamefish.", notWA], ["Docks, mangroves, rocks.", notWA], ["Bass, crappie and striper stack up.", notWA],
  ["next to a logjam. is good water", notWA], ["Squid — at night.", notWA], ["Use a cast net for bait.", notWA],
  ["Keep 2 salmon a day.", (t) => ruleNum(outsideLinks(t))], ["Closed Nov 16 to Mar 30.", (t) => ruleNum(outsideLinks(t))], ["Chinook 22 in minimum.", (t) => ruleNum(outsideLinks(t))],
  ["Kids under 16 fish free.", (t) => ruleNum(outsideLinks(t))],
  ["Chum on the Skokomish in November.", seasonFault], ["Kings off Dash Point in January.", seasonFault], ["Pinks on the Snohomish, August to September.", seasonFault],
  ["Steelhead on the Snoqualmie in March.", seasonFault], ["Squid at Redondo in summer.", seasonFault]
];
const PASSED = [
  ["Clouser minnows in olive and white.", notWA], ["Each person fishes their own rod.", notWA], ["[Under 16 fishes free](#/squid/redondo/squid-regs).", (t) => ruleNum(outsideLinks(t))],
  ["Squid at Redondo, October to February.", seasonFault], ["Kings off Dash Point, July to September.", seasonFault], ["The Skokomish has its own rules.", seasonFault]
];
const missed = CAUGHT.filter(([t, f]) => !f(t)).map((x) => x[0]), wrongly = PASSED.filter(([t, f]) => f(t)).map((x) => x[0]);
ok(missed.length === 0 && wrongly.length === 0, "self test: the guards catch live bait, two rods, banned gear, hype, Southern water, broken sentences, dashes, rule numbers and seasons on closed or unplanned water, and pass lure names, links and true seasons",
  { missed, wrongly });
ok(screen("#/learn/guides/nope") && screen("#/trips/2026-11-23~squid-redondo") && screen("#/coho/green-river/no-card") && !screen("#/coho/green-river/green-river-rules"),
  "self test: the link check fails a missing guide, a week-old Hot Trip and a missing card, and passes a real one");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
