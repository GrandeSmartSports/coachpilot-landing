#!/usr/bin/env node
// CastAI's library, in the Rig Card. ONE SOURCE, TWO APPS.
//
// Reads CastAI's library files (the JSON inside the iOS app) and writes
// rigs/library.js, the Rig Card's copy. Nothing is typed in by hand: rerun
// this and you get the same file, byte for byte.
//
//   node scripts/import-castai-library.mjs                 write rigs/library.js and docs/castai-library-fixes.md
//   node scripts/import-castai-library.mjs --check         exit 1 if either file is not what this would write
//   node scripts/import-castai-library.mjs --check-videos  ask YouTube oEmbed about every video, rewrite the fixture
//   node scripts/import-castai-library.mjs --said          list the tips and mistakes dropped as said twice
//
// Where CastAI is read from: CASTAI_RESOURCES, default below. Read only.
//
// What happens on the way in:
//   1. Corrections (a wrong step, a dead or wrong video, an unsupported claim)
//      come from scripts/castai-library-overrides.json, keyed by CastAI file
//      and id, each with its reason and source. docs/castai-library-fixes.md
//      lists every one so the CastAI lane can fix CastAI; then the override
//      is deleted.
//   2. Rules are never imported as fact. Any sentence that states a fishing
//      rule (limits, seasons, sizes, closures, licenses, gear rules) is cut,
//      and a section that is about rules becomes a link to the Rig Card's own
//      checked rules (the Rules row on a trip's card, and WDFW's emergency
//      rules). Every cut is listed in the fixes doc.
//   3. The voice: no em or en dashes, no exclamation marks, no hype words,
//      sentence case headings. Names, one lines and "where it fails" lines
//      for knots and casts are the Rig Card's own, in
//      scripts/castai-library-voice.json.
//   4. A video ships only if it is in tests/fixtures/castai-videos.json, which
//      --check-videos fills from YouTube oEmbed (200, and a title that names
//      the subject). Anything else is dropped and listed.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.env.CASTAI_RESOURCES || "/Users/danielgrande/Projects/CastAI/CastAI/Resources";
const OUT = process.env.LIBRARY_OUT || join(ROOT, "rigs/library.js");
const DOC = process.env.LIBRARY_DOC || join(ROOT, "docs/castai-library-fixes.md");
const VIDS = join(ROOT, "tests/fixtures/castai-videos.json");
const OVR = JSON.parse(readFileSync(join(ROOT, "scripts/castai-library-overrides.json"), "utf8"));
const VOICE = JSON.parse(readFileSync(join(ROOT, "scripts/castai-library-voice.json"), "utf8"));
const FILES = ["FishingKnots", "CastingTechniques", "FishSpecies", "TackleGuide", "SalmonFishingGuide", "BeginnersGuide",
  "ReadingWaterGuide", "SeasonalGuide", "FlyFishingGuide", "DehookingGuide", "GearBudgetGuide"];

const args = new Set(process.argv.slice(2));
const raw = {};
for (const f of FILES) {
  const p = join(SRC, f + ".json");
  if (!existsSync(p)) { console.error("CastAI library not found: " + p + " (set CASTAI_RESOURCES)"); process.exit(2); }
  raw[f] = readFileSync(p, "utf8");
}
const data = Object.fromEntries(FILES.map((f) => [f, JSON.parse(raw[f])]));
// What CastAI is missing and the Rig Card needs (an "add" in the overrides):
// added at the end of CastAI's list, marked, and listed for the CastAI lane.
const added = [];
for (const [key, o] of Object.entries(OVR)) {
  if (key === "_about" || !o.add) continue;
  const [file, id] = key.split("/");
  if (data[file].some((x) => x.id === id)) continue; // CastAI has it now: the add is spent
  data[file].push({ ...o.add, _added: true });
  added.push({ key, name: o.add.name || o.add.title, reason: o.reason, source: o.source });
}
const srcHash = createHash("sha256").update(FILES.map((f) => raw[f]).join("\n")).digest("hex").slice(0, 12);

// ---- what the import did, for the fixes doc ---------------------------------
const log = { applied: [], unused: [], rules: [], sections: [], items: [], videos: [], notHere: [] };
// Fish that are not in Washington (scripts/castai-library-voice.json, notHere):
// a guide bullet that names one is about a lake down south.
const NOT_HERE = VOICE.notHere ? new RegExp("\\b(" + VOICE.notHere.words.map((w) => w.replace(/ /g, "\\s+")).join("|") + ")\\b", "i") : null;

