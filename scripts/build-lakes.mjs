// Builds rigs/lakes.js: every lake in range of Bonney Lake on WDFW's Fish
// Washington map, the fish WDFW's map lists in it, the plants WDFW made into
// it, and where USGS has a record of a fish brought into it.
//
// Run: node scripts/build-lakes.mjs          (fetches, writes rigs/lakes.js)
//      node scripts/build-lakes.mjs --dry    (fetches, prints a summary, writes nothing)
//      node scripts/build-lakes.mjs --force  (writes even when it has lost a tenth of a source)
//
// Sources (nothing else is read):
//   WDFW Fish Washington map service, FishWA_2014_AllLakes_PROD:
//     layer 2 Lowland Lakes (name, county, acres, elevation, management type,
//     shoreline access, boat ramp, point), layers 4 to 18 (one per species,
//     the same points), layer 21 High Lakes (lake code, point, species).
//   data.wa.gov WDFW Fish Plants (6fex-3r7d), nightly: every plant, by lake code.
//   USGS Nonindigenous Aquatic Species API: Washington fish records.
//   The 2026-27 pamphlet on eregulations.com, its six lake special rules
//   pages: each listed lake's rules and seasons, word for word, and its
//   public boat ramp icon. scripts/pamphlet-pages.json (made from the
//   pamphlet's PDF by scripts/pamphlet-pages.mjs) gives each entry's
//   printed page.
//   rigs/waters.js, the app's own stocked-lake feed: lake codes it already has.
//
// What the app may say, and from where:
//   stocked     only where the plants data shows a plant (with its date)
//   in the lake only where the WDFW map lists the fish there
//   introduced  only where a USGS NAS record matches the lake
//   Nothing here ever says wild or native: no source says so.
//
// Joining a lake to its plants. The map has no lake codes, the plants have
// no points. In order:
//   code   the app's feed (rigs/waters.js) has this lake, by name, within
//          3 km of the map's point: its WDFW code.
//   point  a plants code with a point (the feed or the High Lakes layer),
//          the same name, the same county, within 3 km.
//   name   the same name, the same county, the only lake of that name in
//          that county on the map and the only plants code of that name
//          there. A code whose township (T27 in "ECHO LK (SNOH) T27") does
//          not fall on the lake's latitude is not it.
// Anything else (two lakes of one name in a county, two codes for one name,
// a code whose point is far away) is left out and logged. It never guesses.
import { realpathSync, writeFileSync, readFileSync, existsSync, renameSync, unlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lakeEntries } from "./build-waters.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const HOME = [47.177, -122.186]; // Bonney Lake
export const KM = 230; // the castai-waters feed's own range (km=230), straight line
const MAP = "https://geodataservices.wdfw.wa.gov/arcgis/rest/services/ApplicationServices/FishWA_2014_AllLakes_PROD/MapServer";
const PLANTS = "https://data.wa.gov/resource/6fex-3r7d.json";
const PLANTS_META = "https://data.wa.gov/api/views/6fex-3r7d.json";
const NAS = "https://nas.er.usgs.gov/api/v2/occurrence/search?state=WA&group=Fishes";
const NEAR_KM = 3; // a point this close to the map's point is the same lake

