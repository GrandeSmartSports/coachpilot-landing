// Builds rigs/waters.js: CastAI's stocked waters near Bonney Lake, each with
// its catchable trout plants and its WDFW lake rule, read from the 2026-27
// pamphlet (eregulations.com Westside Lakes Special Rules).
//
// Run: node scripts/build-waters.mjs         (the daily rule review job runs it too)
//      node scripts/build-waters.mjs --dry   (print every water's verdict, write nothing)
//
// Sources:
//   castai-waters edge function (CastAI's verified WDFW stocking matches,
//   nightly from WDFW). Lakes are open all year unless a lake has its own
//   special rule (WDFW Statewide Freshwater Rules).
//
// The rule reader (lakeRule) is a pure function: page text and a water in, a
// verdict out. tests/rigs-waters.test.mjs pins it to real rows of the pamphlet.
// A verdict is "ok" only when the reader can tell that the lake is open and
// that a keep-your-fish bait trip is legal there. A lake whose entry it cannot
// read cleanly is "check": the app holds it back and names it under "Not
// listed yet". It never guesses the other way.
import { realpathSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FEED = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-waters?km=230";
const PAGES = ["westside-lakes-special-rules-a-e", "westside-lakes-special-rules-f-p", "westside-lakes-special-rules-q-z"];
const WEST = { KING: "KING", PIER: "PIERCE", THUR: "THURSTON", MASO: "MASON", KITS: "KITSAP", SNOH: "SNOHOMISH", LEWI: "LEWIS",
  GRAY: "GRAYS HARBOR", JEFF: "JEFFERSON", CLAL: "CLALLAM", SKAG: "SKAGIT", WHAT: "WHATCOM", ISLA: "ISLAND", PACI: "PACIFIC",
  COWL: "COWLITZ", WAHK: "WAHKIAKUM", CLAR: "CLARK", SKAM: "SKAMANIA", SANJ: "SAN JUAN" };
const WEST_NAMES = Object.values(WEST);
const CATCHABLE_FPP = 6; // 6 fish per pound or fewer = catchable size (about 8 in and up)
// Fewer lake headings than this on a page means the page did not load as the
// lake table (the three pages carry 64, 88 and 76). The build stops and the
// last good rigs/waters.js stays: a lake missing from a half-loaded page would
// otherwise read as having no special rule.
const MIN_LAKES_PER_PAGE = 50;

// ---- reading the pamphlet pages -------------------------------------------
// The pages are one table. A lake starts with a one-cell row, "NAME - COUNTY
// CO.". Under it: three-cell rows (species, dates, rule), two-cell rows (dates,
// rule: the species cell above spans down), and one-cell notes that name a
// place, or a part of the lake when rules differ along it.
const untag = (h) => String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;|&#39;|&apos;/g, "'").replace(/&quot;|&#34;/g, '"').replace(/&[a-z#0-9]+;/gi, " ")
  .replace(/\s+/g, " ").trim();
// A name boiled down to the words that tell lakes apart: "LK GENEVA (KING)",
// "GENEVA LAKE" and "Lake Geneva" are all GENEVA.
const NOISE = /\b(LK|LKS|LAKE|LAKES|POND|PONDS|PD|RESERVOIR|RES|AND OUTLET)\b/g;
const plain = (s) => String(s || "").toUpperCase().replace(/['’]/g, "").replace(/[^A-Z0-9]+/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
const core = (s) => plain(String(s || "").toUpperCase().replace(/\(.*?\)/g, " ").replace(/\bT\d+\b/g, " "));
const HEAD = /^([^a-z]+?)\s+-\s+([A-Z][A-Z/ .]*?)\s+CO\.?$/;
// Capitals with " - " in them, but not a heading the reader can split into a
// name and a county. Still a lake: it is kept, in any county, and held back.
const HEADISH = /^[^a-z]*[A-Z]{2}[^a-z]*\s-\s[^a-z]*$/;
const ANY_COUNTY = "*";
// Waters the pamphlet lists under another lake's heading, with nothing in the
// text to find them by. Lake Union is the stretch of the Lake Washington Ship
// Canal between the Fremont and Montlake bridges.
const LISTED_AS = { UNION: "WASHINGTON SHIP CANAL" };

// Every lake on the pages. pages: one page's html, or a list of them.
//   { name, core, counties: [..], clean, sections: [{ note, rows: [{ species, season, rule }] }] }
// More than one section with rows means the rules differ by part of the lake.
export function lakeEntries(pages) {
  const out = [];
  for (const page of [].concat(pages == null ? [] : pages)) {
    let cur = null, species = "";
    for (const tr of String(page).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => untag(c[1]));
      const head = cells.map((c) => HEAD.exec(c)).find(Boolean), loose = head ? null : cells.find((c) => HEADISH.test(c));
      if (head || loose) {
        // A heading is one cell, "NAME - COUNTY CO.". Any other shape of it
        // is still that lake, but not a clean read: the lake is held back
        // instead of dropping out of the list as if it had no rule.
        const name = head ? head[1].trim() : loose.slice(0, loose.lastIndexOf(" - ")).trim() || loose;
        cur = { name, core: core(name), counties: head ? head[2].split("/").map((x) => x.trim()).filter(Boolean) : [ANY_COUNTY],
          clean: !!head && cells.length === 1, sections: [{ note: "", rows: [] }] };
        out.push(cur); species = "";
        continue;
      }
      if (!cur || !cells.length) continue; // rows above the first lake: the rule-change table, the column heads
      const part = cur.sections[cur.sections.length - 1];
      if (cells.length === 1) {
        if (!cells[0]) continue;
        if (part.rows.length) cur.sections.push({ note: cells[0], rows: [] });
        else part.note = (part.note + " " + cells[0]).trim();
      } else if (cells.length === 3 || cells.length === 2) {
        if (cells.length === 3 && cells[0]) species = cells[0];
        if (!species) { cur.clean = false; continue; }
        part.rows.push({ species, season: cells[cells.length - 2], rule: cells[cells.length - 1] });
      } else cur.clean = false; // a row shape the reader does not know
    }
  }
  return out;
}

// What one entry says about a bait trip for stocked trout.
const SEASON = { "Year-round": "all", "4th Sat. in Apr.-Oct. 31": "spring" };
// The 4th Saturday in April falls on Apr 22 to 28. The app works out the real
// day for each year (season() in rigs/trips.js). This range is what a phone
// still running an older trips.js reads: it can hide the first days of a
// season, it can never show a closed lake as open.
const SPRING_CLOSED = ["11-01", "04-27"];
const STATEWIDE = /^Statewide min\. size\/daily limit\.?$/i;
// "All species" rules that change nothing about one rod of bait from shore.
const HARMLESS = /^(Two-Pole not allowed|Chumming permitted|(Internal combustion )?motors prohibited|Launching boats with internal combustion motors prohibited)\.?$/i;
// The lake-trout run card is bait fishing to keep fish, on a sliding lead
// sinker. Any lake whose rule changes that is held back until it has its own card.
const GEAR = /selective gear rules|catch[- ]and[- ]release|fly fishing only|bait prohibited|endorsement|anti-snagging|lead weights/gi;

function readEntry(e) {
  const parts = e.sections.filter((s) => s.rows.length), rows = parts.flatMap((s) => s.rows);
  const text = e.sections.map((s) => (s.note + " " + s.rows.map((r) => [r.species, r.season, r.rule].join(" ")).join(" "))).join(" ").replace(/\s+/g, " ").trim();
  const hold = (why) => ({ status: "check", why, lines: ["WDFW special rule: " + text.slice(0, 280).trim()] });
  if (!e.clean || !rows.length) return hold("Special rule needs a read");
  const rules = rows.map((r) => r.rule).join(" ");
  const general = rows.filter((r) => /^all species$/i.test(r.species));
  if (parts.length === 1 && general.some((r) => /^CLOSED WATERS\.?$/i.test(r.rule))) return { status: "closed", why: "Closed waters" };
  if (/juvenile|senior|disabilit|under 15/i.test(rules)) {
    return { status: "closed", why: /senior|disabilit/i.test(rules) ? "Juvenile, senior and disabled anglers only" : "Juvenile anglers only (under 15)" };
  }
  if (parts.length > 1) return hold("Rules differ by part of the lake");
  if (/closed|closure/i.test(rules + " " + parts[0].note)) return hold("Part of the lake or part of the season is closed");
  const gear = [...new Set((rules.match(GEAR) || []).map((x) => x.toLowerCase()))];
  if (gear.length) return hold("Special gear rule: " + gear.join(", "));
  // Every "All species" sentence has to be one the reader knows is harmless.
  for (const r of general) {
    if (r.season || r.rule.split(/(?<=\.)\s+/).some((s) => s.trim() && !HARMLESS.test(s.trim()))) return hold("Special rule needs a read");
  }
  // Trout fall under "Trout", or "All game fish", or "Other game fish". All of
  // those rows have to agree on one season the reader knows, at the statewide limit.
  const game = rows.filter((r) => /trout|steelhead|game fish/i.test(r.species));
  if (!game.length) return hold("No season for trout in the special rule");
  const seasons = [...new Set(game.map((r) => r.season))];
  const open = seasons.length === 1 ? SEASON[seasons[0]] : null;
  if (!open) return hold("Season needs a read: " + (seasons.filter(Boolean).join(" and ") || "none given"));
  if (game.some((r) => !STATEWIDE.test(r.rule))) return hold("Special trout limit");
  // Open, at the statewide trout limit. What is left is said in the pamphlet's own words.
  const lines = [open === "all" ? "Open all year." : "Open the 4th Saturday in April to Oct 31 only."];
  if (general.length) lines.push("WDFW special rule: " + general.map((r) => r.rule).join(" "));
  rows.filter((r) => !general.includes(r) && !game.includes(r)).forEach((r) => {
    lines.push("WDFW special rule, " + r.species.toLowerCase() + (r.season && r.season !== seasons[0] ? " (" + r.season + ")" : "") + ": " + r.rule);
  });
  return open === "all" ? { status: "ok", open: "all", lines } : { status: "ok", open: "spring", closed: [SPRING_CLOSED], lines };
}

// Westside counties this water sits in: the code in its WDFW stocking name
// ("LK GENEVA (KING)", "ALDER LK (THUR/PIER)", "LAKE SCANEWA (LEWIS)") and the
// feed's own county.
function countiesOf(w) {
  const out = [];
  for (const m of String(w.wdfw || "").toUpperCase().matchAll(/\(([A-Z/ ]+)\)/g)) {
    for (const code of m[1].split("/")) {
      const k = WEST[code.replace(/\s+/g, "").slice(0, 4)];
      if (k && !out.includes(k)) out.push(k);
    }
  }
  const named = String(w.county || "").toUpperCase().trim();
  if (WEST_NAMES.includes(named) && !out.includes(named)) out.push(named);
  return out;
}

// One name sits inside the other ("GISSBURG" and "GISSBURG NORTH"), or they
// differ only by a space ("FIVEMILE" and "FIVE MILE"), or the entry's own note
// gives this name as another name for it.
function near(name, e) {
  if (!name || !e.core) return false;
  const a = name.split(" "), b = e.core.split(" ");
  if (a.every((x) => b.includes(x)) || b.every((x) => a.includes(x)) || a.join("") === b.join("")) return true;
  return e.sections.some((s) => s.note && (" " + plain(s.note) + " ").includes(" " + name + " "));
}

// The rule for one water, from entries already read off the pages.
export function ruleFromEntries(entries, w) {
  const counties = countiesOf(w || {});
  if (!counties.length) return { status: "check", why: "East of the mountains: lake rules not read yet" };
  if (!entries || !entries.length) return { status: "check", why: "Lake rules could not be read" };
  const own = [core(w.wdfw), core(w.name)];
  const names = own.concat(own.map((n) => LISTED_AS[n])).filter((x, i, a) => x && a.indexOf(x) === i);
  if (!names.length) return { status: "check", why: "Lake rules not checked yet" };
  const here = entries.filter((e) => e.counties.some((k) => k === ANY_COUNTY || counties.includes(k)));
  const exact = here.filter((e) => names.includes(e.core));
  if (exact.length === 1) return readEntry(exact[0]);
  if (exact.length > 1) return { status: "check", why: "More than one lake by this name in the county" };
  // No entry under this exact name. A close name is not proof either way, so
  // it is held back. Only a lake nothing on the pages resembles is taken as
  // having no special rule.
  const close = here.find((e) => names.some((n) => near(n, e)));
  if (close) return { status: "check", why: "Special rule needs a read: the pamphlet lists " + close.name };
  return { status: "ok", open: "all", lines: ["Open all year (statewide lake rule; no special rule for this lake)."] };
}

// The rule for one water, from the page text. pages: one page's html, or a list.
export function lakeRule(pages, w) {
  return ruleFromEntries(lakeEntries(pages), w);
}

// ---- the build ---------------------------------------------------------------
async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RigCard build; coachpilot.org/rigs)" } });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.text();
}

