// Builds rigs/waters.js: CastAI's stocked waters near Bonney Lake, each with
// its catchable trout plants and its WDFW lake rule, read from the 2026-27
// pamphlet (eregulations.com Westside Lakes Special Rules).
//
// Run: node scripts/build-waters.mjs   (the daily rule review job runs it too)
//
// Sources:
//   castai-waters edge function (CastAI's verified WDFW stocking matches,
//   nightly from WDFW). Lakes are open all year unless a lake has its own
//   special rule (WDFW Statewide Freshwater Rules). A lake whose entry we
//   cannot read cleanly is marked "check" and the app does not list it.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FEED = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-waters?km=230";
const PAGES = ["westside-lakes-special-rules-a-e", "westside-lakes-special-rules-f-p", "westside-lakes-special-rules-q-z"];
const WEST = { KING: "KING", PIER: "PIERCE", THUR: "THURSTON", MASO: "MASON", KITS: "KITSAP", SNOH: "SNOHOMISH", LEWI: "LEWIS",
  GRAY: "GRAYS HARBOR", JEFF: "JEFFERSON", CLAL: "CLALLAM", SKAG: "SKAGIT", WHAT: "WHATCOM", ISLA: "ISLAND", PACI: "PACIFIC",
  COWL: "COWLITZ", WAHK: "WAHKIAKUM", CLAR: "CLARK", SKAM: "SKAMANIA", SANJ: "SAN JUAN" };
const CATCHABLE_FPP = 6; // 6 fish per pound or fewer = catchable size (about 8 in and up)

const text = (h) => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#8217;|&rsquo;/g, "'").replace(/&nbsp;/g, " ").replace(/&[a-z#0-9]+;/g, " ").replace(/\s+/g, " ");
const core = (s) => s.toUpperCase().replace(/\(.*?\)/g, " ").replace(/\bT\d+\b/g, " ").replace(/[,.'’]/g, " ")
  .replace(/\b(LK|LKS|LAKE|LAKES|POND|PD|RESERVOIR|RES)\b/g, " ").replace(/\s+/g, " ").trim();

async function get(url) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (RigCard build; coachpilot.org/rigs)" } });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.text();
}

// Every "NAME - COUNTY CO." entry on the three westside lake pages.
async function entries() {
  const out = [];
  for (const p of PAGES) {
    const t = text(await get("https://www.eregulations.com/washington/fishing/" + p));
    if (t.length < 5000) throw new Error(p + " did not load");
    const re = /([A-Z][A-Z0-9 .'’,()&-]{1,60}?) - ([A-Z][A-Z/ .]{2,40}?) CO\./g;
    const hits = [...t.matchAll(re)];
    hits.forEach((m, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].index : Math.min(t.length, m.index + 1500);
      out.push({ name: m[1].trim(), core: core(m[1]), counties: m[2].split("/").map((x) => x.trim()), body: t.slice(m.index, Math.min(end, m.index + 1500)) });
    });
  }
  return out;
}

function ruleFor(w, all) {
  const m = /\(([A-Z/]+)\)/.exec(w.wdfw || "");
  const codes = m ? m[1].split("/") : [];
  const counties = codes.map((c) => WEST[c]).filter(Boolean);
  if (!counties.length) return { status: "check", why: "East of the mountains: lake rules not read yet" };
  const c = core(w.wdfw || w.name);
  const e = all.find((x) => x.core === c && x.counties.some((k) => counties.includes(k)));
  if (!e) return { status: "ok", open: "all", lines: ["Open all year (statewide lake rule; no special rule for this lake)."] };
  const b = e.body;
  if (/CLOSED WATERS/.test(b)) return { status: "closed", why: "Closed waters" };
  if (/Open for juvenile anglers/i.test(b)) return { status: "closed", why: "Juvenile, senior and disabled anglers only" };
  const trout = /(Trout|All game fish|Other game fish) (Year-round|4th Sat\. in Apr\.-Oct\. 31|Last Sat\. in Apr\.-Oct\. 31)/.exec(b);
  const extra = b.replace(/^.*? CO\.\s*/, "").slice(0, 280).trim();
  // The lake-trout run card is bait fishing to keep fish. Any lake whose
  // rule changes that (gear limits, catch and release, fly only, an
  // endorsement) is held back until it has its own card.
  const odd = /(Selective gear rules|Catch[- ]and[- ]release|Fly fishing only|Bait prohibited|Endorsement)/i.exec(b);
  if (odd) return { status: "check", why: "Special gear rule: " + odd[1].toLowerCase(), lines: ["WDFW special rule: " + extra] };
  if (!trout) return { status: "check", why: "Special rule needs a read", lines: ["WDFW special rule: " + extra] };
  if (trout[2] === "Year-round") return { status: "ok", open: "all", lines: ["Open all year.", "WDFW special rule: " + extra] };
  return { status: "ok", open: "spring", closed: [["11-01", "04-27"]], lines: ["Open the 4th Saturday in April to Oct 31 only.", "WDFW special rule: " + extra] };
}

const feed = JSON.parse(await get(FEED));
if (!feed.waters) throw new Error("feed: " + JSON.stringify(feed).slice(0, 200));
const all = await entries();
const waters = feed.waters.map((w) => {
  const plants = (w.plants || []).filter((p) => p.fpp != null && p.fpp <= CATCHABLE_FPP)
    .map((p) => ({ d: p.d, sp: p.sp, n: p.n, fpp: p.fpp }));
  return { geo: w.geo, name: w.name, wdfw: w.wdfw, county: w.county, lat: w.lat, lon: w.lon, km: w.km, plants, rule: ruleFor(w, all) };
}).filter((w) => w.plants.length);

const js = "// Built by scripts/build-waters.mjs on " + new Date().toISOString().slice(0, 10) + ". Do not edit by hand.\n" +
  "// CastAI stocked waters (castai-waters feed) with catchable trout plants and WDFW lake rules.\n" +
  "(function (root) {\n  var RIG = (root.RIG = root.RIG || {});\n  RIG.watersSnapshot = " +
  JSON.stringify({ at: feed.at, built: new Date().toISOString().slice(0, 10), waters }) + ";\n" +
  "  if (RIG.trips && RIG.trips.addWaters) RIG.trips.addWaters(RIG.watersSnapshot);\n})(typeof window !== \"undefined\" ? window : globalThis);\n";
writeFileSync(resolve(ROOT, "rigs/waters.js"), js);
const by = {}; waters.forEach((w) => (by[w.rule.status] = (by[w.rule.status] || 0) + 1));
console.log(JSON.stringify({ waters: waters.length, rules: by, check: waters.filter((w) => w.rule.status !== "ok").map((w) => w.name + ": " + (w.rule.why || "")) }, null, 1));