// ---- corrections ---------------------------------------------------------------
const usedOverrides = new Set();
// One entry can: set fields (CastAI's own names), replace words in every text
// of the entry ("replace": [[from, to]]), drop it ("drop": true), fold a
// duplicate card into another ("mergeInto": id), and fix a guide section's
// items or a tackle section's types by CastAI's name ("items"/"types":
// { name: { set, cut, replace, drop } }). A cut or a replace that finds
// nothing stops the import, so an override can never go quietly stale.
function deepReplace(v, pairs, hits) {
  if (typeof v === "string") return pairs.reduce((t, [a, b], i) => { if (t.includes(a)) { hits[i] = true; return t.split(a).join(b); } return t; }, v);
  if (Array.isArray(v)) return v.map((x) => deepReplace(x, pairs, hits));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "id" ? x : deepReplace(x, pairs, hits)]));
  return v;
}
function replaced(key, obj, pairs, why) {
  if (!pairs || !pairs.length) return obj;
  const hits = [], out = deepReplace(obj, pairs, hits);
  pairs.forEach(([a, b], i) => {
    if (!hits[i]) throw new Error("override " + key + ": nothing to replace for \"" + a + "\"");
    log.applied.push({ key, field: b ? "words" : "cut", was: a, now: b || "(cut)", reason: why.reason, source: why.source });
  });
  return out;
}
function corrected(file, obj) {
  const key = file + "/" + obj.id;
  const o = OVR[key];
  if (!o) return obj;
  usedOverrides.add(key);
  if (o.add) return obj;
  if (o.drop) { log.applied.push({ key, field: "(whole section)", was: obj.title || obj.name, now: "(dropped)", reason: o.reason, source: o.source }); return null; }
  if (o.mergeInto) { log.applied.push({ key, field: "(whole card)", was: obj.name, now: "(folded into " + o.mergeInto + ")", reason: o.reason, source: o.source }); return null; }
  let out = replaced(key, { ...obj }, o.replace, o);
  for (const [k, v] of Object.entries(o.set || {})) {
    log.applied.push({ key, field: k, was: obj[k], now: v, reason: o.reason, source: o.source });
    out[k] = v;
  }
  return out;
}
const nmKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function fixItems(key, list) {
  const o = OVR[key], fixes = o && (o.items || o.types);
  if (!fixes) return list;
  const seen = new Set(), out = [];
  for (const it0 of list) {
    const n = Object.keys(fixes).find((k) => nmKey(k) === nmKey(it0.name));
    if (!n) { out.push(it0); continue; }
    seen.add(n);
    const f = fixes[n], where = key + " › " + it0.name, why = { reason: f.reason || o.reason, source: f.source || o.source };
    if (f.drop) { log.applied.push({ key: where, field: "(whole item)", was: it0.name, now: "(dropped)", ...why }); continue; }
    let it = { ...it0 };
    for (const c of f.cut || []) {
      const fields = ["description", "proTip", "technique"].filter((k) => typeof it[k] === "string" && it[k].includes(c));
      const inDetails = (it.details || []).some((d) => d.includes(c));
      if (!fields.length && !inDetails) throw new Error("override " + where + ": nothing to cut for \"" + c + "\"");
      for (const k of fields) it[k] = it[k].split(c).join("").replace(/\s{2,}/g, " ").replace(/\s+([.,])/g, "$1").trim() || null;
      if (inDetails) it.details = it.details.map((d) => d.split(c).join("").trim()).filter((d) => /[A-Za-z0-9]/.test(d));
      log.applied.push({ key: where, field: "cut", was: c, now: "(cut)", ...why });
    }
    it = replaced(where, it, f.replace, why);
    for (const [k, v] of Object.entries(f.set || {})) {
      log.applied.push({ key: where, field: k, was: it0[k], now: v, ...why });
      it[k] = v;
    }
    out.push(it);
  }
  for (const k of Object.keys(fixes)) if (!seen.has(k)) throw new Error("override " + key + " names an item CastAI does not have: " + k);
  return out;
}