async function main(dry) {
  const feed = JSON.parse(await get(FEED));
  if (!feed.waters) throw new Error("feed: " + JSON.stringify(feed).slice(0, 200));
  const entries = [];
  for (const p of PAGES) {
    const html = await get("https://www.eregulations.com/washington/fishing/" + p), found = lakeEntries(html);
    if (!/<\/html>/i.test(html) || found.length < MIN_LAKES_PER_PAGE) throw new Error(p + " did not load as the whole lake table: " + found.length + " lakes read");
    entries.push(...found);
  }
  // Headings the reader could not split cleanly. Those lakes are held back; the name here says which to look at.
  const unread = entries.filter((e) => !e.clean).map((e) => e.name);
  const all = feed.waters.map((w) => {
    const plants = (w.plants || []).filter((p) => p.fpp != null && p.fpp <= CATCHABLE_FPP)
      .map((p) => ({ d: p.d, sp: p.sp, n: p.n, fpp: p.fpp }));
    return { geo: w.geo, name: w.name, wdfw: w.wdfw, county: w.county, lat: w.lat, lon: w.lon, km: w.km, plants, rule: ruleFromEntries(entries, w) };
  });
  const waters = all.filter((w) => w.plants.length);
  const verdict = (w) => w.rule.status === "ok" ? (w.rule.open === "all" ? "open all year" : "spring only") : w.rule.status + ": " + (w.rule.why || "");

  if (dry) {
    // Every water in the feed, stocked right now or not, nearest first.
    all.slice().sort((a, b) => a.km - b.km).forEach((w) => {
      console.log([String(w.km).padStart(4), (w.plants.length ? "stocked" : "").padEnd(7), String(w.wdfw).padEnd(26), verdict(w)].join("  "));
    });
    console.log(JSON.stringify({ lakesRead: entries.length, unread, feed: all.length, stocked: waters.length, wrote: false }));
    return;
  }
  const js = "// Built by scripts/build-waters.mjs on " + new Date().toISOString().slice(0, 10) + ". Do not edit by hand.\n" +
    "// CastAI stocked waters (castai-waters feed) with catchable trout plants and WDFW lake rules.\n" +
    "(function (root) {\n  var RIG = (root.RIG = root.RIG || {});\n  RIG.watersSnapshot = " +
    JSON.stringify({ at: feed.at, built: new Date().toISOString().slice(0, 10), waters }) + ";\n" +
    "  if (RIG.trips && RIG.trips.addWaters) RIG.trips.addWaters(RIG.watersSnapshot);\n})(typeof window !== \"undefined\" ? window : globalThis);\n";
  writeFileSync(resolve(ROOT, "rigs/waters.js"), js);
  const by = {}; waters.forEach((w) => (by[w.rule.status] = (by[w.rule.status] || 0) + 1));
  console.log(JSON.stringify({ waters: waters.length, rules: by, check: waters.filter((w) => w.rule.status !== "ok").map((w) => w.name + ": " + (w.rule.why || "")),
    lakesRead: entries.length, unread, verdicts: waters.map((w) => w.name + ": " + verdict(w)) }, null, 1));
}

// Run only as a script. Importing this file (the tests do) fetches nothing and writes nothing.
let asScript = false;
try { asScript = !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { asScript = false; }
if (asScript) await main(process.argv.includes("--dry"));