// ---- names ------------------------------------------------------------------
// A name boiled down to the words that tell lakes apart: "LK TAPPS (PIER)",
// "Lake Tapps" and "TAPPS LAKE" are all TAPPS. (The same rule as
// scripts/build-waters.mjs.)
const NOISE = /\b(LK|LKS|LAKE|LAKES|POND|PONDS|PD|RESERVOIR|RES|AND OUTLET|THE)\b/g;
// The plants data's short words: "STARZMAN LK UPR" is Starzman Lake Upper.
const SHORT = { UPR: "UPPER", LWR: "LOWER", MID: "MIDDLE" };
export function core(s) {
  return String(s || "").toUpperCase().replace(/\(.*?\)/g, " ").replace(/\bT\d+\b/g, " ").replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, " ").replace(NOISE, " ").replace(/\b(UPR|LWR|MID)\b/g, (w) => SHORT[w]).replace(/\s+/g, " ").trim();
}
// The other ways a plants name can say which lake it is, besides core():
// a lake's number in brackets ("KLONE LKS (1)" is Klone Lake 1) and the two
// Martha Lakes in Snohomish County, "(WB)" Warm Beach and "(AM)" Alderwood
// Manor. A bracketed number alone never joins a lake with no number in its
// name: "EASTON PD (3)" is still Easton Ponds.
const IN_BRACKETS = { WB: "WARM BEACH", AM: "ALDERWOOD MANOR" };
export function cores(s) {
  const t = String(s || "").toUpperCase(), out = [core(t)];
  const num = t.replace(/\((\d{1,2})\)/g, " $1 ");
  const said = t.replace(/\((WB|AM)\)/g, (m, k) => " " + IN_BRACKETS[k] + " ");
  [num, said].forEach((x) => { const c = core(x); if (c && !out.includes(c)) out.push(c); });
  return out;
}
// Lake, pond or reservoir, by the name's own word: "MILK LK" and "MILK PD"
// are two waters, and so are "Milk Lake" and "Milk Pond".
export function kindOf(s) {
  const t = String(s || "").toUpperCase();
  return /\b(POND|PONDS|PD)\b/.test(t) ? "pond" : /\b(RES|RESERVOIR)\b/.test(t) ? "res" : /\b(LK|LKS|LAKE|LAKES)\b/.test(t) ? "lake" : "";
}
// A plant row belongs to a lake when its own name is the lake's: the same
// words, or the lake's words and then a place on it ("BAKER LK@BLUE TARP B").
export function rowFits(lakeCore, loc) {
  return !!lakeCore && cores(loc).some((c) => c === lakeCore || c.indexOf(lakeCore + " ") === 0);
}
export function slug(s) { return String(s || "").toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
// In range the way the castai-waters feed counts it: the distance rounded
// to a whole km, then no more than KM (Math.round(km) <= R in its code).
export function inRange(d) { return Math.round(d) <= KM; }
export function km(lat, lon, at) {
  const [la, lo] = at || HOME, r = Math.PI / 180;
  const a = Math.sin((lat - la) * r / 2) ** 2 + Math.cos(la * r) * Math.cos(lat * r) * Math.sin((lon - lo) * r / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(a));
}
// The county codes in a plants name ("ALDER LK (THUR/PIER)") and its county field.
const COUNTY_CODE = { ADAM: "ADAMS", ASOT: "ASOTIN", BENT: "BENTON", CHEL: "CHELAN", CLAL: "CLALLAM", CLAR: "CLARK", COLU: "COLUMBIA",
  COWL: "COWLITZ", DOUG: "DOUGLAS", FERR: "FERRY", FRAN: "FRANKLIN", GARF: "GARFIELD", GRAN: "GRANT", GRAY: "GRAYS HARBOR", ISLA: "ISLAND",
  JEFF: "JEFFERSON", KING: "KING", KITS: "KITSAP", KITT: "KITTITAS", KLIC: "KLICKITAT", LEWI: "LEWIS", LINC: "LINCOLN", MASO: "MASON",
  OKAN: "OKANOGAN", PACI: "PACIFIC", PEND: "PEND OREILLE", PIER: "PIERCE", SANJ: "SAN JUAN", SKAG: "SKAGIT", SKAM: "SKAMANIA",
  SNOH: "SNOHOMISH", SPOK: "SPOKANE", STEV: "STEVENS", THUR: "THURSTON", WAHK: "WAHKIAKUM", WALL: "WALLA WALLA", WHAT: "WHATCOM",
  WHIT: "WHITMAN", YAKI: "YAKIMA" };
function countiesOfName(name) {
  const out = [];
  for (const m of String(name || "").toUpperCase().matchAll(/\(([A-Z/ ]+)\)/g)) {
    for (const c of m[1].split("/")) { const k = COUNTY_CODE[c.replace(/\s+/g, "").slice(0, 4)]; if (k && !out.includes(k)) out.push(k); }
  }
  return out;
}
// A township in a plants name: "T27" is Township 27 North of the Willamette
// baseline (45.5199 N), six miles a township. The lake's latitude has to fall
// in it, give or take three km for the survey's corrections.
const BASE_LAT = 45.5199, TWP_DEG = 9.656 / 111.2;
export function townshipFits(name, lat) {
  const m = /\bT(\d{1,2})\b/.exec(String(name || "").toUpperCase());
  if (!m) return null;
  const lo = BASE_LAT + (+m[1] - 1) * TWP_DEG, slack = 3 / 111.2;
  return lat >= lo - slack && lat <= lo + TWP_DEG + slack;
}

// ---- the fish ---------------------------------------------------------------
// Species layers on the map (layer: app id).
export const LAYERS = { 4: "trout", 5: "browntrout", 6: "brooktrout", 7: "tigertrout", 8: "cutthroat", 9: "kokanee", 10: "bass", 11: "smallmouth",
  12: "walleye", 13: "muskie", 14: "bullhead", 15: "perch", 16: "crappie", 17: "pumpkinseed", 18: "bluegill" };
// The plants data's own species strings. Left out on purpose: "Golden
// Rainbow" (no source says what it is), "Sturgeon General" (no species),
// "Sauger/Walleye" (a cross no rule names), "Grass Carp" (planted to eat
// weeds; closed to fishing).
export const PLANT_SP = { "Rainbow": "trout", "Cutthroat": "cutthroat", "Kokanee": "kokanee", "Brown Trout": "browntrout",
  "Eastern Brook Trout": "brooktrout", "Tiger Trout": "tigertrout", "Golden Trout": "goldentrout", "Channel Catfish": "catfish",
  "Tiger Muskie": "muskie", "Black Crappie": "crappie", "White Crappie": "crappie", "Largemouth Bass": "bass", "SmallMouth Bass": "smallmouth",
  "Bluegill": "bluegill", "Walleye": "walleye", "Yellow Perch": "perch", "Pumpkinseed": "pumpkinseed", "Brown Bullhead": "bullhead",
  "Lake Trout": "laketrout", "Sturgeon White": "sturgeon", "Sockeye": "sockeye", "Coho": "coho", "Chinook": "king", "Steelhead": "steelhead",
  "Chum": "chum", "Pink": "pink" };
// USGS NAS common names.
export const NAS_SP = { "Largemouth Bass": "bass", "Yellow Perch": "perch", "Brown Bullhead": "bullhead", "Black Crappie": "crappie",
  "White Crappie": "crappie", "Pumpkinseed": "pumpkinseed", "Bluegill": "bluegill", "Smallmouth Bass": "smallmouth", "Channel Catfish": "catfish",
  "Walleye": "walleye", "Brown Trout": "browntrout", "tiger muskellunge": "muskie", "Brook Trout": "brooktrout", "Lake Trout": "laketrout",
  "Sockeye Salmon": "sockeye", "Coho Salmon": "coho", "Cutthroat Trout": "cutthroat" };
// A record of a fish that did not take, or was taken out, is not a fish in the lake.
const NAS_GONE = /^(failed|extirpated|eradicated)$/i;
// High Lakes layer species names.
export const HIGH_SP = { "Rainbow trout": "trout", "Cutthroat trout": "cutthroat", "Brook trout": "brooktrout", "Golden trout": "goldentrout",
  "Brown trout": "browntrout", "Tiger trout": "tigertrout", "Kokanee": "kokanee", "Lake trout": "laketrout", "Tiger muskie": "muskie" };
// Short codes in the file: the life stage of a plant, the status of a USGS record.
const LIFE = (t) => { const k = String(t || "").split("/").pop().toLowerCase(); return /legal/.test(k) ? "L" : /fingerling/.test(k) ? "G" : /yearling/.test(k) ? "Y" : /smolt/.test(k) ? "S" : /fry|zero/.test(k) ? "F" : ""; };
const NAS_ST = { established: "e", stocked: "s", collected: "c", unknown: "u", "": "u", failed: "f", extirpated: "x", eradicated: "x" };
const MGMT = { "Trout emphasis": "T", "Mixed species - Trout emphasis": "MT", "Mixed species - Warmwater emphasis": "MW", "Warmwater emphasis": "W" };

// ---- the map ----------------------------------------------------------------
// Every lake on the Lowland Lakes layer within range.
export function mapLakes(features) {
  const out = [];
  for (const f of features || []) {
    const a = f.attributes || {}, g = f.geometry || {};
    if (typeof g.y !== "number" || typeof g.x !== "number" || !a.LakeName) continue;
    const d = km(g.y, g.x);
    if (inRange(d) === false) continue;
    out.push({ oid: a.OBJECTID, name: String(a.LakeName).trim(), county: String(a.CountyName || "").trim(), acres: a.SurfaceAcres,
      elev: a.ELEV, type: MGMT[a.PublicManagementType] || "", shore: a.ShorelineAccess === "Good" ? 1 : 0, ramp: a.BoatRampAvailable === "Yes" ? 1 : 0,
      lat: g.y, lon: g.x, km: d, core: core(a.LakeName) });
  }
  out.sort((x, y) => x.km - y.km || x.name.localeCompare(y.name));
  return out;
}
// Which fish the map lists in each lake: the species layers carry the same
// points as layer 2, under the same object id and name.
export function mapSpecies(lakes, layers, log) {
  const byOid = new Map(lakes.map((l) => [l.oid, l])), out = new Map();
  for (const [layer, id] of Object.entries(LAYERS)) {
    for (const f of (layers && layers[layer]) || []) {
      const a = f.attributes || {}, g = f.geometry || {};
      if (typeof g.y !== "number" || !inRange(km(g.y, g.x))) continue;
      const l = byOid.get(a.OBJECTID);
      if (!l || core(a.LakeName) !== l.core || km(g.y, g.x, [l.lat, l.lon]) > 0.5) {
        log.push(["map", id, "object " + a.OBJECTID + " " + a.LakeName + " (" + a.CountyName + ")", "species point does not match a lake on layer 2: left out"]);
        continue;
      }
      if (!out.has(l.oid)) out.set(l.oid, new Set());
      out.get(l.oid).add(id);
    }
  }
  return out;
}

// ---- the plants -------------------------------------------------------------
// One entry per WDFW lake code from the grouped plants query: its names, its
// counties, and per species string its plant count and dates.
export function plantSites(groups) {
  const out = new Map();
  for (const r of groups || []) {
    const code = String(r.geo_code || "").trim();
    if (!/^L\d+$/.test(code)) continue;
    const s = out.get(code) || { code, names: new Set(), counties: new Set(), cores: new Set(), species: {} };
    const loc = String(r.release_location || "").trim();
    if (loc) { s.names.add(loc); cores(loc).forEach((c) => s.cores.add(c)); countiesOfName(loc).forEach((c) => s.counties.add(c)); }
    const cty = String(r.county || "").trim().toUpperCase();
    if (cty) s.counties.add(cty);
    s.species[r.species] = (s.species[r.species] || 0) + (+r.plants || 0);
    out.set(code, s);
  }
  return out;
}
// Points the build knows for a lake code: the app's feed, and the High Lakes layer.
export function codePoints(waters, high) {
  const out = new Map();
  for (const w of waters || []) if (w.geo && typeof w.lat === "number") out.set(w.geo, { lat: w.lat, lon: w.lon, src: "feed", cores: [core(w.name), core(w.wdfw)] });
  for (const f of high || []) {
    const a = f.attributes || {}, code = String(hv(a, "GeometryID") || "").trim(), lat = hv(a, "LatitudeCenter"), lon = hv(a, "LongitudeCenter");
    if (/^L\d+$/.test(code) && typeof lat === "number" && typeof lon === "number" && !out.has(code)) out.set(code, { lat, lon, src: "high", cores: [core(hv(a, "LakeMapName"))] });
  }
  return out;
}
function hv(a, k) { return a["GeoWeb.dbo.Fish_MapsHighLakes_V." + k]; }

// lakes x plant sites. Returns { joins: Map oid -> [{code, how}], log }.
export function joinPlants(lakes, sites, points, waters, log) {
  const joins = new Map(), taken = new Map();
  const add = (l, code, how) => {
    if (!joins.has(l.oid)) joins.set(l.oid, []);
    if (!joins.get(l.oid).some((j) => j.code === code)) joins.get(l.oid).push({ code, how });
    taken.set(code, (taken.get(code) || []).concat(l.oid));
  };
  const sameName = new Map(); // county|core -> map lakes
  for (const l of lakes) { const k = l.county.toUpperCase() + "|" + l.core; sameName.set(k, (sameName.get(k) || []).concat(l)); }
  // 1. code: the app's own feed knows this lake.
  for (const l of lakes) {
    for (const w of waters || []) {
      if (!w.geo || typeof w.lat !== "number") continue;
      if ((core(w.name) === l.core || core(w.wdfw) === l.core) && km(w.lat, w.lon, [l.lat, l.lon]) <= NEAR_KM) add(l, w.geo, "code");
    }
  }
  // 2 and 3: by name in the county.
  const byCore = new Map();
  for (const s of sites.values()) for (const c of s.cores) { if (!c) continue; byCore.set(c, (byCore.get(c) || []).concat(s)); }
  for (const l of lakes) {
    const cty = l.county.toUpperCase(), twins = sameName.get(cty + "|" + l.core) || [];
    const cands = (byCore.get(l.core) || []).filter((s) => s.counties.has(cty) && !(joins.get(l.oid) || []).some((j) => j.code === s.code));
    const sure = [], loose = [];
    for (const s of cands) {
      // A point is the code's. Where one code carries two waters' names, it
      // counts only for the water it was given for (L2818's point is Long
      // Lake's, not Long's Pond's, though both names sit under L2818).
      const p0 = points.get(s.code), p = p0 && (s.cores.size === 1 || p0.cores.includes(l.core)) ? p0 : null;
      if (p) {
        const d = km(p.lat, p.lon, [l.lat, l.lon]);
        // near enough, and nearer than any other lake of this name in the county
        if (d <= NEAR_KM && twins.every((t) => t === l || km(p.lat, p.lon, [t.lat, t.lon]) > d)) sure.push(s);
        else if (d <= NEAR_KM) continue;
        else if (twins.length < 2) log.push(["plants", l.name + " (" + l.county + ")", s.code + " " + [...s.names][0], "same name, but its point is " + Math.round(d) + " km away: another lake"]);
        continue;
      }
      // a township that does not fit the lake's latitude: another lake
      const tw = [...s.names].map((n) => townshipFits(n, l.lat)).filter((x) => x !== null);
      if (tw.length && !tw.some(Boolean)) continue;
      loose.push({ s, twp: tw.length > 0 });
    }
    sure.forEach((s) => add(l, s.code, "point"));
    if (!loose.length) continue;
    // More than one water could be meant: the kind of water (lake or pond)
    // can still tell them apart, when both names say it.
    let pick = loose;
    const lk = kindOf(l.name);
    if ((twins.length > 1 || pick.length > 1) && lk) {
      const same = pick.filter((x) => [...x.s.names].some((n) => kindOf(n) === lk));
      const twinKinds = twins.filter((t) => kindOf(t.name) === lk).length;
      if (same.length === 1 && (twins.length < 2 || twinKinds === 1)) pick = same;
    }
    // Two lakes of this name in the county: a township or the kind of water
    // has to have told them apart. Codes that name another kind of water
    // ("LK EASTON" next to Easton Ponds) belong to the other lake, not here.
    const otherKind = (x) => lk && [...x.s.names].every((n) => kindOf(n) && kindOf(n) !== lk);
    if (twins.length > 1 && pick === loose && pick.every(otherKind)) continue;
    if (twins.length > 1 && pick === loose && !(pick.length === 1 && pick[0].twp)) {
      log.push(["plants", l.name + " (" + l.county + ")", loose.map((x) => x.s.code + " " + [...x.s.names][0]).join(", "),
        twins.length + " lakes of this name in the county: not sure which, left out"]);
      continue;
    }
    if (pick.length > 1) {
      log.push(["plants", l.name + " (" + l.county + ")", pick.map((x) => x.s.code + " " + [...x.s.names][0]).join(", "),
        "more than one plants code of this name in the county: not sure which, left out"]);
      continue;
    }
    add(l, pick[0].s.code, pick[0].twp ? "township" : pick !== loose ? "kind" : "name");
  }
  // One code on two lakes of the same name is a guess on at least one of
  // them: it is left out of both (an app-feed code stays where it is).
  // Two lakes under one code with names of their own (LONG LK and LONGS PD
  // under L2818) each take only the rows named for them.
  for (const [code, oids] of taken) {
    const u = [...new Set(oids)];
    if (u.length < 2) continue;
    const ls = u.map((oid) => lakes.find((x) => x.oid === oid));
    for (const l of ls) {
      const clash = ls.some((o) => o !== l && (o.core === l.core || o.core.indexOf(l.core + " ") === 0 || l.core.indexOf(o.core + " ") === 0));
      if (!clash) continue;
      const j = joins.get(l.oid);
      if (j.some((x) => x.code === code && x.how !== "code")) {
        joins.set(l.oid, j.filter((x) => x.code !== code || x.how === "code"));
        log.push(["plants", l.name + " (" + l.county + ")", code, "the same plants code matches " + u.length + " lakes of this name: left out"]);
      }
    }
  }
  return joins;
}

// One lake's plant rows, summed per species:
//   [last date, fish in the last plant, fish per pound, life stage,
//    plants in all, first year, plants this year, fish this year]
// Two rows on the last day (two trucks, two sizes) are one plant; the size
// said is the biggest fish that day.
export function plantSummary(rows, year) {
  const by = new Map();
  for (const r of rows || []) {
    const sp = PLANT_SP[r.species];
    if (!sp) continue;
    const d = String(r.release_start_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const days = by.get(sp) || new Map();
    const day = days.get(d) || { n: 0, fpp: [], life: new Set() };
    day.n += Math.round(+r.number_released || 0);
    if (r.number_of_fish_per_pound != null && r.number_of_fish_per_pound !== "" && +r.number_of_fish_per_pound > 0) day.fpp.push(+r.number_of_fish_per_pound);
    if (r.lifestage) day.life.add(String(r.lifestage).trim());
    days.set(d, day);
    by.set(sp, days);
  }
  const out = new Map(), y = String(year);
  for (const [sp, days] of by) {
    const ds = [...days.keys()].sort(), last = ds[ds.length - 1], L = days.get(last);
    const fpp = L.fpp.length ? Math.round(Math.min(...L.fpp) * 100) / 100 : null;
    const yr = ds.filter((d) => d.slice(0, 4) === y);
    out.set(sp, [last, L.n, fpp, [...L.life].sort().join("/"), ds.length, +ds[0].slice(0, 4), yr.length, yr.reduce((s, d) => s + days.get(d).n, 0)]);
  }
  return out;
}

// ---- USGS NAS ---------------------------------------------------------------
// A record matches a lake when the place it names (before a comma or "in
// Seattle") is the lake's name, and it lies within reach of the lake's point
// (3 km, more for a big lake: its point is its middle). One lake only.
export function joinNas(lakes, records, log) {
  const out = new Map(), byCore = new Map();
  for (const l of lakes) byCore.set(l.core, (byCore.get(l.core) || []).concat(l));
  for (const r of records || []) {
    const sp = NAS_SP[r.commonName];
    if (!sp || typeof r.decimalLatitude !== "number") continue;
    if (km(r.decimalLatitude, r.decimalLongitude) > KM + 20) continue;
    const head = String(r.locality || "").split(/,|;|\s+(?:in|near|at|on)\s+/i)[0];
    const c = core(head);
    if (!c) continue;
    const fit = (byCore.get(c) || []).filter((l) => {
      const reach = 3 + 3 * Math.sqrt(((+l.acres || 0) * 4046.86) / Math.PI) / 1000;
      return km(r.decimalLatitude, r.decimalLongitude, [l.lat, l.lon]) <= reach;
    });
    if (!fit.length) continue;
    if (fit.length > 1) { log.push(["nas", sp, r.locality, fit.length + " lakes of this name in reach: left out"]); continue; }
    const l = fit[0], m = out.get(l.oid) || {}, was = m[sp];
    const st = String(r.status || "").toLowerCase(), y = +r.year || 0;
    // keep the newest record; a living one before a gone one
    const live = !NAS_GONE.test(st);
    if (!was || (live && !was.live) || (live === was.live && y > was.y)) m[sp] = { y, st, live, key: r.key };
    out.set(l.oid, m);
  }
  return out;
}

// ---- high lakes ---------------------------------------------------------------
// Per species: how many High Lakes in range carry it, and the nearest three.
// (Hike-in lakes: they have no page in the app; the fish's page says so.)
export function highLakes(features) {
  const out = {};
  for (const f of features || []) {
    const a = f.attributes || {}, lat = hv(a, "LatitudeCenter"), lon = hv(a, "LongitudeCenter");
    if (typeof lat !== "number" || typeof lon !== "number") continue;
    const d = km(lat, lon);
    if (!inRange(d)) continue;
    const name = String(hv(a, "LakeMapName") || "").trim(), cty = String(hv(a, "CountyName") || "").trim();
    for (const s of String(hv(a, "SpeciesList") || "").split(",")) {
      const id = HIGH_SP[s.trim()];
      if (!id) continue;
      (out[id] = out[id] || []).push([Math.round(d), name, cty]);
    }
  }
  const res = {};
  for (const [id, list] of Object.entries(out)) {
    list.sort((a, b) => a[0] - b[0]);
    // one name once (a lake listed twice in the layer)
    const seen = new Set(), near = [];
    for (const x of list) { const k = x[1] + "|" + x[2]; if (seen.has(k)) continue; seen.add(k); if (near.length < 3) near.push(x); }
    res[id] = { n: seen.size, near };
  }
  return res;
}

// ---- the pamphlet -------------------------------------------------------------
// The 2026-27 lake special rules, as eregulations.com serves the pamphlet:
// every lake it lists in range, its rules and seasons word for word, joined
// to the lake on the map it names. A lake the pamphlet does not list keeps
// the statewide rules (the app says so). Nothing here is reworded.
export const PAMPHLET = "https://www.eregulations.com/washington/fishing/";
export const PAMPHLET_PDF = "https://www.eregulations.com/assets/docs/resources/WA/26WAFW_LR2.pdf";
export const PAMPHLET_PAGES = ["westside-lakes-special-rules-a-e", "westside-lakes-special-rules-f-p", "westside-lakes-special-rules-q-z",
  "eastside-lakes-special-rules-a-f", "eastside-lakes-special-rules-g-p", "eastside-lakes-special-rules-q-z"];
// Which fish a row's species cell is about. The pamphlet's own words
// (Definitions): trout are brown, cutthroat, golden, rainbow and tiger
// trout (and grayling); brook trout and lake trout are char, not trout;
// game fish are the trout, char, kokanee, bass, walleye, tiger muskie,
// catfish, crappie, perch, sunfish and steelhead, and not salmon or
// sturgeon (food fish).
const TROUT = ["trout", "cutthroat", "browntrout", "tigertrout", "goldentrout"], SALMON = ["sockeye", "coho", "king", "chum", "pink"];
export const GAME = TROUT.concat(["brooktrout", "laketrout", "kokanee", "bass", "smallmouth", "walleye", "muskie", "catfish", "bullhead",
  "crappie", "perch", "bluegill", "pumpkinseed", "steelhead"]);
const LABEL_ALL = [[/^all species$/i, "*"], [/^all game fish$/i, "g"], [/^other game fish$/i, "o"]];
const LABEL_FISH = [[/^(other )?trout$/i, TROUT], [/^rainbow trout$/i, ["trout"]], [/^cutthroat trout$/i, ["cutthroat"]],
  [/^(eastern brook trout|brook trout|ebt)$/i, ["brooktrout"]], [/^(lake trout|mackinaw)$/i, ["laketrout"]], [/^kokanee$/i, ["kokanee"]],
  [/^salmon$/i, SALMON], [/^(hatchery )?steelhead( \(hatchery\))?$/i, ["steelhead"]], [/^largemouth bass$/i, ["bass"]],
  [/^smallmouth bass$/i, ["smallmouth"]], [/^bass$/i, ["bass", "smallmouth"]], [/^walleye$/i, ["walleye"]], [/^channel catfish$/i, ["catfish"]],
  [/^(bullhead|catfish)$/i, ["catfish", "bullhead"]], [/^crappie$/i, ["crappie"]], [/^bluegill$/i, ["bluegill"]], [/^sunfish$/i, ["bluegill", "pumpkinseed"]],
  [/^(yellow )?perch$/i, ["perch"]], [/^(white )?sturgeon$/i, ["sturgeon"]], [/^tiger musk(ie|ellunge)$/i, ["muskie"]],
  [/^(grayling|grass carp|carp|whitefish|burbot)$/i, []]];
// "*" every fish, "g" every game fish, "o" every game fish no other row in
// its part names, a list of fish, or null for a cell the build cannot read.
export function labelFish(label) {
  const t = String(label || "").trim();
  for (const [re, v] of LABEL_ALL) if (re.test(t)) return v;
  let out = [];
  for (const p of t.split(/,\s*(?:and\s+)?|\s+and\s+/).map((x) => x.trim()).filter(Boolean)) {
    const hit = LABEL_FISH.find(([re]) => re.test(p));
    if (!hit) return null;
    out = out.concat(hit[1]);
  }
  return [...new Set(out)];
}
// A heading as people say it: "TAPPS, LAKE (RESERVOIR)" is Lake Tapps.
export function pamphletName(name) {
  const t = String(name || "").replace(/\s*\((RESERVOIR|LAKE)\)\s*/gi, " ").replace(/\s+/g, " ").trim();
  const parts = t.split(",").map((x) => x.trim()).filter(Boolean);
  const said = parts.length > 1 ? parts.slice(1).join(" ") + " " + parts[0] : parts[0] || "";
  return said.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/'S\b/g, "'s")
    .replace(/(\S) (And|Of|The|To|In|At|On)\b/g, (m, a, w) => a + " " + w.toLowerCase());
}
const CRC = /\s*CRC \(\d+\)\s*/g;
// Lake or pond: two waters of one name are told apart by it ("EASTON LAKE"
// is Lake Easton, not Easton Ponds). A reservoir counts as a lake.
function kindClass(name) {
  const t = String(name || "").toUpperCase().replace(/\(.*?\)/g, " ");
  return /\b(POND|PONDS|PD)\b/.test(t) ? "pond" : /\b(LK|LKS|LAKE|LAKES|RES|RESERVOIR)\b/.test(t) ? "lake" : "";
}
const sortWords = (c) => c.split(" ").sort().join(" ");
// One entry as the app keeps it. q: the words under the heading that say
// which lake of that name it is ("Warm Beach"). Rows: [species, season,
// rule, part], part the stretch of the lake a row is for ("" the lake).
export function readPamphletEntry(e) {
  const secs = e.sections.filter((x) => x.rows.length), multi = secs.length > 1;
  const first = secs.length ? secs[0].note.replace(CRC, " ").trim() : "";
  const q = multi ? "" : first;
  const rows = [];
  secs.forEach((x, i) => {
    const part = multi ? x.note.replace(CRC, " ").trim() : "";
    x.rows.forEach((r) => rows.push([r.species, r.season || "", r.rule, part]));
  });
  return { name: pamphletName(e.name), q, rows };
}
// Each entry joined to the map lakes it names, in one of its counties: the
// same name, or the name and the words under the heading ("MARTHA LAKE",
// Warm Beach, is Martha Warm Beach), the same kind of water. A plural
// heading ("STARZMAN LAKES", "I-82 PONDS 1 through 7") is each lake of
// that name ("Starzman Lake Upper", "I-82 Pond 3"). Two lakes one entry
// could mean, or one lake two entries could mean, is not guessed: each
// such lake keeps the entries it might be (maybe), and says so.
// Returns { of: entry -> [map lakes], maybe: map lake oid -> [entries] }.
export function joinPamphlet(lakes, entries, log) {
  const of = entries.map(() => []), maybe = new Map(), claim = new Map();
  const unsure = (oid, i) => maybe.set(oid, [...new Set((maybe.get(oid) || []).concat(i))]);
  entries.forEach((e, i) => {
    const pe = readPamphletEntry(e), pc = core(e.name), pk = kindClass(e.name), qc = pe.q ? core(e.name.replace(/\(.*?\)/g, " ") + " " + pe.q) : "";
    const inCounty = lakes.filter((l) => e.counties.includes(l.county.toUpperCase()) && !(pk && kindClass(l.name) && kindClass(l.name) !== pk));
    const byQ = qc ? inCounty.filter((l) => l.core === qc || sortWords(l.core) === sortWords(qc)) : [];
    const byName = inCounty.filter((l) => l.core === pc || sortWords(l.core) === sortWords(pc));
    const plural = /\b(LAKES|PONDS)\b/.test(String(e.name).toUpperCase().replace(/\(.*?\)/g, " ")) && pc;
    const group = !byQ.length && !byName.length && plural ? inCounty.filter((l) => l.core.indexOf(pc + " ") === 0) : [];
    if (group.length) { of[i] = group; group.forEach((l) => claim.set(l.oid, (claim.get(l.oid) || []).concat(i))); return; }
    const c = byQ.length ? byQ : byName;
    if (c.length > 1) {
      log.push(["pamphlet", e.name + (pe.q ? " (" + pe.q + ")" : ""), c.map((l) => l.name).join(", "), c.length + " lakes of this name in the county: not sure which, each says so"]);
      c.forEach((l) => unsure(l.oid, i));
      return;
    }
    if (c.length === 1) { of[i] = [c[0]]; claim.set(c[0].oid, (claim.get(c[0].oid) || []).concat(i)); }
  });
  for (const [oid, list] of claim) {
    if (list.length < 2) continue;
    const l = lakes.find((x) => x.oid === oid);
    list.forEach((i) => { log.push(["pamphlet", entries[i].name, l.name, list.length + " entries could be this lake: not sure which, it says so"]); of[i] = of[i].filter((x) => x !== l); unsure(oid, i); });
  }
  return { of, maybe };
}
// The Columbia and Snake are rivers in the pamphlet, not reservoirs (page
// 23): their dams' pools on the map are not lakes under its rules.
const RIVER_POOLS = { ENTIAT: "Columbia", PATEROS: "Columbia", UMATILLA: "Columbia", "RUFUS WOODS": "Columbia", WALLULA: "Columbia",
  CELILO: "Columbia", BONNEVILLE: "Columbia", WANAPUM: "Columbia", "PRIEST RAPIDS": "Columbia", SACAJAWEA: "Snake", "HERBERT G WEST": "Snake",
  WEST: "Snake", BRYAN: "Snake", "LOWER GRANITE": "Snake" };
const RIVER_COUNTIES = /^(CHELAN|DOUGLAS|OKANOGAN|KLICKITAT|BENTON|FRANKLIN|WALLA WALLA|GRANT|KITTITAS|YAKIMA|SKAMANIA|CLARK|COWLITZ|WHITMAN|GARFIELD|ASOTIN|COLUMBIA)$/;
export function riverPool(l) { return RIVER_COUNTIES.test(l.county.toUpperCase()) ? RIVER_POOLS[l.core] || "" : ""; }
// The printed page of each entry, from scripts/pamphlet-pages.json.
export function pageKey(slug, e) { return slug + "|" + e.name + "|" + e.counties.join("/") + "|" + (e.sections[0] ? e.sections[0].note : ""); }
// Where an entry with no lake on the map lies: a plants code's point of the
// same name in its county, or its county, when every lake of the map in that
// county is in range (or out of it). Unsure is kept: a lake missing from a
// fish's list would read as having no rule of its own.
function entryRange(e, points, sites, countyKm) {
  const pc = core(e.name);
  const hits = [];
  for (const s of sites.values()) {
    if (!s.cores.has(pc) || !e.counties.some((c) => s.counties.has(c))) continue;
    const p = points.get(s.code);
    if (p && (p.cores.includes(pc) || s.cores.size === 1)) hits.push(km(p.lat, p.lon));
  }
  if (hits.length === 1) return { km: Math.round(hits[0]), in: inRange(hits[0]) };
  const st = e.counties.map((c) => countyKm[c]).filter(Boolean);
  if (st.length && st.every((x) => !inRange(x[0]))) return { km: null, in: false };
  return { km: null, in: true };
}

// ---- the whole build --------------------------------------------------------
// input: { lowland: [features], layers: { 4: [...], ... }, high: [features],
//          groups: [plants grouped], rows: [plant rows for the joined codes],
//          nas: [records], waters: [rigs/waters.js waters], year, built, at }
// rows may also be a function (codes) => rows, so the fetch asks only for
// the joined codes.
export async function build(input) {
  const log = [];
  const lakes = mapLakes(input.lowland);
  const species = mapSpecies(lakes, input.layers, log);
  const sites = plantSites(input.groups);
  const points = codePoints(input.waters, input.high);
  const joins = joinPlants(lakes, sites, points, input.waters, log);
  const codes = [...new Set([...joins.values()].flat().map((j) => j.code))].sort();
  const rows = typeof input.rows === "function" ? await input.rows(codes) : input.rows;
  const rowsBy = new Map();
  for (const r of rows || []) { const c = String(r.geo_code || "").trim(); rowsBy.set(c, (rowsBy.get(c) || []).concat(r)); }
  const nas = joinNas(lakes, input.nas, log);
  // the pamphlet: each entry, the map lake it names, and the ones in range with none
  const entries = [];
  for (const pg of input.pamphlet || []) for (const e of lakeEntries(pg.html)) entries.push({ e, w: PAMPHLET_PAGES.indexOf(pg.slug), slug: pg.slug });
  const named = joinPamphlet(lakes, entries.map((x) => x.e), log);
  const countyKm = {};
  for (const f of input.lowland || []) {
    const a = f.attributes || {}, g = f.geometry || {}, c = String(a.CountyName || "").trim().toUpperCase();
    if (!c || typeof g.y !== "number") continue;
    const d = km(g.y, g.x), was = countyKm[c];
    countyKm[c] = was ? [Math.min(was[0], d), Math.max(was[1], d)] : [d, d];
  }
  const unmapped = {};
  for (const s of sites.values()) for (const k of Object.keys(s.species)) if (!PLANT_SP[k]) unmapped[k] = (unmapped[k] || 0) + 1;
  for (const [k, n] of Object.entries(unmapped)) log.push(["plants", k, n + " lake codes", "not a fish the app shows: left out"]);


  // ids: name and county; two lakes of one name in a county also carry the map's id
  const ids = new Map(), seen = new Map();
  for (const l of lakes) { const k = slug(l.name + " " + l.county); seen.set(k, (seen.get(k) || 0) + 1); }
  for (const l of lakes) { const k = slug(l.name + " " + l.county); ids.set(l.oid, seen.get(k) > 1 ? k + "-" + l.oid : k); }
  // the rules, kept once: words (seasons, rules, parts), species cells and the fish each is about
  const words = [], wordAt = new Map(), labels = [], labelAt = new Map(), rules = [], ruleOf = new Map();
  const word = (t) => { if (!wordAt.has(t)) { wordAt.set(t, words.length); words.push(t); } return wordAt.get(t); };
  const label = (t) => {
    if (!labelAt.has(t)) { const f = labelFish(t); if (f === null) log.push(["pamphlet", t, "", "a species cell the build cannot read: shown, about no fish"]); labelAt.set(t, labels.length); labels.push([t, f]); }
    return labelAt.get(t);
  };
  const entryAt = new Map();
  entries.forEach((x, i) => {
    const ls = named.of[i], pe = readPamphletEntry(x.e), maybeHere = lakes.filter((l) => (named.maybe.get(l.oid) || []).includes(i));
    const near = ls.concat(maybeHere);
    const where = near.length ? { km: Math.round(Math.min(...near.map((l) => l.km))), in: true } : entryRange(x.e, points, sites, countyKm);
    if (!where.in) return;
    const page = (input.pages || {})[pageKey(x.slug, x.e)] || 0;
    if (!page) log.push(["pamphlet", x.e.name, x.slug, "no printed page found: shown with its web page only"]);
    const counties = x.e.counties.map((c) => c.toLowerCase().replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase()));
    // lake ids: the map lakes it is (one, or each of a plural heading's)
    const rec = [pe.name, pe.q, counties, page, x.w, x.e.ramp ? 1 : 0, x.e.noTwo ? 1 : 0, ls.map((l) => ids.get(l.oid)), where.km,
      pe.rows.map((r) => [label(r[0]), word(r[1]), word(r[2]), word(r[3])])];
    ls.forEach((l) => ruleOf.set(l.oid, rules.length));
    entryAt.set(i, rules.length);
    rules.push(rec);
  });
  // a lake the pamphlet may list under one of several entries: each of them
  const maybeOf = new Map();
  for (const [oid, list] of named.maybe) {
    const at = list.map((i) => entryAt.get(i)).filter((v) => v != null);
    if (at.length && !ruleOf.has(oid)) maybeOf.set(oid, at);
  }

  const out = [], count = {}, stocked = {}, how = {};
  let joined = 0;
  for (const l of lakes) {
    const fish = {}, j = joins.get(l.oid) || [];
    for (const id of species.get(l.oid) || []) (fish[id] = fish[id] || {}).m = 1;
    const mine = [];
    for (const { code, how: h } of j) {
      how[h] = (how[h] || 0) + 1; joined++;
      let other = 0;
      for (const r of rowsBy.get(code) || []) { if (rowFits(l.core, r.release_location)) mine.push(r); else other++; }
      if (other) log.push(["rows", l.name + " (" + l.county + ")", code, other + " plant rows under this code are named for another water: left out"]);
    }
    for (const [sp, p] of plantSummary(mine, input.year)) (fish[sp] = fish[sp] || {}).p = p;
    for (const [sp, r] of Object.entries(nas.get(l.oid) || {})) {
      // a gone record tags a fish that is here by the map or the plants; it never adds one
      if (!r.live && !fish[sp]) continue;
      (fish[sp] = fish[sp] || {}).u = [r.y, r.st || ""];
    }
    const f = Object.keys(fish).sort().map((sp) => {
      const x = fish[sp], o = [sp, x.m ? 1 : 0, x.p ? x.p.slice(0, 3).concat([LIFE(x.p[3])], x.p.slice(4)) : 0, x.u ? [x.u[0], NAS_ST[x.u[1]] || "?"] : 0];
      while (o.length > 1 && !o[o.length - 1]) o.pop();
      count[sp] = (count[sp] || 0) + 1;
      if (x.p) stocked[sp] = (stocked[sp] || 0) + 1;
      return o;
    });
    const lake = { id: ids.get(l.oid), n: l.name, c: l.county, km: Math.round(l.km), p: [Math.round(l.lat * 1e4) / 1e4, Math.round(l.lon * 1e4) / 1e4] };
    if (l.acres != null) lake.a = Math.round(l.acres * 10) / 10;
    if (l.type) lake.t = l.type;
    lake.sh = l.shore; lake.r = l.ramp;
    if (ruleOf.has(l.oid)) lake.pr = ruleOf.get(l.oid);
    else if (maybeOf.has(l.oid)) lake.pm = maybeOf.get(l.oid);
    const rv = riverPool(l);
    if (rv) lake.rv = rv;
    if (j.length) lake.g = j.map((x) => [x.code, x.how]);
    lake.f = f;
    out.push(lake);
  }
  // what each source gave, to hold a new build up against the last one
  const n = { lakes: out.length, mapped: out.reduce((t, l) => t + l.f.filter((x) => x[1]).length, 0),
    stocked: out.reduce((t, l) => t + l.f.filter((x) => x[2]).length, 0), usgs: out.reduce((t, l) => t + l.f.filter((x) => x[3]).length, 0),
    high: (input.high || []).length, rules: rules.length };
  const data = { built: input.built, year: input.year, km: KM, home: HOME, at: input.at || {}, n, lakes: out,
    rules: { url: PAMPHLET, pdf: PAMPHLET_PDF, pages: PAMPHLET_PAGES, labels, words, e: rules },
    // per fish: lakes it is in (any source), lakes it was stocked in, and the high lakes count
    fish: Object.fromEntries(Object.keys(count).sort().map((sp) => [sp, { lakes: count[sp], stocked: stocked[sp] || 0 }])),
    high: highLakes(input.high) };
  const left = log.filter((x) => x[0] === "plants" && /left out/.test(x[3]) && !/not a fish/.test(x[3])).length;
  const summary = { lakes: out.length, withFish: out.filter((l) => l.f.length).length, species: Object.keys(count).length,
    plantCodesJoined: joined, joins: how, joinsLeftOut: left, nasTagged: out.reduce((s, l) => s + l.f.filter((x) => x[3]).length, 0),
    pamphletLakes: entries.length, pamphletInRange: rules.length, pamphletJoined: out.filter((l) => l.pr != null).length, pamphletMaybe: out.filter((l) => l.pm).length,
    riverPools: out.filter((l) => l.rv).map((l) => l.n), unmapped, logLines: log.length };
  return { data, log, summary };
}

export function render(data) {
  return "// Built by scripts/build-lakes.mjs on " + data.built + ". Do not edit by hand.\n" +
    "// Every lake within " + data.km + " km of Bonney Lake on WDFW's Fish Washington map, the fish the map\n" +
    "// lists in it, WDFW's plants into it (data.wa.gov 6fex-3r7d) and USGS NAS records of fish brought in.\n" +
    "// lakes[].f: [fish, 1 if on the WDFW map, plants: [last plant, fish, fish per lb, life stage (L legal size,\n" +
    "// G fingerling, Y yearling, S smolt, F fry), plants, first year, plants this year, fish this year],\n" +
    "// USGS record: [year, status (e established, s stocked, c collected, u unknown, f failed, x gone)]].\n" +
    "// lakes[].g: the plants codes and how each was joined (code, point, township, kind, name).\n" +
    "// lakes[].pr: its entry in rules.e (the 2026-27 pamphlet's lake rules); lakes[].pm: the entries it might be (two of one\n" +
    "// name); lakes[].rv: a Columbia or Snake pool (a river in the pamphlet). rules.e: [name, words under the heading,\n" +
    "// counties, printed page, web page (rules.pages), public boat ramp icon, no two-pole icon, lake ids, km,\n" +
    "// rows: [species cell (rules.labels: [cell, fish]), season, rule, part\n" +
    "// of the lake (rules.words)]]. Every rule is the pamphlet's own words.\n" +
    "(function (root) {\n  var RIG = (root.RIG = root.RIG || {});\n  RIG.lakesData = " + JSON.stringify(data) + ";\n" +
    "  if (RIG.lakes && RIG.lakes.add) RIG.lakes.add(RIG.lakesData);\n})(typeof window !== \"undefined\" ? window : globalThis);\n";
}

// The app's own feed, read from rigs/waters.js on disk (no fetch). A file
// the build cannot read stops it: the code joins would otherwise fall back
// to names without a word.
export function feedWaters(text) {
  const m = /RIG\.watersSnapshot\s*=\s*(\{[\s\S]*?\});\n/.exec(String(text || ""));
  let w = null;
  try { w = m ? JSON.parse(m[1]).waters : null; } catch (e) { w = null; }
  if (!Array.isArray(w) || !w.length) throw new Error("rigs/waters.js: no RIG.watersSnapshot waters the build can read");
  return w;
}

// ---- fetching -----------------------------------------------------------------
const UA = { "User-Agent": "RigCard lakes build (coachpilot.org/rigs)" };
async function getJson(url, get) {
  const r = await get(url, { headers: UA });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
async function getText(url, get) {
  const r = await get(url, { headers: UA });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.text();
}
async function layer(n, get, fields, least) {
  const u = MAP + "/" + n + "/query?where=1%3D1&outFields=" + encodeURIComponent(fields || "*") + "&returnGeometry=true&outSR=4326&f=json";
  const j = await getJson(u, get);
  if (!Array.isArray(j.features)) throw new Error("map layer " + n + ": " + JSON.stringify(j).slice(0, 200));
  if (j.exceededTransferLimit) throw new Error("map layer " + n + " came back cut short");
  if (j.features.length < (least || 1)) throw new Error("map layer " + n + " came back with " + j.features.length + " points: not the whole layer");
  return j.features;
}
function soql(params) { return PLANTS + "?" + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&"); }

// min: the least a whole answer can hold (a half-loaded answer is not a
// smaller map, an empty one is not a lake with no fish). The tests' recorded
// answers are small on purpose and pass their own.
//   groups  plants groups (lake code x name x species): 5,285 on 2026-11-27
//   lakes   lakes in range: 456
//   nas     USGS Washington fish records: 3,097
//   high    High Lakes layer points: about 1,080
//   layer   points on each species layer (the fewest, tiger muskie, has 7)
//   rows    plant rows for the joined codes
//   pamphlet lakes on each pamphlet page (64 to 88)
export const MIN = { groups: 1000, lakes: 100, nas: 2500, high: 900, layer: 5, rows: 5000, pamphlet: 50 };
const PAGE_SIZE = 50000;
export async function fetchAll(get, { year, built, min = MIN } = {}) {
  const lowland = await layer(2, get, "*", min.lakes);
  const layers = {};
  for (const n of Object.keys(LAYERS)) layers[n] = await layer(n, get, "OBJECTID,LakeName,CountyName", min.layer);
  const high = await layer(21, get, "*", min.high);
  const groups = await getJson(soql({ $select: "geo_code,release_location,county,species,count(*) as plants", $where: "starts_with(geo_code,'L')",
    $group: "geo_code,release_location,county,species", $limit: String(PAGE_SIZE) }), get);
  if (!Array.isArray(groups) || groups.length < min.groups) throw new Error("plants: " + JSON.stringify(groups).slice(0, 200));
  if (groups.length >= PAGE_SIZE) throw new Error("plants groups came back cut short at " + PAGE_SIZE);
  const meta = await getJson(PLANTS_META, get).catch(() => ({}));
  // USGS: every page until it says it is done. A page that answers with an
  // error, or with a count that is not what it holds, stops the build.
  const nas = [];
  let done = false;
  for (let off = 0; off < 20000; off += 1000) {
    const j = await getJson(NAS + "&limit=1000&offset=" + off, get);
    if (!j || !Array.isArray(j.results)) throw new Error("USGS NAS: " + JSON.stringify(j).slice(0, 200));
    if (j.count != null && +j.count !== j.results.length) throw new Error("USGS NAS: a page says " + j.count + " records and holds " + j.results.length);
    nas.push(...j.results);
    if (String(j.endOfRecords) === "true") { done = true; break; }
    if (!j.results.length) throw new Error("USGS NAS: an empty page before the end of the records");
  }
  if (!done) throw new Error("USGS NAS: more than 20,000 records, not read to the end");
  if (nas.length < min.nas) throw new Error("USGS NAS: only " + nas.length + " Washington fish records came back");
  // the pamphlet's six lake pages, each read whole
  const pamphlet = [];
  for (const slug of PAMPHLET_PAGES) {
    const html = await getText(PAMPHLET + slug, get), n = lakeEntries(html).length;
    if (!/<\/html>/i.test(html) || n < min.pamphlet) throw new Error(slug + " did not load as the whole lake table: " + n + " lakes read");
    pamphlet.push({ slug, html });
  }
  const rows = async (codes) => {
    const out = [];
    for (let i = 0; i < codes.length; i += 80) {
      const part = codes.slice(i, i + 80);
      const got = await getJson(soql({ $select: "geo_code,release_location,species,release_start_date,number_released,number_of_fish_per_pound,lifestage",
        $where: "geo_code in(" + part.map((c) => "'" + c + "'").join(",") + ")", $limit: String(PAGE_SIZE) }), get);
      if (!Array.isArray(got)) throw new Error("plant rows: " + JSON.stringify(got).slice(0, 200));
      if (got.length >= PAGE_SIZE) throw new Error("plant rows came back cut short");
      out.push(...got);
    }
    if (out.length < min.rows) throw new Error("plant rows: only " + out.length + " came back for " + codes.length + " lake codes");
    return out;
  };
  const at = { plants: meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString().slice(0, 10) : "", map: built, nas: built, rules: built };
  return { lowland, layers, high, groups, rows, nas, pamphlet, year, built, at };
}

// The last good file's data, to hold a new build up against.
export function readData(text) {
  const m = /RIG\.lakesData = (\{[\s\S]*\});\n  if \(RIG\.lakes/.exec(String(text || ""));
  try { return m ? JSON.parse(m[1]) : null; } catch (e) { return null; }
}
// What a build may not lose against the last one: more than a tenth of the
// lakes, the map's listings, the plants, the USGS tags or the pamphlet
// entries. A source that answered empty but OK lands here.
export const DROP = 0.1;
export function shrinkage(next, last) {
  if (!last || !(last.lakes || last.n)) return [];
  const count = (d) => d.n || { lakes: d.lakes.length, mapped: d.lakes.reduce((t, l) => t + l.f.filter((x) => x[1]).length, 0),
    stocked: d.lakes.reduce((t, l) => t + l.f.filter((x) => x[2]).length, 0), usgs: d.lakes.reduce((t, l) => t + l.f.filter((x) => x[3]).length, 0) };
  const a = count(next), b = count(last), out = [];
  for (const k of ["lakes", "mapped", "stocked", "usgs", "high", "rules"]) {
    if (b[k] == null || a[k] == null) continue;
    if (a[k] < b[k] * (1 - DROP)) out.push(k + " " + b[k] + " to " + a[k]);
  }
  return out;
}

export async function main({ dry = false, force = false, get = fetch, out = resolve(ROOT, "rigs/lakes.js"), waters = null, pages = null, now = new Date(), print = console.log, min = MIN } = {}) {
  const built = now.toISOString().slice(0, 10), year = +built.slice(0, 4);
  const input = await fetchAll(get, { year, built, min });
  input.waters = waters || feedWaters(readFileSync(resolve(ROOT, "rigs/waters.js"), "utf8"));
  input.pages = pages || JSON.parse(readFileSync(resolve(ROOT, "scripts/pamphlet-pages.json"), "utf8"));
  const { data, log, summary } = await build(input);
  // A map that came back with almost nothing is a broken answer, not a new map:
  // the last good file stays.
  if (data.lakes.length < min.lakes) throw new Error("only " + data.lakes.length + " lakes in range: the map did not load whole");
  const lost = shrinkage(data, existsSync(out) ? readData(readFileSync(out, "utf8")) : null);
  summary.lost = lost;
  const js = render(data);
  summary.bytes = js.length;
  if (dry) {
    print(JSON.stringify(summary, null, 1));
    log.forEach((x) => print(x.join("  |  ")));
    return { data, log, summary, wrote: false };
  }
  if (lost.length && !force) throw new Error("this build would lose " + lost.join(", ") + " against " + out + ": a source answered short. Nothing written (--force to write it anyway)");
  // written whole or not at all
  const tmp = out + ".tmp";
  try { writeFileSync(tmp, js); renameSync(tmp, out); } catch (e) { try { unlinkSync(tmp); } catch (e2) { /* none */ } throw e; }
  print(JSON.stringify(summary, null, 1));
  log.filter((x) => /left out/.test(x[3])).forEach((x) => print(x.join("  |  ")));
  return { data, log, summary, wrote: true };
}

// Run only as a script. Importing this file (the tests do) fetches nothing and writes nothing.
let asScript = false;
try { asScript = !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { asScript = false; }
if (asScript) await main({ dry: process.argv.includes("--dry"), force: process.argv.includes("--force") });
