// Builds rigs/lakes.js: every lake in range of Bonney Lake on WDFW's Fish
// Washington map, the fish WDFW's map lists in it, the plants WDFW made into
// it, and where USGS has a record of a fish brought into it.
//
// Run: node scripts/build-lakes.mjs          (fetches, writes rigs/lakes.js)
//      node scripts/build-lakes.mjs --dry    (fetches, prints a summary, writes nothing)
//
// Sources (nothing else is read):
//   WDFW Fish Washington map service, FishWA_2014_AllLakes_PROD:
//     layer 2 Lowland Lakes (name, county, acres, elevation, management type,
//     shoreline access, boat ramp, point), layers 4 to 18 (one per species,
//     the same points), layer 21 High Lakes (lake code, point, species).
//   data.wa.gov WDFW Fish Plants (6fex-3r7d), nightly: every plant, by lake code.
//   USGS Nonindigenous Aquatic Species API: Washington fish records.
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
import { realpathSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
export function core(s) {
  return String(s || "").toUpperCase().replace(/\(.*?\)/g, " ").replace(/\bT\d+\b/g, " ").replace(/['’.]/g, "")
    .replace(/[^A-Z0-9]+/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();
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
  const c = core(loc);
  return !!lakeCore && (c === lakeCore || c.indexOf(lakeCore + " ") === 0);
}
export function slug(s) { return String(s || "").toLowerCase().replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
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
    if (d > KM) continue;
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
      if (typeof g.y !== "number" || km(g.y, g.x) > KM) continue;
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
    if (loc) { s.names.add(loc); s.cores.add(core(loc)); countiesOfName(loc).forEach((c) => s.counties.add(c)); }
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
    if (d > KM) continue;
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
  const unmapped = {};
  for (const s of sites.values()) for (const k of Object.keys(s.species)) if (!PLANT_SP[k]) unmapped[k] = (unmapped[k] || 0) + 1;
  for (const [k, n] of Object.entries(unmapped)) log.push(["plants", k, n + " lake codes", "not a fish the app shows: left out"]);

  // ids: name and county; two lakes of one name in a county also carry the map's id
  const ids = new Map(), seen = new Map();
  for (const l of lakes) { const k = slug(l.name + " " + l.county); seen.set(k, (seen.get(k) || 0) + 1); }
  for (const l of lakes) { const k = slug(l.name + " " + l.county); ids.set(l.oid, seen.get(k) > 1 ? k + "-" + l.oid : k); }

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
    if (j.length) lake.g = j.map((x) => [x.code, x.how]);
    lake.f = f;
    out.push(lake);
  }
  const data = { built: input.built, year: input.year, km: KM, home: HOME, at: input.at || {}, lakes: out,
    // per fish: lakes it is in (any source), lakes it was stocked in, and the high lakes count
    fish: Object.fromEntries(Object.keys(count).sort().map((sp) => [sp, { lakes: count[sp], stocked: stocked[sp] || 0 }])),
    high: highLakes(input.high) };
  const left = log.filter((x) => x[0] === "plants" && /left out/.test(x[3]) && !/not a fish/.test(x[3])).length;
  const summary = { lakes: out.length, withFish: out.filter((l) => l.f.length).length, species: Object.keys(count).length,
    plantCodesJoined: joined, joins: how, joinsLeftOut: left, nasTagged: out.reduce((s, l) => s + l.f.filter((x) => x[3]).length, 0),
    unmapped, logLines: log.length };
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
    "(function (root) {\n  var RIG = (root.RIG = root.RIG || {});\n  RIG.lakesData = " + JSON.stringify(data) + ";\n" +
    "  if (RIG.lakes && RIG.lakes.add) RIG.lakes.add(RIG.lakesData);\n})(typeof window !== \"undefined\" ? window : globalThis);\n";
}

// The app's own feed, read from rigs/waters.js on disk (no fetch).
export function feedWaters(text) {
  const m = /RIG\.watersSnapshot\s*=\s*(\{[\s\S]*?\});\n/.exec(String(text || ""));
  try { return m ? JSON.parse(m[1]).waters || [] : []; } catch (e) { return []; }
}

// ---- fetching -----------------------------------------------------------------
const UA = { "User-Agent": "RigCard lakes build (coachpilot.org/rigs)" };
async function getJson(url, get) {
  const r = await get(url, { headers: UA });
  if (!r.ok) throw new Error(url + " " + r.status);
  return r.json();
}
async function layer(n, get, fields) {
  const u = MAP + "/" + n + "/query?where=1%3D1&outFields=" + encodeURIComponent(fields || "*") + "&returnGeometry=true&outSR=4326&f=json";
  const j = await getJson(u, get);
  if (!Array.isArray(j.features)) throw new Error("map layer " + n + ": " + JSON.stringify(j).slice(0, 200));
  if (j.exceededTransferLimit) throw new Error("map layer " + n + " came back cut short");
  return j.features;
}
function soql(params) { return PLANTS + "?" + Object.entries(params).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&"); }

// min: the least a whole answer can hold (a half-loaded answer is not a
// smaller map). The tests' recorded answers are small on purpose.
export const MIN = { groups: 1000, lakes: 100 };
export async function fetchAll(get, { year, built, min = MIN } = {}) {
  const lowland = await layer(2, get);
  const layers = {};
  for (const n of Object.keys(LAYERS)) layers[n] = await layer(n, get, "OBJECTID,LakeName,CountyName");
  const high = await layer(21, get);
  const groups = await getJson(soql({ $select: "geo_code,release_location,county,species,count(*) as plants", $where: "starts_with(geo_code,'L')",
    $group: "geo_code,release_location,county,species", $limit: "50000" }), get);
  if (!Array.isArray(groups) || groups.length < min.groups) throw new Error("plants: " + JSON.stringify(groups).slice(0, 200));
  const meta = await getJson(PLANTS_META, get).catch(() => ({}));
  const nas = [];
  for (let off = 0; off < 20000; off += 1000) {
    const j = await getJson(NAS + "&limit=1000&offset=" + off, get);
    nas.push(...(j.results || []));
    if (String(j.endOfRecords) === "true" || !(j.results || []).length) break;
  }
  const rows = async (codes) => {
    const out = [];
    for (let i = 0; i < codes.length; i += 80) {
      const part = codes.slice(i, i + 80);
      const got = await getJson(soql({ $select: "geo_code,release_location,species,release_start_date,number_released,number_of_fish_per_pound,lifestage",
        $where: "geo_code in(" + part.map((c) => "'" + c + "'").join(",") + ")", $limit: "50000" }), get);
      if (!Array.isArray(got)) throw new Error("plant rows: " + JSON.stringify(got).slice(0, 200));
      if (got.length >= 50000) throw new Error("plant rows came back cut short");
      out.push(...got);
    }
    return out;
  };
  const at = { plants: meta.rowsUpdatedAt ? new Date(meta.rowsUpdatedAt * 1000).toISOString().slice(0, 10) : "", map: built, nas: built };
  return { lowland, layers, high, groups, rows, nas, year, built, at };
}

export async function main({ dry = false, get = fetch, out = resolve(ROOT, "rigs/lakes.js"), waters = null, now = new Date(), print = console.log, min = MIN } = {}) {
  const built = now.toISOString().slice(0, 10), year = +built.slice(0, 4);
  const input = await fetchAll(get, { year, built, min });
  input.waters = waters || feedWaters(readFileSync(resolve(ROOT, "rigs/waters.js"), "utf8"));
  const { data, log, summary } = await build(input);
  // A map that came back with almost nothing is a broken answer, not a new map:
  // the last good file stays.
  if (data.lakes.length < min.lakes) throw new Error("only " + data.lakes.length + " lakes in range: the map did not load whole");
  const js = render(data);
  summary.bytes = js.length;
  if (dry) {
    print(JSON.stringify(summary, null, 1));
    log.forEach((x) => print(x.join("  |  ")));
    return { data, log, summary, wrote: false };
  }
  writeFileSync(out, js);
  print(JSON.stringify(summary, null, 1));
  log.filter((x) => /left out/.test(x[3])).forEach((x) => print(x.join("  |  ")));
  return { data, log, summary, wrote: true };
}

// Run only as a script. Importing this file (the tests do) fetches nothing and writes nothing.
let asScript = false;
try { asScript = !!process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); } catch (e) { asScript = false; }
if (asScript) await main({ dry: process.argv.includes("--dry") });