// ---- the voice ----------------------------------------------------------------
// Rig Card's voice: plain, short, no hype. Facts are left alone.
const HYPE = [
  [/\bseriously\b[,.]?\s*/gi, ""], [/\bbasically\s+/gi, ""], [/\bliterally\s+/gi, ""], [/,?\s*\bliterally\b/gi, ""], [/\babsolutely\s+/gi, ""],
  [/\btotally\s+/gi, ""], [/\band boom\b,?\s*/gi, ""], [/\bboom\b,?\s*/gi, ""], [/\byou name it\b/gi, ""],
  [/\btrust me,?\s*(on this( one)?)?,?\s*/gi, ""], [/\(ouch\)/gi, ""], [/\(don'?t do this\)/gi, ""],
  [/\(seems obvious but happens a lot\)/gi, ""], [/\(trust me[^)]*\)/gi, ""], [/\(it'?s confusing\)/gi, ""],
  [/\blike butter\b/gi, "smoothly"], [/,? which is clutch\b/gi, ""], [/\bclutch\b/gi, "handy"],
  [/\bthe GOAT of\b/g, "the standard in"], [/\bGOAT\b/g, "best"], [/\bThe OG\b/g, "The original"], [/\bOG\b/g, "original"],
  [/\bsuper(?=\s+[a-z])/gi, (m) => (m[0] === "S" ? "Very" : "very")],
  [/\bcrazy(?=\s+(strong|easy|accurate|good|fast))/gi, (m) => (m[0] === "C" ? "Very" : "very")],
  [/\blike crazy\b/gi, "hard"], [/\binsanely\b/gi, "very"], [/\binsane\b/gi, "huge"],
  [/\bdon'?t yeet it back\b/gi, "do not throw it"], [/\byeet\b/gi, "throw"], [/\bgnarly\b/gi, "rough"],
  [/\bgo-to\b/gi, "first choice"], [/\bfor a sec\b/gi, "for a moment"],
  // the hype words of CastAI's guides, said plainly; literal danger stays
  // ("deadly conditions", "a fall can turn deadly")
  [/\bactually\s+/gi, ""], [/\b(an? )?(absolute )?game[- ]changers?\b/gi, "a big help"],
  [/\b(is|are) prime time\b/gi, "$1 the best time"], [/\bprime time\b/gi, "best time"], [/\bprime real estate\b/gi, "good water"], [/\bprime\b/gi, "good"],
  [/\bbut crushes it\b/gi, "but works"], [/\bcrush panfish\b/gi, "catch panfish"],
  [/\b(crush|smash)(es|ed|ing)?\b/gi, (m, a, e) => (m[0] === m[0].toUpperCase() ? "H" : "h") + "it" + (e === "es" ? "s" : e === "ing" ? "ting" : "")],
  [/\b(?<!turn )deadly\b(?! (conditions|fast))/gi, "very good"],
  [/\bis chaos in the best way\b/gi, "is busy"], [/\bcan be chaos\b/gi, "can be crowded"], [/\bit'?s chaos and excitement\b/gi, "everyone scrambles"],
  [/\binto the chaos\b/gi, "into the feeding fish"], [/\bsurface chaos\b/gi, "surface feeding"], [/\bcause chaos on the surface\b/gi, "splash on the surface"],
  [/\s*for (absolute )?chaos\b/gi, ""], [/\bthe absolute\b/gi, "the"], [/\babsolute\s+/gi, ""], [/\bchaos\b/gi, "a frenzy"],
  [/\b(is|are) legendary for\b/gi, "$1 known for"], [/\b(is|are) legendary\b/gi, "$1 well known"], [/\blegendary\b/gi, "well known"],
  [/\bamazing\b/gi, "very good"], [/\bis killer at\b/gi, "works well at"], [/\bkiller\b/gi, "good"],
  [/\ba monster\b/gi, "a big fish"], [/\bmonsters\b/gi, "big fish"], [/\bmonster\b/gi, "big"], [/\bawesome\b/gi, "good"],
  [/\bwinter catfish heaven\b/gi, "a winter catfish spot"], [/\s*heaven\b/gi, ""], [/\bincredibly\b/gi, "very"], [/\bincredible\b/gi, "very good"],
  [/\blike a hawk\b/gi, "closely"], [/\blike a missile\b/gi, "fast"], [/\blike a vise\b/gi, "tight"],
  [/\b(\d+) is the magic number\b/gi, "$1 is the number"], [/\bit'?s magic\b/gi, "it works"], [/\bpure magic\b/gi, "the best time"],
  [/\bwhere the magic happens\b/gi, "where the bites come"], [/\bwhen the magic starts\b/gi, "when the fishing turns on"],
  [/,?\s*looking like a total pro\b/gi, ""], [/,?\s*cold wet awesome fishing\b/gi, ""], [/\bchrome-plated fighting machines\b/gi, "bright, strong fish"],
  [/\bThe king of the Pacific\./g, "The biggest Pacific salmon."], [/\bThe long rod king of big rivers\./g, "The long rod for big rivers."],
  [/\bThe king of braid-to-leader connections\./g, "The slimmest braid to leader knot."], [/\bNinja-level stealth casts\b/g, "Quiet casts"],
  [/\bThe fly casting turbo boost\./g, "More line speed, for distance."], [/\bpiss (them|it) off\b/gi, "make $1 strike"], [/\bridiculous\b/gi, "very good"],
  [/\bis bucket-list fishing\b/gi, "draws anglers from all over"], [/\b(have|has|is) a blast\b/gi, (m, v) => v + (v === "is" ? " fun" : " fun")],
  [/\bPhD-level picky\b/gi, "very picky"], [/\ba bucket-list\b/gi, "a trophy"], [/\bbeast\b/gi, "fish"], [/\bThe king of (\w+)\./g, "The biggest $1."], [/\bthe scenery is unreal\b/gi, "the scenery is grand"], [/\bexplode on\b/gi, "hit"]
];
const ACRONYMS = new Set(["WDFW", "NOAA", "PNW", "GPS", "PFD", "PFDs", "USCG", "LED", "UV", "ASA", "IGFA", "DNR", "EVA", "PVC", "USA", "FTWQ",
  "ORVIS", "MLF", "BASS", "AFTCO", "YETI", "RIO", "SST", "UPF", "SPF", "DIY", "CPR", "GOAT", "VHF", "USGS", "BWO", "BWOs", "HMG", "DOA", "PDF", "TV",
  "BB", "II", "PB", "US", "AM", "PM"]);
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";
const CLAUSE = /^(it|it's|this|that|they|they're|you|you're|you'll|we|there|stay|follow|keep|use|let|don't|do|try|watch|be|just|make|hold|pull|check|get|leave|bring|wait|stop|start|aim|look|go|set|fish|cast)\b/i;
// Joins a dash's two sides: a short tail is a clause (comma), a long one a sentence.
function undash(s) {
  let t = s.replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2");
  for (let guard = 0; guard < 50; guard++) {
    const m = t.match(/\s*(?:\u2014|\u2013|--)\s*/);
    if (!m) break;
    const i = m.index, rest = t.slice(i + m[0].length);
    const end = rest.search(/[.!?)]|$/), tail = rest.slice(0, end).trim();
    const words = tail ? tail.split(/\s+/).length : 0;
    const before = t.slice(0, i);
    if (!tail || /[:(]\s*$/.test(before)) { t = before + (tail ? " " : "") + rest; continue; }
    // a short tail is a clause, unless it is a sentence of its own ("it
    // helps", "stay safe", "follow through"): then a comma would splice
    const own = words >= 2 && CLAUSE.test(tail) && !/\([^)]*$/.test(before);
    if (!own && (words <= 5 || /^[$\d(]/.test(tail) || /\($/.test(before) || /\([^)]*$/.test(before))) t = before + ", " + rest;
    else t = before.replace(/[,;:]$/, "") + ". " + rest.charAt(0).toUpperCase() + rest.slice(1);
  }
  return t;
}
function voice(s) {
  if (s == null) return s;
  let t = String(s).replace(/\u00a0/g, " ");
  t = undash(t);
  for (const [re, to] of HYPE) t = t.replace(re, to);
  t = t.replace(/!+/g, ".").replace(/\?\./g, "?");
  // A range reads "2 to 4", never "2-4" (it reads as a dash, and a narrow
  // screen breaks the line at the hyphen).
  t = t.replace(/(\d(?:\s?[ap]m)?)\s*-\s*(?=\d)/gi, "$1 to ")
    .replace(new RegExp("\\b(" + MONTHS + ")\\s*-\\s*(?=(" + MONTHS + ")\\b)", "g"), "$1 to ");
  // SHOUTED words are said plainly; real acronyms stay.
  t = t.replace(/\b[A-Z]{2,}['\u2019][A-Z]+\b/g, (w) => w.toLowerCase()).replace(/\b(DO|IS|GO)\b/g, (w) => w.toLowerCase());
  t = t.replace(/\b[A-Z]{3,}\b/g, (w) => (ACRONYMS.has(w) ? w : w.toLowerCase()));
  t = t.replace(/\(\s*\)/g, "").replace(/\.\s*\.(?!\.)/g, ".").replace(/\s+([,.;:?])/g, "$1").replace(/,\s*,/g, ",").replace(/,\./g, ".")
    .replace(/\s{2,}/g, " ").trim().replace(/,$/, ".");
  // a sentence never starts small after we cut its first word
  t = t.replace(/(^|[.?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  return t;
}
const strip = (s) => voice(String(s).replace(/^Step \d+:\s*/i, ""));

// Headings in sentence case. Names of places, fish runs and knots keep capitals.
const PROPER = ["Washington", "WA", "PNW", "WDFW", "Puget Sound", "Columbia River", "Columbia", "Olympic Peninsula", "Olympic",
  "Cascade", "Skykomish", "Snoqualmie", "Snohomish", "Green River", "Green", "Cowlitz", "Yakima", "Wenatchee", "Methow",
  "Westport", "Ilwaco", "Neah Bay", "Buoy 10", "Lake Washington", "Rocky Ford Creek", "Pass Lake", "Fidalgo Island", "Carbon River",
  "Bonney Lake", "Hood Canal", "Google Earth", "GPS", "Chinook", "Blackmouth", "Euro", "Adams", "Texas", "Carolina", "Ned",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
  "Jan", "Feb", "Mar", "Apr", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "I", "TV", "PFD", "FG", "Bimini", "Palomar", "Rapala",
  "Albright", "Alberto", "Bristol", "Trilene", "San Diego", "Berkley", "Davy", "Spey", "Woolly Bugger", "Clouser", "Senko"];
function sentenceCase(s) {
  // a dash in a heading is a colon ("Bank fishing vs boat: what you can do")
  const t = voice(String(s).replace(/\s*[\u2013\u2014]\s*/g, ": ")).replace(/\s*&\s*/g, " and ");
  const keep = [];
  let marked = t;
  PROPER.slice().sort((a, b) => b.length - a.length).forEach((p) => {
    marked = marked.replace(new RegExp("\\b" + p.replace(/ /g, "\\s+") + "\\b", "g"), (m) => { keep.push(m); return "\u0000" + (keep.length - 1) + "\u0001"; });
  });
  let first = !/^[^A-Za-z\u0000]/.test(marked);
  marked = marked.replace(/[A-Za-z][A-Za-z']*|\u0000\d+\u0001/g, (w) => {
    if (w.charAt(0) === "\u0000") { first = false; return w; }
    const out = first ? w.charAt(0).toUpperCase() + w.slice(1) : /^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase();
    first = false;
    return out;
  });
  return marked.replace(/\u0000(\d+)\u0001/g, (m, i) => keep[+i]).replace(/\bVs\b/g, "vs");
}

// ---- rules are never imported as fact -----------------------------------------
const RULE = [
  /\b(daily|bag|possession|creel) limits?\b/i, /\blimits?\b(?! (your|the amount|how|of the rod))/i, /\b(legal|keeper|minimum|maximum) size\b/i,
  /\bsize limits?\b/i, /\bslot\b/i, /\bundersized?\b/i,
  /\b(season|fishery|fisheries)\b[^.]{0,60}\b(open|opens|opened|opener|close|closes|closed|closing|closure|dates?|usually|typically|short)\b/i,
  /\b(opener|closures?)\b/i, /\bif (it'?s |it is )?open\b/i, /\b(is|are|was|be) (open|closed)\b/i, /\bcan close\b/i, /\bcloses\b/i,
  /\bclose(d)? early\b/i, /\bemergency (rules?|closures?|regulations?)\b/i, /\bregulat(ion|ions|ed)\b/i, /\bregs\b/i, /\bpamphlet\b/i,
  /\b(il)?legal(ly)?\b/i, /\bunlawful\b/i, /\bwardens?\b/i, /\b(hefty|massive|big|steep|huge|\$\d+\+?) fines?\b/i, /\bfines (are|can)\b/i, /\bfined\b/i,
  /\b(get|got|getting|write|wrote|issue)s? (you )?(a )?ticket/i, /\blicen[cs]e[sd]?\b/i, /\bcatch (record )?card\b/i, /\bpunch card\b/i, /\bendorsement\b/i,
  /\bselective (gear|fishery|fisheries)\b/i, /\bbarbless\b[^.]*\b(required|only|rule|rules|must)\b/i,
  /\b(must|required to) (be )?(released?|use|have|punch|record|carry|check|stop)\b/i, /\bno[- ]bait\b/i, /\badipose\b/i,
  /\b(wild|unclipped|unmarked) (fish|salmon|steelhead|coho|chinook|kings?)\b[^.]*\b(release|released|keep|kept)\b/i,
  /\bhatchery (fish )?(can|may) be kept\b/i, /\bcatch[- ]and[- ]release (only|in most|rules?|waters?)\b/i, /\bcan keep\b/i,
  /\ballowed to keep\b/i, /\btreaty\b/i, /\bWDFW\b/, /\bFish Washington app\b/i, /\bprohibited\b/i
];
// Never cut: true everywhere and about staying alive or not harming animals.
const KEEP = /\b(life jackets?|PFDs?|marine mammals?|sea lions?|seals?)\b/i;
const isRule = (s) => !KEEP.test(s) && RULE.some((re) => re.test(s));
// Split after . ! or ? (and any closing quote or bracket) when a new sentence
// starts. Nothing is ever lost: the pieces join back to the whole.
const sentences = (s) => String(s || "").split(/(?<=[.!?]['"\u2019\u201d)]?)\s+(?=[A-Z0-9"'\u201c(])/).map((x) => x.trim()).filter(Boolean);
// Cuts every rule sentence from one text; logs each cut with where it was.
function unrule(where, s) {
  if (s == null) return { text: s, cut: 0, all: 0 };
  const all = sentences(s);
  const kept = [];
  for (const x of all) {
    if (!isRule(x)) { kept.push(x); continue; }
    // A list ("Must-have: rod, reel, license, net") loses only its rule parts.
    const m = x.match(/^([^:]{2,40}:\s*)?(.*?)([.]?)$/), parts = m[2].split(/,\s+(?![^()]*\))/);
    const good = parts.filter((p) => !isRule(p) && !/\b(barbless|fly only|artificial only)\b/i.test(p));
    if (parts.length >= 3 && good.length >= 2 && !isRule((m[1] || "") + good.join(", "))) {
      parts.filter((p) => isRule(p)).forEach((p) => log.rules.push({ where, text: p }));
      kept.push((m[1] || "") + good.join(", ") + m[3]);
    } else log.rules.push({ where, text: x });
  }
  return { text: kept.join(" "), cut: all.length - kept.length, all: all.length };
}
const RULES_SECTION = /regulation|rules|licen[cs]e/i;

// ---- videos --------------------------------------------------------------------
const FIX = existsSync(VIDS) ? JSON.parse(readFileSync(VIDS, "utf8")) : { videos: {} };
// What a video's title must name for it to count: the card's own subject.
const norm = (s) => String(s).toLowerCase().replace(/[\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function video(id, subject, where) {
  if (!id) return null;
  const v = FIX.videos[id];
  if (!v) { log.videos.push({ where, id, why: "not checked (run --check-videos)" }); return null; }
  if (!subject.test(norm(v.title))) { log.videos.push({ where, id, why: "title does not name the subject: " + v.title }); return null; }
  // the channel, without the slogan some channels carry ("Bassresource - The Ultimate ...")
  return { id, title: voice(v.title), by: voice(v.by).split(/\s[-|]\s/)[0] };
}
const wanted = []; // every video the import would ship, for --check-videos

function subjectFor(name, extra) {
  const words = norm(name).replace(/\b(knot|cast|casting|the)\b/g, " ").replace(/\s+/g, " ").trim();
  const alts = [words].concat(extra || []).map((w) => w.replace(/\s+/g, "\\s?").replace(/(\w)s\b/g, "$1s?"));
  return new RegExp("\\b(" + alts.join("|") + ")");
}
const SUBJECT = {
  "figure-eight-loop": ["figure (of )?(eight|8) loop"], "anchor-hitch": ["anchor (hitch|bend)"], "figure-eight-knot": ["figure (of )?(eight|8)", "stopper"],
  "surgeons-loop": ["surgeon s? loop", "surgeons? loop"], "surgeons-knot": ["surgeon s? knot", "surgeons? knot"],
  "rapala-loop": ["rapala loop"], "non-slip-loop": ["non slip loop"], "bobber-stop-knot": ["bobber stop"],
  "overhead-cast": ["overhead", "cast a spinning reel"], "pendulum-cast": ["pendulum", "underhand"],
  "sidearm-cast": ["sidearm", "side arm"], "pitch-flip": ["flip", "pitch"], "pitching": ["pitch"], "flipping": ["flip"],
  "skip-cast": ["skip"], "two-handed-spey-cast": ["spey"], "kayak-cast": ["kayak"], "egg-loop-knot": ["egg loop"],
  "circle-hook-snell": ["snell"], "berkley-braid-knot": ["berkley braid"], "san-diego-jam": ["san diego jam"],
  "basic-dehook": ["unhook"], "deep-hook-removal": ["gut hooked", "deep"], "treble-hook-removal": ["treble"],
  "gut-hooked-fish": ["swallowed", "gut"], "catch-and-release": ["catch and release"], "fish-handling-safety": ["hold"]
};

// ---- the same thing said twice ------------------------------------------------------
// A card's red "where it fails" box is the Rig Card's own line. When CastAI's
// tip (or one of a cast's mistakes) says the same thing, it goes: a card
// says a thing once. "Same": half the shorter line's words are in the other.
// A knot's tip is held to a third: a tip that puts the red box in other words
// (the uni's braid wraps, the Davy's Palomar, the Alberto's side by side
// wraps) is still the red box said again.
const STOPW = new Set("the and you your for with that this then than from not are its into out off but can will just one two all any get got has have".split(" "));
const stem = (w) => w.replace(/(ing|ed|es|s)$/, "");
const words = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOPW.has(w)).map(stem));
function sameAs(a, b, share = 0.5) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return false;
  let n = 0;
  A.forEach((w) => { if (B.has(w)) n++; });
  return n / Math.min(A.size, B.size) >= share;
}
const said = []; // what the import dropped as said twice, for --said

// ---- duplicate cards ----------------------------------------------------------------
// A card CastAI has twice under two names (the Rapala loop is the Rapala knot)
// is one card here; the other name finds it.
const merged = {};
for (const [key, o] of Object.entries(OVR)) {
  if (key === "_about" || !o.mergeInto) continue;
  const [file, id] = key.split("/"), v = (file === "FishingKnots" ? VOICE.knots : VOICE.casts)[id], c = data[file].find((x) => x.id === id);
  if (!c) continue;
  (merged[o.mergeInto] = merged[o.mergeInto] || []).push(...[c.name].concat(v ? [v.name].concat(v.aka) : []));
}

// ---- knots -----------------------------------------------------------------------
const knots = data.FishingKnots.map((k0) => {
  const k = corrected("FishingKnots", k0);
  if (!k) return null;
  const v = VOICE.knots[k.id];
  if (!v) throw new Error("no voice line for knot " + k.id);
  const subj = subjectFor(v.name, SUBJECT[k.id]);
  if (k.youtubeVideoId) wanted.push({ id: k.youtubeVideoId, subject: subj.source, where: "knot " + k.id });
  const r = (f) => unrule("FishingKnots › " + k.id + " › " + f, voice(k[f])).text;
  let tip = r("tips");
  if (tip && sameAs(tip, v.fails, 1 / 3)) { said.push("knot " + k.id + " tip: " + tip); tip = ""; }
  return {
    id: k.id, name: v.name, castai: k.name, joins: v.joins, level: k.difficulty, line: v.line,
    about: r("description"), best: v.best || r("bestFor"), steps: k.steps.map(strip), fails: v.fails, tip,
    video: video(k.youtubeVideoId, subj, "knot " + k.id),
    hand: { "improved-clinch": "knot-improved-clinch", "non-slip-loop": "knot-non-slip-loop", "egg-loop-knot": "salmon-egg-loop" }[k.id] || null,
    added: !!k._added,
    aka: [...new Set([v.name, k.name].concat(v.aka, merged[k.id] || []).map((x) => x.toLowerCase()))]
  };
}).filter(Boolean);
const groupOrder = VOICE.knotGroups.map((g) => g.id);
knots.sort((a, b) => {
  const fa = VOICE.firstKnots.indexOf(a.id), fb = VOICE.firstKnots.indexOf(b.id);
  return groupOrder.indexOf(a.joins) - groupOrder.indexOf(b.joins) || (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb) || a.level - b.level || 0;
});

// ---- casts -------------------------------------------------------------------------
const casts = VOICE.castOrder.map((id) => {
  const c0 = data.CastingTechniques.find((x) => x.id === id);
  if (!c0) throw new Error("CastAI has no cast " + id);
  const c = corrected("CastingTechniques", c0), v = VOICE.casts[id];
  if (!c) throw new Error("castOrder lists " + id + ", which is folded into another card");
  const subj = subjectFor(v.name, SUBJECT[id]);
  if (c.youtubeVideoId) wanted.push({ id: c.youtubeVideoId, subject: subj.source, where: "cast " + id });
  const where = "CastingTechniques › " + id;
  const mistakes = c.commonMistakes.map((m) => voice(m.replace(/\s*=\s*/g, ": "))).map((m) => /[.?]$/.test(m) ? m : m + ".")
    .filter((m) => { if (sameAs(m, v.fails)) { said.push("cast " + id + " mistake: " + m); return false; } return true; });
  const vid = video(c.youtubeVideoId, subj, "cast " + id);
  if (vid && v.videoNote) vid.note = v.videoNote;
  return {
    id, name: v.name, castai: c.name, group: v.group, level: c.difficulty, line: v.line,
    about: unrule(where + " › description", voice(c.description)).text, best: v.best || unrule(where + " › bestFor", voice(c.bestFor)).text,
    steps: c.steps.map(strip), fails: v.fails, mistakes, video: vid,
    aka: [...new Set([v.name, c.name].concat(v.aka, merged[id] || []).map((x) => x.toLowerCase()))]
  };
});
const castsHere = data.CastingTechniques.filter((x) => !(OVR["CastingTechniques/" + x.id] || {}).mergeInto).length;
if (casts.length !== castsHere) throw new Error("castOrder misses a cast");

// ---- guides ----------------------------------------------------------------------------
// One shape for every guide: sections, each with a line and items (name, text,
// points, tip). Dehooking sections also carry steps, what to watch for and tools.
function item(file, sec, it) {
  const where = file + " › " + sec + " › " + it.name;
  const d = unrule(where, voice(it.description));
  // In the salmon guide's fish list "Season:" is when the run comes in, not a
  // fishing season, so it says so.
  const here = (it.details || []).filter((x) => {
    if (!NOT_HERE || !VOICE.notHere.files.includes(file) || !NOT_HERE.test(x)) return true;
    log.notHere.push({ where, text: x });
    return false;
  });
  const pts = here.map((x) => unrule(where, voice(sec === "salmon-species" ? x.replace(/^Season:\s*/, "Runs: ") : x))).filter((x) => x.text);
  const cutPts = here.length - pts.length;
  const tip = unrule(where + " › tip", voice(it.proTip));
  // An item that is mostly rules is a rules item: it goes, and is listed.
  if (RULES_SECTION.test(it.name) || (d.all && d.cut / d.all >= 0.5) || (here.length && cutPts / here.length > 0.5 && d.cut)) {
    log.items.push({ where });
    return null;
  }
  // A part opens on its points, short lines. CastAI's paragraph waits behind
  // More. With no points, the first two sentences show and the rest waits.
  const all = sentences(d.text), points = pts.map((x) => x.text);
  const out = { name: sentenceCase(it.name), text: points.length ? "" : all.slice(0, 2).join(" "), points };
  const more = (points.length ? all : all.slice(2)).join(" ");
  if (more) out.more = more;
  if (tip.text) out.tip = tip.text;
  if (it.youtubeVideoId) { const v = video(it.youtubeVideoId, subjectFor(it.name), where); if (v) out.video = v; }
  out.ruled = !!(d.cut || cutPts || tip.cut);
  return out;
}
function section(file, s, items, extra) {
  const where = file + " › " + s.id;
  const title = sentenceCase(s.title || s.name);
  const kept = items.filter(Boolean);
  if (RULES_SECTION.test(s.id + " " + (s.title || s.name)) || (items.length && kept.length / items.length < 0.5)) {
    log.sections.push({ where, title: s.title || s.name });
    return { id: s.id, title: "Rules", line: "On your trip's card, checked", rules: true };
  }
  const line = (VOICE.sectionLines || {})[file + "/" + s.id];
  return { id: s.id, title, line: line != null ? line : voice(s.subtitle || s.description || ""), items: kept.map(({ ruled, ...x }) => x), ...extra };
}
function guideFrom(meta) {
  const file = meta.file;
  let sections;
  if (file === "DehookingGuide") {
    sections = data.DehookingGuide.map((s0) => {
      const s = corrected(file, s0), where = file + " › " + s.id;
      if (s.youtubeVideoId) wanted.push({ id: s.youtubeVideoId, subject: subjectFor(s.name, SUBJECT[s.id]).source, where });
      const v = video(s.youtubeVideoId, subjectFor(s.name, SUBJECT[s.id]), where);
      const sec = section(file, { id: s.id, title: s.name, subtitle: s.description }, [], {
        steps: s.steps.map((x) => unrule(where, voice(x)).text).filter(Boolean),
        points: s.safetyTips.map((x) => unrule(where, voice(x)).text).filter(Boolean).map((x) => /[.?]$/.test(x) ? x : x + "."),
        tools: s.toolsNeeded.map(voice)
      });
      if (v) sec.video = v;
      return sec;
    });
  } else if (file === "TackleGuide") {
    sections = data.TackleGuide.map((s0) => {
      const s = corrected(file, s0);
      if (!s) return null;
      const where = file + " › " + s.id;
      const items = fixItems(file + "/" + s.id, s.types).map((t) => item(file, s.id, {
        name: t.name, description: t.description, youtubeVideoId: t.youtubeVideoId,
        details: [t.bestFor && t.bestFor.length ? "Best for: " + t.bestFor.join(", ") : null, t.technique ? "How: " + t.technique : null].filter(Boolean)
      }));
      const sec = section(file, { id: s.id, title: s.name, subtitle: s.description }, items);
      const tip = unrule(where + " › tip", voice(s.tips)).text;
      if (tip && !sec.rules) sec.tip = tip;
      return sec;
    }).filter(Boolean);
  } else {
    sections = data[file].map((s0) => {
      const s = corrected(file, s0);
      return s ? section(file, s, fixItems(file + "/" + s.id, s.items).map((it) => item(file, s.id, it))) : null;
    }).filter(Boolean);
  }
  return { id: meta.id, title: meta.title, line: meta.line, view: meta.view || "", from: file, sections };
}
const guides = VOICE.guides.map(guideFrom);
const gear = VOICE.gear.map(guideFrom);

// ---- fish ----------------------------------------------------------------------------------
const species = {};
for (const s0 of data.FishSpecies) {
  const s = corrected("FishSpecies", s0), where = "FishSpecies › " + s.id;
  const t = (f) => (s[f] == null ? null : unrule(where + " › " + f, voice(s[f])).text || null);
  species[s.id] = {
    name: s.name, latin: s.scientificName, family: s.family, water: s.waterType, text: t("description"), habitat: t("habitat"),
    lures: (s.bestLures || []).map(voice), fact: t("funFact"), weight: s.averageWeight ? voice(s.averageWeight) : null,
    states: s.states || [], wa: (s.states || []).includes("WA")
  };
}
const fish = {};
for (const [rig, m] of Object.entries(VOICE.fish)) {
  const s = species[m.from];
  if (!s) throw new Error("no CastAI fish " + m.from);
  const f = { from: m.from };
  for (const k of m.show) {
    let v = k === "text" && m.text ? m.text : s[k];
    if (k === "lures") v = (v || []).filter((x) => !(m.dropLures || []).includes(x));
    if (typeof v === "string") for (const c of m.cut || []) v = v.split(c).join("");
    if (v && (!Array.isArray(v) || v.length)) f[k] = v;
  }
  fish[rig] = f;
}

for (const k of Object.keys(OVR)) if (k !== "_about" && !usedOverrides.has(k) && !(OVR[k].add && !added.some((a) => a.key === k))) log.unused.push(k);

// ---- write ----------------------------------------------------------------------------------
const lib = {
  source: "CastAI " + srcHash, firstKnots: VOICE.firstKnots, firstKnotsLine: VOICE.firstKnotsLine,
  knotGroups: VOICE.knotGroups, knots, castGroups: VOICE.castGroups, casts, guides, gear, fish, species
};
function lines(v) {
  // one item per line, so a diff of the generated file reads
  return "{\n" + Object.entries(v).map(([k, x]) => "  " + JSON.stringify(k) + ": " + (Array.isArray(x) && x.length && typeof x[0] === "object"
    ? "[\n" + x.map((y) => "    " + JSON.stringify(y)).join(",\n") + "\n  ]"
    : x && typeof x === "object" && !Array.isArray(x) && k === "species"
      ? "{\n" + Object.entries(x).map(([a, b]) => "    " + JSON.stringify(a) + ": " + JSON.stringify(b)).join(",\n") + "\n  }"
      : JSON.stringify(x))).join(",\n") + "\n}";
}
const js = "// GENERATED by scripts/import-castai-library.mjs from CastAI's library. Do not edit by hand:\n" +
  "// fix CastAI, or add a correction to scripts/castai-library-overrides.json, and rerun the import.\n" +
  "// Loaded after the first screen (rigs/index.html), cached by rigs/sw.js.\n" +
  "(function (root) {\n  \"use strict\";\n  var RIG = (root.RIG = root.RIG || {});\n  RIG.library = " +
  lines(lib).replace(/\n/g, "\n  ") + ";\n})(typeof window !== \"undefined\" ? window : globalThis);\n";

// CastAI's own words are quoted as they are, except a dash, which is named
// ([dash]) so this page has none and the spot is still easy to find.
const esc = (s) => String(s == null ? "(none)" : Array.isArray(s) ? s.join(" / ") : s).replace(/\|/g, "\\|").replace(/\n/g, " ").replace(/\s*[\u2013\u2014]\s*/g, " [dash] ");
const doc = [
  "# CastAI library: what the Rig Card corrects",
  "",
  "Generated by `scripts/import-castai-library.mjs` (CastAI " + srcHash + "). Do not edit by hand.",
  "",
  "Each line is something the Rig Card changes when it takes CastAI's library. Fix it in CastAI, then delete the entry from `scripts/castai-library-overrides.json` and rerun the import. Voice changes (no dashes, no hype, short names and lines) are the Rig Card's and are not listed.",
  "",
  "## Corrections (" + log.applied.length + ")",
  "",
  "| CastAI file / id | Field | Was | Now | Why | Source |",
  "|---|---|---|---|---|---|",
  ...log.applied.map((a) => "| " + [a.key, a.field, a.was, a.now, a.reason, a.source].map(esc).join(" | ") + " |"),
  "",
  "## What CastAI is missing (" + added.length + ")",
  "",
  "The Rig Card names these, so it carries them. Add them to CastAI (the whole entry is in the overrides file, in CastAI's format), then delete the override.",
  "",
  ...(added.length ? added.map((a) => "- " + a.key + " (" + a.name + "): " + a.reason + " Source: " + a.source) : ["None."]),
  "",
  "## Rules taken out (" + (log.sections.length + log.items.length + log.rules.length) + ")",
  "",
  "Rules are never imported as fact. The Rig Card's rules are checked per spot and per trip (the Rules row on each run card, `rigs/runs.js`, and WDFW's emergency rules, `rigs/rules.js`). CastAI should do the same: link to the checked rules instead of stating them.",
  "",
  "### Whole sections, replaced by a link to the checked rules",
  "",
  ...log.sections.map((s) => "- " + s.where + " (" + s.title + ")"),
  "",
  "### Items dropped (mostly rules)",
  "",
  ...log.items.map((s) => "- " + s.where),
  "",
  "### Sentences cut",
  "",
  ...log.rules.map((r) => "- " + r.where + ": \"" + r.text.replace(/"/g, "'") + "\""),
  "",
  "## Not in Washington (" + log.notHere.length + ")",
  "",
  ...(VOICE.notHere ? [VOICE.notHere.why, ""] : []),
  ...(log.notHere.length ? log.notHere.map((r) => "- " + esc(r.where) + ": \"" + esc(r.text).replace(/"/g, "'") + "\"") : ["None."]),
  "",
  "## Videos not shipped (" + log.videos.length + ")",
  "",
  ...(log.videos.length ? log.videos.map((v) => "- " + v.where + ": " + v.id + ", " + v.why) : ["None."]),
  "",
  ...(log.unused.length ? ["## Overrides CastAI no longer needs", "", ...log.unused.map((k) => "- " + k + " (the id is gone from CastAI)"), ""] : [])
].join("\n");

if (args.has("--said")) { console.log(said.join("\n")); process.exit(0); }
if (args.has("--check-videos")) {
  const all = new Map();
  for (const w of wanted) all.set(w.id, w);
  // the guides' own videos (dehooking) were pushed above; species and tackle have none today
  const out = { checked: new Date().toISOString().slice(0, 10), how: "YouTube oEmbed answered 200 and the title names the card's subject", videos: {} };
  for (const [id, w] of [...all.entries()].sort()) {
    const r = await fetch("https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=" + id + "&format=json");
    if (!r.ok) { console.log("DEAD   " + id + " " + w.where + " (" + r.status + ")"); continue; }
    const j = await r.json();
    const hit = new RegExp(w.subject).test(norm(j.title));
    console.log((hit ? "ok     " : "WRONG  ") + id + " " + w.where + ": " + j.title);
    if (hit) out.videos[id] = { title: j.title, by: j.author_name, for: w.where };
    await new Promise((res) => setTimeout(res, 200));
  }
  writeFileSync(VIDS, JSON.stringify(out, null, 2) + "\n");
  console.log("wrote " + VIDS + " (" + Object.keys(out.videos).length + " videos)");
  process.exit(0);
}

if (args.has("--check")) {
  const same = existsSync(OUT) && readFileSync(OUT, "utf8") === js && existsSync(DOC) && readFileSync(DOC, "utf8") === doc + "\n";
  console.log(same ? "rigs/library.js and the fixes doc match CastAI " + srcHash : "OUT OF DATE: rerun node scripts/import-castai-library.mjs");
  process.exit(same ? 0 : 1);
}
writeFileSync(OUT, js);
writeFileSync(DOC, doc + "\n");
const nSec = guides.reduce((n, g) => n + g.sections.length, 0) + gear.reduce((n, g) => n + g.sections.length, 0);
console.log("wrote " + OUT + ": " + knots.length + " knots, " + casts.length + " casts, " + guides.length + " guides and " + gear.length +
  " gear parts (" + nSec + " sections), " + Object.keys(species).length + " fish (" + Object.keys(fish).length + " on Fish tab pages), " +
  log.applied.length + " corrections, " + (log.sections.length + log.items.length + log.rules.length) + " rule cuts, " + log.videos.length + " videos held back");
