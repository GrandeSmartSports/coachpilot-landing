// The lakes build (scripts/build-lakes.mjs) on recorded answers, and the
// lake fish file (rigs/lakefish.js) it is read with.
// Run: node tests/rigs-lakes.test.mjs
//
// What this guards: the build reads WDFW's map, WDFW's plants, USGS's
// records and the pamphlet's six lake pages the way they answer
// (tests/fixtures/lakes: real answers, trimmed), with no network; it joins
// plants to a lake only when sure (the app's own code, a point that is this
// lake, a township, the kind of water, a name that is the only one in its
// county, a numbered lake, the plants' own short words) and leaves the rest
// out, logged; a plant row named for another water under the same code is
// not this lake's; a USGS record joins only the one lake its place names;
// each pamphlet entry joins the lake it names (the words under its heading,
// the kind of water) with its seasons, its parts and its printed page, and
// one it cannot tell apart says so; a Columbia pool is a river, and only in
// its own counties at a pool's size (Lake Sacajawea in Longview is a lake);
// an entry's printed page is the page with its whole heading; tags are
// stocked, in the lake and introduced, never wild or native; Lake Tapps has
// its tiger muskie, planted May 5, 2026, with the 50 inch rule from the
// pamphlet; a source that answers empty, short or with an error stops the
// build, and a build that would lose a tenth of a source writes nothing; the
// dry run writes nothing; a build is stamped with the day in Pacific time;
// and the committed rigs/lakes.js is the build's.
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as L from "../scripts/build-lakes.mjs";
import * as P from "../scripts/pamphlet-pages.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FX = join(ROOT, "tests/fixtures/lakes");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 600)); }
};
const fx = (f) => JSON.parse(readFileSync(join(FX, f), "utf8"));

// ---- the recorded answers, served by URL the way the sources answer -----------
const lowland = fx("lowland.json"), layers = fx("layers.json"), high = fx("high.json"), groups = fx("groups.json"), rows = fx("rows.json"),
  nas = fx("nas.json"), meta = fx("meta.json"), waters = fx("waters.json");
const pamphlet = Object.fromEntries(L.PAMPHLET_PAGES.map((p) => [p, readFileSync(join(FX, "pamphlet", p + ".html"), "utf8")]));
const asked = [];
const answer = (body) => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)), text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
// A source broken the way sources break: o.nas, o.layer, o.rows, o.high, o.page swap in an answer.
function getter(o = {}) {
  return async function get(url) {
    asked.push(url);
    const u = new URL(url);
    if (!["geodataservices.wdfw.wa.gov", "data.wa.gov", "nas.er.usgs.gov", "www.eregulations.com"].includes(u.hostname)) throw new Error("not a source: " + url);
    if (/wdfw\.wa\.gov$/.test(u.hostname) && u.hostname !== "geodataservices.wdfw.wa.gov") throw new Error("wdfw.wa.gov is off limits");
    const layer = /\/MapServer\/(\d+)\/query$/.exec(u.pathname);
    if (layer) {
      if (o.layer && o.layer[layer[1]]) return answer(o.layer[layer[1]]);
      return answer(layer[1] === "2" ? lowland : layer[1] === "21" ? (o.high || high) : layers[layer[1]] || { features: [] });
    }
    if (u.pathname === "/api/views/6fex-3r7d.json") return answer(meta);
    if (u.pathname === "/resource/6fex-3r7d.json") {
      if (u.searchParams.get("$group")) return answer(groups);
      if (o.rows) return answer(o.rows);
      const codes = (/in\(([^)]*)\)/.exec(u.searchParams.get("$where") || "") || [, ""])[1].split(",").map((c) => c.replace(/'/g, "").trim());
      return answer(rows.filter((r) => codes.includes(r.geo_code)));
    }
    if (u.hostname === "nas.er.usgs.gov") {
      const off = +u.searchParams.get("offset") || 0;
      if (o.nas) return answer(typeof o.nas === "function" ? o.nas(off) : o.nas);
      return answer({ endOfRecords: "true", count: off ? 0 : nas.length, results: off ? [] : nas });
    }
    if (u.hostname === "www.eregulations.com") {
      const slug = u.pathname.split("/").pop();
      if (o.page && o.page[slug] != null) return answer(o.page[slug]);
      if (pamphlet[slug]) return answer(pamphlet[slug]);
    }
    throw new Error("unexpected " + url);
  };
}
const get = getter();
const NOW = new Date("2026-11-27T20:00:00Z");
const MIN = { groups: 10, lakes: 5, nas: 5, high: 5, layer: 1, rows: 5, pamphlet: 1 };
const lines = [];
const run = await L.main({ dry: true, get, waters, now: NOW, print: (s) => lines.push(s), min: MIN });
const D = run.data, byName = (n, c) => D.lakes.find((l) => l.n === n && (!c || l.c === c));
const fish = (l, id) => l && l.f.find((x) => x[0] === id);

// ---- reading the sources -------------------------------------------------------
ok(run.wrote === false && asked.length > 0 && asked.every((u) => !/(^|\/\/)(www\.)?wdfw\.wa\.gov\//.test(u)), "a dry run reads only the allowed sources and writes nothing", asked.filter((u) => /wdfw\.wa\.gov/.test(u) && !/geodataservices/.test(u)));
ok(L.PAMPHLET_PAGES.every((p) => asked.includes(L.PAMPHLET + p)), "it reads the pamphlet's six lake pages from eregulations.com");
ok(lines.length > 0 && /"lakes":/.test(lines[0].replace(/\s/g, "")), "the dry run prints a summary", lines[0]);
ok(!byName("Curlew Lake") && D.lakes.every((l) => l.km <= L.KM), "only lakes within 230 km of Bonney Lake (Curlew Lake, Ferry County, is out)", D.lakes.map((l) => l.n + " " + l.km));
ok(D.lakes.every((l, i) => !i || D.lakes[i - 1].km <= l.km), "lakes come nearest first");
const tapps = byName("Lake Tapps", "Pierce");
ok(tapps && tapps.id === "lake-tapps-pierce" && tapps.a === 2433.1 && tapps.t === "W" && tapps.sh === 1 && tapps.r === 1 && tapps.km === 4,
  "Lake Tapps: its name, county, acres, warmwater emphasis, shore access, boat ramp and distance from the map", tapps);
ok(run.log.some((x) => x[0] === "map" && /does not match a lake on layer 2/.test(x[3])), "a species point the map cannot place on a lake is left out and logged");

// ---- Tapps and its tiger muskie ------------------------------------------------
const mu = fish(tapps, "muskie");
ok(mu && mu[1] === 1, "the map lists tiger muskie in Lake Tapps", mu);
ok(mu && mu[2] && mu[2][0] === "2026-05-05" && mu[2][1] === 1631 && mu[2][3] === "L" && mu[2][4] === 21 && mu[2][5] === 2000 && mu[2][6] === 1 && mu[2][7] === 1631,
  "Tapps' last tiger muskie plant: 1,631 legal size on May 5, 2026, the 21st since 2000, one plant this year", mu && mu[2]);
ok(mu && mu[3] && mu[3][1] === "s", "and USGS has a record of them stocked there (introduced)", mu && mu[3]);
ok(["bass", "smallmouth", "crappie", "perch"].every((id) => fish(tapps, id) && fish(tapps, id)[1] === 1), "the map's other Tapps fish: largemouth, smallmouth, crappie, perch", tapps.f.map((x) => x[0]));
ok((tapps.g || []).some((g) => g[0] === "L4499" && g[1] === "name"), "Tapps' plants joined by name in its county (L4499, the plants data's own code)", tapps.g);

// ---- the joins -------------------------------------------------------------------
const bonney = byName("Bonney Lake", "Pierce");
ok(bonney && bonney.g && bonney.g[0][0] === "L466" && bonney.g[0][1] === "code", "Bonney Lake joins by the code the app already has (rigs/waters.js L466)", bonney && bonney.g);
const longL = byName("Long Lake", "Thurston"), longP = byName("Long's Pond", "Thurston");
ok(longL && longL.g.some((g) => g[0] === "L2818" && g[1] === "code") && longP && longP.g.some((g) => g[0] === "L2818" && g[1] === "name"),
  "one code with two waters' names under it (LONG LK, LONGS PD): each lake takes it", [longL && longL.g, longP && longP.g]);
ok(longL && longP && fish(longL, "trout")[2][0] !== fish(longP, "trout")[2][0], "and each takes only the rows named for it", [fish(longL, "trout"), fish(longP, "trout")]);
ok(run.log.some((x) => x[0] === "rows" && /Long Lake/.test(x[1]) && /named for another water/.test(x[3])), "the rows named for the other water are logged");
const echoes = D.lakes.filter((l) => l.n === "Echo Lake" && l.c === "Snohomish");
ok(echoes.length === 2 && new Set(echoes.map((l) => l.id)).size === 2 && echoes.every((l) => /-\d+$/.test(l.id)), "two lakes of one name in a county get ids of their own", echoes.map((l) => l.id));
ok(echoes.every((l) => (l.g || []).length === 1 && l.g[0][1] === "township") && echoes[0].g[0][0] !== echoes[1].g[0][0],
  "the two Echo Lakes in Snohomish County are told apart by the township in the plants name (T27, T29)", echoes.map((l) => [l.p, l.g]));
const lost = D.lakes.filter((l) => /^Lost/.test(l.n) && l.c === "Snohomish");
ok(lost.length === 3 && lost.every((l) => !(l.g || []).some((g) => g[0] === "L1071")), "three Lost Lakes and one LOST (MALTBY) LK code: no guess, left out", lost.map((l) => [l.n, l.g]));
ok(run.log.filter((x) => x[2] && /L1071/.test(x[2]) && /not sure which, left out/.test(x[3])).length === 3, "and each is logged");
const milkL = byName("Milk Lake", "Kittitas"), milkP = byName("Milk Pond", "Kittitas");
ok(milkL && milkP && milkL.g && milkP.g && milkL.g[0][0] === "L3119" && milkP.g[0][0] === "L5315" && milkL.g[0][1] === "kind",
  "Milk Lake and Milk Pond: the kind of water in both names tells them apart", [milkL && milkL.g, milkP && milkP.g]);
const alice = byName("Lake Alice", "King");
ok(alice && alice.g.length === 1 && alice.g[0][0] === "L70" && run.log.some((x) => /Lake Alice/.test(x[1]) && /L3350/.test(x[2]) && /km away: another lake/.test(x[3])),
  "a plants code of the same name whose point is far away is another lake (ALICE LKS, a high lake 25 km off)", alice && alice.g);
const easton = byName("Lake Easton", "Kittitas"), epond = byName("Easton Ponds", "Kittitas");
ok(easton && epond && easton.g[0][0] === "L1126" && epond.g[0][0] === "L1127", "Lake Easton and Easton Ponds each get their own code", [easton && easton.g, epond && epond.g]);
ok(D.lakes.every((l) => (l.g || []).every((g) => ["code", "point", "township", "kind", "name"].includes(g[1]))), "every join says how it was made");
const codes = {};
D.lakes.forEach((l) => (l.g || []).forEach((g) => (codes[g[0]] = (codes[g[0]] || []).concat(l.n))));
ok(Object.entries(codes).every(([c, ns]) => ns.length === 1 || new Set(ns.map((n) => L.core(n))).size === ns.length), "no code sits on two lakes of the same name", codes);

// ---- the plants data's other ways of naming a lake (M1) -----------------------------
const klone = byName("Klone Lake 1", "Grays Harbor"), wb = byName("Martha Warm Beach", "Snohomish"), am = byName("Martha Alderwood Manor", "Snohomish"), upr = byName("Starzman Lake Upper", "Okanogan");
ok(klone && (klone.g || []).some((g) => g[0] === "L2661") && fish(klone, "trout") && fish(klone, "trout")[2], "Klone Lake 1 takes KLONE LKS (1), L2661, and its rainbow plants", klone);
ok(wb && (wb.g || []).some((g) => g[0] === "L3219") && fish(wb, "browntrout")[2][0] === "2026-10-26" && fish(wb, "cutthroat")[2][0] === "2026-05-20" && fish(wb, "trout")[2][0] === "2026-05-04",
  "Martha Warm Beach takes MARTHA LK (WB), L3219: brown trout Oct 26, cutthroat May 20, rainbow May 4, 2026", wb && wb.f);
ok(am && (am.g || []).some((g) => g[0] === "L3217") && !(am.g || []).some((g) => g[0] === "L3219"), "and Martha Alderwood Manor takes (AM), L3217, not Warm Beach's", am && am.g);
ok(upr && (upr.g || []).some((g) => g[0] === "L4070") && fish(upr, "brooktrout")[2][0] === "2026-04-08", "Starzman Lake Upper takes STARZMAN LK UPR, L4070: brook trout Apr 8, 2026", upr);
ok(L.cores("EASTON PD (3) (KITT)").includes("EASTON") && easton && epond && epond.g[0][0] === "L1127", "a bracketed number alone does not move a pond off its name (EASTON PD (3) is still Easton Ponds)");

// ---- the range: rounded first, the way the castai-waters feed counts it (L1) ---------
ok(L.inRange(230.48) && L.inRange(229.9) && !L.inRange(230.5) && !L.inRange(231), "a lake 230.48 km off is in range (the feed rounds first); 230.5 is not");

// ---- the pamphlet: each lake's own rules, joined to its lake --------------------------
const R = D.rules, entry = (l) => (l && l.pr != null ? R.e[l.pr] : null), rowsOf = (e) => e[9].map((r) => [R.labels[r[0]][0], R.words[r[1]], R.words[r[2]], R.words[r[3]]]);
const et = entry(tapps);
ok(et && et[0] === "Lake Tapps" && et[3] === 89 && et[5] === 1 && et[6] === 0 && rowsOf(et).some((r) => r[0] === "All game fish" && r[1] === "Year-round" && /^Statewide min/.test(r[2])),
  "Lake Tapps: its entry, printed page 89, the public boat ramp icon, all game fish year-round at statewide limits", et);
const ewb = entry(wb), eam = entry(am);
ok(ewb && ewb[1] === "Warm Beach" && rowsOf(ewb).some((r) => r[0] === "Trout" && r[2] === 'Min. size 14". Daily limit 2.') && rowsOf(ewb).some((r) => r[2] === "Selective gear rules."),
  "Martha Warm Beach gets MARTHA LAKE, Warm Beach: trout 14 inches, 2 a day, selective gear (I3)", ewb);
ok(eam && eam[1] === "Alderwood Manor" && rowsOf(eam).some((r) => r[1] === "4th Sat. in Apr.-Oct. 31"), "and Martha Alderwood Manor its own entry and season", eam);
ok(entry(easton) && entry(easton)[0] === "Easton Lake" && !entry(epond) && epond.pm == null, "Easton Lake is Lake Easton's, not Easton Ponds' (M2)", [entry(easton), entry(epond)]);
const baker = byName("Baker Lake", "Whatcom"), eb = entry(baker);
ok(eb && rowsOf(eb).some((r) => r[0] === "Salmon" && r[1] === "July 11-Aug. 31") && rowsOf(eb).some((r) => r[0] === "Kokanee" && r[1] === "4th Sat. in Apr.-Oct. 31"),
  "Baker Lake keeps every season: salmon July 11-Aug. 31, kokanee 4th Sat. in Apr.-Oct. 31 (C3, I1)", eb && rowsOf(eb));
ok(eb && rowsOf(eb).some((r) => r[2] === "CLOSED WATERS." && /pump discharge/.test(r[3])) && rowsOf(eb).filter((r) => r[0] !== "All species" || r[2] !== "CLOSED WATERS.").every((r) => r[3] === ""),
  "and its closed stretch keeps its part (200' around the pump discharge); the lake's own rows have none", eb && rowsOf(eb));
const riffe = byName("Riffe Lake", "Lewis"), er = entry(riffe);
ok(er && rowsOf(er).some((r) => r[2] === "CLOSED WATERS." && /Cowlitz Falls Dam downstream/.test(r[3])) && rowsOf(er).some((r) => r[0] === "All game fish" && /Mossyrock Dam/.test(r[3])),
  "Riffe Lake: only the stretch below Cowlitz Falls Dam is closed waters, and it says which stretch (C2)", er && rowsOf(er));
const entiat = byName("Lake Entiat", "Douglas");
ok(entiat && entiat.rv === "Columbia" && entiat.pr == null, "Lake Entiat is the Columbia, a river in the pamphlet, with no lake rule (C1)", entiat);
// A pool's name is the river's only in that pool's own counties, at a pool's size: Lake Sacajawea in
// Longview (Cowlitz County, 45.5 acres) is a city lake, not the Snake behind Ice Harbor Dam (N1).
ok(L.riverPool({ core: "SACAJAWEA", county: "Cowlitz", acres: 45.5 }) === "" && L.riverPool({ core: "SACAJAWEA", county: "Franklin", acres: 9200 }) === "Snake" &&
  L.riverPool({ core: "SACAJAWEA", county: "Walla Walla" }) === "Snake", "Lake Sacajawea in Cowlitz County is not the Snake's pool; in Franklin or Walla Walla it is (N1)");
ok(["Cowlitz", "Grant", "Clark", "Douglas", "Benton", "Walla Walla"].every((c) => L.riverPool({ core: "WEST", county: c, acres: 12 }) === "") && L.riverPool({ core: "WEST", county: "Franklin", acres: 8000 }) === "Snake",
  "a West Lake in a river county is not a pool; Lake Herbert G. West is, in its own counties, at a pool's size (N1)");
ok(L.riverPool({ core: "ENTIAT", county: "Douglas", acres: 8828.6 }) === "Columbia" && L.riverPool({ core: "PATEROS", county: "Douglas", acres: 8098.7 }) === "Columbia" &&
  L.riverPool({ core: "UMATILLA", county: "Klickitat", acres: 48737.8 }) === "Columbia" && L.riverPool({ core: "ENTIAT", county: "Cowlitz", acres: 8828.6 }) === "",
  "the Columbia's own pools stay the river's, and only in their own counties");
const cougar = byName("Cougar Lake", "Okanogan");
ok(cougar && cougar.pr == null && (cougar.pm || []).length === 2 && cougar.pm.every((i) => R.e[i][0] === "Cougar Lake"), "two Cougar Lake entries in Okanogan County, one on the map: it keeps both and says so", cougar);
const smid = byName("Starzman Lake Middle", "Okanogan");
ok(upr && smid && entry(upr) && entry(upr) === entry(smid) && entry(upr)[0] === "Starzman Lakes", "STARZMAN LAKES is each Starzman lake", [entry(upr), entry(smid)]);
const goose = byName("Lower Goose Lake", "Grant");
ok(entry(goose) && rowsOf(entry(goose)).some((r) => r[0] === "Crappie" && r[2] === 'Min. size 9". Daily limit 10.') && rowsOf(entry(goose)).some((r) => r[0] === "Bluegill"), "Lower Goose Lake: its crappie and bluegill rules", entry(goose));
const fortson = R.e.find((e) => e[0] === "Fortson Mill Pond - 2");
ok(fortson && !fortson[7].length && fortson[2].join() === "Snohomish" && rowsOf(fortson).some((r) => /juvenile/i.test(r[2])), "a pamphlet lake in range with no lake on the map is kept by its own name (Fortson Mill Pond 2, juvenile anglers only)", fortson);
ok(R.e.every((e) => e[3] > 0) && R.url === L.PAMPHLET && R.pages.length === 6, "every entry carries its printed page and its web page");
ok(JSON.stringify(L.labelFish("Trout")) === JSON.stringify(["trout", "cutthroat", "browntrout", "tigertrout", "goldentrout"]) && L.labelFish("All game fish") === "g" && L.labelFish("Other game fish") === "o" &&
  L.labelFish("All species") === "*" && JSON.stringify(L.labelFish("Bass, channel catfish, and walleye")) === JSON.stringify(["bass", "smallmouth", "catfish", "walleye"]) &&
  JSON.stringify(L.labelFish("Eastern brook trout")) === JSON.stringify(["brooktrout"]) && L.labelFish("Reservoir") === null && L.GAME.indexOf("sockeye") < 0 && L.GAME.indexOf("sturgeon") < 0,
  "a species cell reads as the fish it is about (trout are not brook trout, salmon and sturgeon are not game fish)");
ok(L.pamphletName("TAPPS, LAKE (RESERVOIR)") === "Lake Tapps" && L.pamphletName("LOWER AND UPPER GREEN LAKES") === "Lower and Upper Green Lakes", "a heading as people say it");

// ---- the pure parts ---------------------------------------------------------------
ok(L.core("LK TAPPS (PIER)") === "TAPPS" && L.core("Lake Tapps") === "TAPPS" && L.core("SILVER LK (SNOH) T28") === "SILVER" && L.core("Long's Pond") === "LONGS", "names boil down to the words that tell lakes apart");
ok(L.townshipFits("ECHO LK (SNOH) T27", 47.786) === true && L.townshipFits("ECHO LK (SNOH) T29", 47.786) === false && L.townshipFits("ECHO LK (SNOH)", 47.8) === null, "a township fits a latitude or it does not");
ok(L.kindOf("MILK PD (KITT)") === "pond" && L.kindOf("Milk Lake") === "lake" && L.kindOf("ABERDEEN RES (GRAY)") === "res" && L.kindOf("Tapps") === "", "the kind of water from its name");
ok(L.rowFits("BAKER", "BAKER LK@BLUE TARP B") && !L.rowFits("LONG", "LONGS PD (THUR)") && !L.rowFits("MINERAL", "MORTON DERBY (LEWI)"), "a plant row is the lake's when its name is the lake's (a derby is not)");
const sum = L.plantSummary([
  { species: "Rainbow", release_start_date: "2026-04-01T00:00:00.000", number_released: "500", number_of_fish_per_pound: "2", lifestage: "Legals" },
  { species: "Rainbow", release_start_date: "2026-04-01T00:00:00.000", number_released: "300", number_of_fish_per_pound: "1.5", lifestage: "Legals" },
  { species: "Rainbow", release_start_date: "2019-05-01T00:00:00.000", number_released: "1000", number_of_fish_per_pound: "40", lifestage: "Fry" },
  { species: "Golden Rainbow", release_start_date: "1995-05-01T00:00:00.000", number_released: "10" }], 2026);
ok(JSON.stringify(sum.get("trout")) === JSON.stringify(["2026-04-01", 800, 1.5, "Legals", 2, 2019, 1, 800]) && sum.size === 1,
  "two trucks on one day are one plant (the bigger fish said); a fish no source names is left out", [...sum]);
const twin = L.mapLakes([
  { attributes: { OBJECTID: 1, LakeName: "Twin Lake", CountyName: "King", SurfaceAcres: 10 }, geometry: { y: 47.4, x: -122.2 } },
  { attributes: { OBJECTID: 2, LakeName: "Twin Lake", CountyName: "King", SurfaceAcres: 10 }, geometry: { y: 47.5, x: -122.2 } }]);
const tlog = [];
const tj = L.joinPlants(twin, L.plantSites([{ geo_code: "L9", release_location: "TWIN LK (KING)", county: "King", species: "Rainbow", plants: "3" }]), new Map(), [], tlog);
ok(!tj.size && tlog.length === 2, "two lakes of one name, one code with nothing to tell them apart: neither gets it, both logged", tlog);
const nlog = [];
const nj = L.joinNas(twin.slice(0, 1).concat(L.mapLakes([{ attributes: { OBJECTID: 3, LakeName: "Pine Lake", CountyName: "King", SurfaceAcres: 80 }, geometry: { y: 47.6, x: -122.0 } }])), [
  { commonName: "Walleye", locality: "Pine Lake, near Sammamish", decimalLatitude: 47.601, decimalLongitude: -122.001, year: 2005, status: "established" },
  { commonName: "Walleye", locality: "Pond tributary to Pine Lake", decimalLatitude: 47.601, decimalLongitude: -122.001, year: 2017, status: "established" },
  { commonName: "Walleye", locality: "Pine Lake", decimalLatitude: 47.9, decimalLongitude: -121.5, year: 2006, status: "established" }], nlog);
ok(nj.get(3) && nj.get(3).walleye.y === 2005 && nj.size === 1, "a USGS record joins the lake its place names, in reach of it; a pond by it or a lake far off is not it", [...nj]);

// ---- what the app may say ---------------------------------------------------------
const text = JSON.stringify({ ...D, rules: null });
ok(!/\bwild\b|\bnative\b/i.test(text), "the lake data never says wild or native");
const paged = Object.values(pamphlet).join(" ").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#8217;|&rsquo;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
ok(D.rules.words.filter((w) => /\bwild\b|\bnative\b/i.test(w)).every((w) => paged.includes(w)), "where a rule says wild, it is the pamphlet's own words, quoted");
ok(D.lakes.every((l) => l.f.every((x) => x[1] === 1 || x[2] || x[3])), "every fish in a lake has a source: the map, a plant, or a USGS record");
ok(D.lakes.every((l) => l.f.every((x) => !x[3] || "escufx".includes(x[3][1]))), "a USGS record keeps its status in a word the app knows");

// ---- the lake fish file -------------------------------------------------------------
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(readFileSync(join(ROOT, "rigs/lakefish.js"), "utf8"), ctx);
const LF = ctx.RIG.lakeFish;
const NEW = ["muskie", "smallmouth", "crappie", "bluegill", "pumpkinseed", "bullhead", "catfish", "walleye", "kokanee", "browntrout", "brooktrout", "tigertrout", "goldentrout", "laketrout", "sockeye", "sturgeon"];
ok(LF && JSON.stringify(LF.order) === JSON.stringify(NEW), "every new lake fish is in the Fish tab's order", LF && LF.order);
ok(NEW.concat(["bass", "perch", "trout", "cutthroat"]).every((id) => { const f = LF.fish[id]; return f && f.name && f.hint && f.rule && f.rule.say && f.rule.q.length && f.rule.page >= 23 && f.rule.page <= 25 && /eregulations\.com/.test(f.rule.url); }),
  "each has a name, a line, and a rule quoted with its pamphlet page", NEW.filter((id) => !(LF.fish[id] && LF.fish[id].rule)));
ok(NEW.every((id) => LF.fish[id].what), "and what it is");
ok(NEW.concat(["bass", "perch", "trout", "cutthroat"]).every((id) => { const f = LF.fish[id]; return ![f.name, f.hint, f.what, f.rule.say, f.rule.note].concat(f.when || [], f.how || []).some((t) => /\bwild\b|\bnative\b/i.test(t || "")); }),
  "no line of the app's own says wild or native (the pamphlet's own words are quoted as they are)");
ok(!/—/.test(readFileSync(join(ROOT, "rigs/lakefish.js"), "utf8")) && !/—/.test(readFileSync(join(ROOT, "rigs/lakes.js"), "utf8")), "no em dash in either file");
ok(LF.fish.muskie.rule.say === "50 inches to keep, 1 a day" && LF.fish.muskie.rule.q[0] === 'Tiger Muskellunge (Tiger Muskie): Min. size 50". Daily limit 1.' && LF.fish.muskie.rule.page === 25,
  "the tiger muskie rule: 50 inches, 1 a day, quoted from page 25 (no claim about how many are released)", LF.fish.muskie.rule);
ok(["bluegill", "pumpkinseed"].every((id) => LF.fish[id].rule.say === "No size or daily limit (sunfish)") && LF.fish.bullhead.rule.say === "No size or daily limit (catfish)",
  "bluegill, pumpkinseed and bullhead say the rule they keep, and its group (M3)");
// Sources: the pamphlet, data.wa.gov, WDFW's map service and USGS NAS. Nothing else, and never wdfw.wa.gov.
const ALLOWED = /^https:\/\/(www\.eregulations\.com|data\.wa\.gov|geodataservices\.wdfw\.wa\.gov|nas\.er\.usgs\.gov)\//;
const srcs = Object.values(LF.fish).flatMap((f) => f.src || []);
ok(srcs.length && srcs.every((u) => ALLOWED.test(u)), "every line's source is one this app may use (no guide or report site, never wdfw.wa.gov) (M3)", srcs.filter((u) => !ALLOWED.test(u)));
ok(Object.values(LF.fish).every((f) => (f.how || []).every((t) => /WDFW's lake checks/.test(t))) && /data\.wa\.gov/.test(LF.how.url),
  "each how line is WDFW's creel checks at lakes, and says so");
ok(Object.values(LF.fish).every((f) => !f.own), "no fish carries a hand-made list of lakes with their own rule: the pamphlet's entries in rigs/lakes.js are it (I2)");
// The pamphlet's text, its spacing evened out ("Kokanee :" is "Kokanee:").
const flat = (t) => String(t).replace(/\s+/g, " ").replace(/ ([:.])/g, "$1").trim();
const facts = flat(readFileSync(join(ROOT, "tests/fixtures/lakes/rule-quotes.txt"), "utf8"));
const unquoted = [];
NEW.concat(["bass", "perch", "trout", "cutthroat"]).forEach((id) => LF.fish[id].rule.q.forEach((q) => { if (!facts.includes(flat(q))) unquoted.push(id + ": " + q); }));
ok(!unquoted.length, "every rule quote is the pamphlet's own text, word for word (tests/fixtures/lakes/rule-quotes.txt)", unquoted);
ok(facts.includes(flat(LF.columbia.q)) && LF.columbia.page === 23 && facts.includes(flat(LF.unlisted.q)), "the Columbia (a river) and the unlisted lake quotes are the pamphlet's own words");

// ---- the committed file ---------------------------------------------------------------
const cmt = { console }; cmt.window = cmt; vm.createContext(cmt);
vm.runInContext(readFileSync(join(ROOT, "rigs/lakes.js"), "utf8"), cmt);
const C = cmt.RIG.lakesData, ct = C && C.lakes.find((l) => l.id === "lake-tapps-pierce"), cm = ct && ct.f.find((x) => x[0] === "muskie");
ok(C && C.lakes.length > 400 && C.lakes.every((l) => Math.round(l.km) <= 230), "rigs/lakes.js holds every lake in range (" + (C && C.lakes.length) + ")");
ok(cm && cm[1] === 1 && cm[2][0] === "2026-05-05" && cm[2][1] === 1631, "and Lake Tapps has its tiger muskie, planted May 5, 2026");
const CR = C.rules, cmw = C.lakes.find((l) => l.id === "martha-warm-beach-snohomish");
ok(CR && CR.e.length > 300 && ct.pr != null && CR.e[ct.pr][3] === 89 && cmw && cmw.pr != null && CR.e[cmw.pr][1] === "Warm Beach",
  "and the pamphlet's lake entries in range (" + (CR && CR.e.length) + "), Lake Tapps on page 89, Martha Warm Beach its own");
ok(["lake-entiat-douglas", "lake-pateros-douglas", "lake-umatilla-klickitat"].every((id) => { const l = C.lakes.find((x) => x.id === id); return l && l.rv === "Columbia" && l.pr == null; }),
  "Lake Entiat, Lake Pateros and Lake Umatilla are Columbia River pools, with no lake rule (C1)");
const sac = C.lakes.find((l) => l.id === "lake-sacajawea-cowlitz");
ok(sac && sac.c === "Cowlitz" && !sac.rv && sac.pr == null && sac.pm == null, "Lake Sacajawea in Longview is no river pool and has no entry of its own: statewide lake rules (N1)", sac);
ok(JSON.stringify(C.lakes.filter((l) => l.rv).map((l) => l.id).sort()) === JSON.stringify(["lake-entiat-douglas", "lake-pateros-douglas", "lake-umatilla-klickitat"]),
  "and the only river pools in range are the Columbia's three", C.lakes.filter((l) => l.rv).map((l) => l.id));
// the six pages the printed-page script got wrong, from the pamphlet's PDF (N2)
const RIGHT = [["Wilderness Lake", "", "King", 91], ["Wood Lake", "", "Mason", 91], ["Martha Lake", "Warm Beach", "Snohomish", 86], ["Martha Lake", "Alderwood Manor", "Snohomish", 85],
  ["Shoe Lake", "", "Mason", 88], ["Ell Lake", "", "Okanogan", 94], ["Wannacut Lake", "", "Okanogan", 100], ["I -82 Ponds", "1 through 7", "Yakima", 95], ["Para -Juvenile Lake", "", "Adams,Grant", 97]];
const pageOf = (n, q, c) => (CR.e.find((e) => e[0] === n && e[1] === q && e[2].join() === c) || [])[3];
ok(RIGHT.every(([n, q, c, pg]) => pageOf(n, q, c) === pg) && CR.e.every((e) => e[3] > 0),
  "Wilderness (King) 91, Wood (Mason) 91, Martha Warm Beach 86, Shoe (Mason) 88, Ell (Okanogan) 94, Wannacut 100; I-82 Ponds 95 and Para-Juvenile 97 now placed; every entry has its page (N2)",
  RIGHT.map(([n, q, c, pg]) => n + (q ? " " + q : "") + ": " + pageOf(n, q, c) + " (" + pg + ")"));
const PJ = JSON.parse(readFileSync(join(ROOT, "scripts/pamphlet-pages.json"), "utf8"));
ok(PJ["westside-lakes-special-rules-q-z|WILDERNESS LAKE|KING|"] === 91 && PJ["westside-lakes-special-rules-q-z|WOOD LAKE|MASON|"] === 91 && PJ["westside-lakes-special-rules-f-p|MARTHA LAKE|SNOHOMISH|Warm Beach"] === 86 &&
  PJ["westside-lakes-special-rules-q-z|SHOE LAKE|MASON|"] === 88 && PJ["eastside-lakes-special-rules-a-f|ELL LAKE|OKANOGAN|"] === 94 && PJ["eastside-lakes-special-rules-q-z|WANNACUT LAKE|OKANOGAN|"] === 100,
  "and scripts/pamphlet-pages.json says so");
const js0 = readFileSync(join(ROOT, "rigs/lakes.js"), "utf8");
ok(js0.length < 240000 && gzipSync(js0).length < 60000, "small enough for the offline app (under 240 KB, under 60 KB as sent)", [js0.length, gzipSync(js0).length]);
const content = readFileSync(join(ROOT, "rigs/content.js"), "utf8");
ok(["lake-fenwick-king", "american-lake-pierce", "lake-tapps-pierce"].every((id) => content.includes('lake: "' + id + '"') && C.lakes.some((l) => l.id === id)), "the app's lake spots point at their lakes");
const sw = readFileSync(join(ROOT, "rigs/sw.js"), "utf8");
ok(/"\/rigs\/lakes\.js"/.test(sw) && /"\/rigs\/lakefish\.js"/.test(sw), "both files are in the service worker's shell, so a lake opens with no signal");

// ---- writing, and the sources that answer wrong ------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "lakes-"));
try {
  const out = join(tmp, "lakes.js");
  const w = await L.main({ get, waters, now: NOW, out, print: () => {}, min: MIN });
  const js = readFileSync(out, "utf8");
  ok(w.wrote && existsSync(out) && /^\/\/ Built by scripts\/build-lakes\.mjs on 2026-11-27\./.test(js) && /RIG\.lakesData = /.test(js) && !existsSync(out + ".tmp"), "a real run writes the file whole, stamped with its day");
  ok(JSON.stringify(L.readData(js).n) === JSON.stringify(w.data.n) && w.data.n.usgs > 0 && w.data.n.rules > 0, "and keeps what each source gave, to hold the next build up against", w.data.n);
  const fails = async (o, name, min = MIN) => {
    let threw = "";
    try { await L.main({ get: getter(o), waters, now: NOW, out, print: () => {}, min }); } catch (e) { threw = e.message; }
    ok(threw && readFileSync(out, "utf8") === js && !existsSync(out + ".tmp"), name + ": the build stops and the last good file stays", threw || "it wrote");
    return threw;
  };
  let threw = "";
  try { await L.main({ get, waters, now: NOW, out: join(tmp, "x.js"), print: () => {} }); } catch (e) { threw = e.message; }
  ok(threw && !existsSync(join(tmp, "x.js")), "an answer too small to be the whole map stops the build; nothing is written", threw);
  await fails({ nas: { endOfRecords: "true", count: 0, results: [] } }, "USGS answers 200 with no records");
  await fails({ nas: { message: "Service unavailable" } }, "USGS answers 200 with an error body");
  await fails({ nas: (off) => ({ endOfRecords: "false", count: 1000, results: Array.from({ length: 1000 }, () => nas[0]) }) }, "USGS never says it is done (past 20,000 records)");
  await fails({ nas: { endOfRecords: "true", count: 500, results: nas.slice(0, 50) } }, "a USGS page that holds less than it says");
  await fails({ layer: { 13: { features: [] } } }, "the tiger muskie layer comes back empty");
  await fails({ layer: { 13: { features: [], exceededTransferLimit: true } } }, "a map layer comes back cut short");
  await fails({ high: { features: [] } }, "the High Lakes layer comes back empty");
  await fails({ rows: [] }, "the plant rows come back empty");
  await fails({ page: { "westside-lakes-special-rules-q-z": "<html><body>Service unavailable</body></html>" } }, "a pamphlet page comes back without its lake table");
  // a source that answers above its floor but far below the last build: a tenth lost is refused
  const half = await fails({ nas: { endOfRecords: "true", count: 8, results: nas.slice(0, 8) } }, "USGS answers with a few records (above the floor)", { ...MIN, nas: 5 });
  ok(/would lose usgs/.test(half) && /--force/.test(half), "it says what it would lose, and how to write anyway", half);
  const forced = await L.main({ get: getter({ nas: { endOfRecords: "true", count: 8, results: nas.slice(0, 8) } }), waters, now: NOW, out, print: () => {}, min: MIN, force: true });
  ok(forced.wrote && L.readData(readFileSync(out, "utf8")).n.usgs < w.data.n.usgs, "--force writes it anyway");
  ok(L.shrinkage({ n: { lakes: 456, mapped: 1358, stocked: 920, usgs: 704, high: 1080, rules: 379 } }, { n: { lakes: 456, mapped: 1358, stocked: 920, usgs: 0, high: 1080, rules: 379 } }).length === 0 &&
    L.shrinkage({ n: { lakes: 456, mapped: 1358, stocked: 0, usgs: 704, high: 1080, rules: 379 } }, { n: { lakes: 456, mapped: 1358, stocked: 920, usgs: 704, high: 1080, rules: 379 } }).join() === "stocked 920 to 0",
    "losing a source's records is caught; gaining them is not");
  let bad = "";
  try { L.feedWaters("// rigs/waters.js in some new shape\nRIG.watersSnap = {};\n"); } catch (e) { bad = e.message; }
  ok(/no RIG\.watersSnapshot/.test(bad) && L.feedWaters(readFileSync(join(ROOT, "rigs/waters.js"), "utf8")).length > 10, "rigs/waters.js in a shape the build cannot read stops it, instead of falling back to names without a word");
} finally { rmSync(tmp, { recursive: true, force: true }); }

// ---- the printed page: the whole heading where a word starts, the words under it on its own page (N2) ----
{
  const tr = (cells) => "<tr>" + cells.map((c) => "<td" + (cells.length === 1 ? ' colspan="3"' : "") + ">" + c + "</td>").join("") + "</tr>";
  const head = (n, c) => tr([n + " - " + c + " CO."]), SW = "Statewide min. size/daily limit.", SPRING = "4th Sat. in Apr.-Oct. 31";
  const html = {
    "westside-lakes-special-rules-a-e": "<table></table>",
    "westside-lakes-special-rules-f-p": "<table>" + head("HORSESHOE LAKE", "KITSAP") + tr(["All game fish", SPRING, SW]) + head("INDIAN HEAVEN WILDERNESS LAKES", "SKAMANIA") + tr(["Trout", "Year-round", 'Min. size 8". Daily limit 2.']) +
      head("MARTHA LAKE", "SNOHOMISH") + tr(["Alderwood Manor"]) + tr(["All game fish", SPRING, SW]) +
      head("MARTHA LAKE", "SNOHOMISH") + tr(["Warm Beach"]) + tr(["All species", "", "Selective gear rules."]) + tr(["Trout", "Year-round", 'Min. size 14". Daily limit 2.']) +
      head("PACKWOOD LAKE", "LEWIS") + tr(["All game fish", "Year-round", SW]) + "</table>",
    "westside-lakes-special-rules-q-z": "<table>" + head("SHOE LAKE", "MASON") + tr(["All game fish", SPRING, SW]) + head("WILDERNESS LAKE", "KING") + tr(["All game fish", SPRING, SW]) +
      head("WOOD LAKE", "MASON") + tr(["All game fish", SPRING, SW]) + "</table>",
    "eastside-lakes-special-rules-a-f": "<table>" + head("BLUE LAKE", "OKANOGAN") + tr(["(near Wannacut Lake)"]) + tr(["Trout", "Year-round", SW]) + head("CAMPBELL LAKE", "OKANOGAN") + tr(["All species", "", "Selective gear rules."]) +
      head("ELL LAKE", "OKANOGAN") + tr(["All species", "", "Selective gear rules."]) + "</table>",
    "eastside-lakes-special-rules-g-p": "<table>" + head("PARA -JUVENILE LAKE", "ADAMS/GRANT") + tr(["All species", "", "Two-Pole not allowed."]) + "</table>",
    "eastside-lakes-special-rules-q-z": "<table>" + head("WANNACUT LAKE", "OKANOGAN") + tr(["All game fish", SPRING, SW]) + "</table>",
  };
  // the PDF as pdftotext writes it: text page i is printed page i - 1; \x08 is a heading's ramp icon
  const W = "WESTSIDE LAKES - SPECIAL RULES SPECIES DATE ADDITIONAL RULES ", E = "EASTSIDE LAKES - SPECIAL RULES SPECIES DATE ADDITIONAL RULES ";
  const pdf = Array.from({ length: 102 }, () => "Washington State Sport Fishing Rules");
  pdf[85] = W + "HORSESHOE LAKE - KITSAP CO.\x08 All game fish " + SPRING + " " + SW + " INDIAN HEAVEN WILDERNESS LAKES - SKAMANIA CO. Trout Year-round Min. size 8\". Daily limit 2.";
  pdf[86] = W + "MARTHA LAKE - SNOHOMISH CO.\x08 Alderwood Manor All game fish " + SPRING + " " + SW + " (Continued on next page)";
  pdf[87] = W + "MARTHA LAKE - SNOHOMISH CO.\x08 Warm Beach All species Selective gear rules. Trout Year-round Min. size 14\". Daily limit 2.";
  pdf[88] = W + "PACKWOOD LAKE - LEWIS CO.\x08 All game fish Year-round " + SW;
  pdf[89] = W + "SHOE LAKE - MASON CO. All game fish " + SPRING + " " + SW;
  pdf[92] = W + "WILDERNESS LAKE - KING CO.\x08 All game fish " + SPRING + " " + SW + " WOOD LAKE - MASON CO. All game fish " + SPRING + " " + SW;
  pdf[94] = E + "CAMPBELL LAKE - OKANOGAN CO.\x08 All species Selective gear rules. BLUE LAKE - OKANOGAN CO. (near Wannacut Lake) Trout Year-round " + SW;
  pdf[95] = E + "ELL LAKE - OKANOGAN CO. All species Selective gear rules.";
  pdf[98] = E + "PARA-JUVENILE LAKE - ADAMS/GRANT CO.\x08 All species Two-Pole not allowed.";
  pdf[101] = E + "WANNACUT LAKE - OKANOGAN CO.\x08 All game fish 4th Sat. in Apr.- Oct. 31 " + SW;
  const got = P.pagesOf(html, pdf.join("\f"));
  const want = { "westside-lakes-special-rules-q-z|WILDERNESS LAKE|KING|": 91, "westside-lakes-special-rules-q-z|WOOD LAKE|MASON|": 91, "westside-lakes-special-rules-f-p|MARTHA LAKE|SNOHOMISH|Warm Beach": 86,
    "westside-lakes-special-rules-f-p|MARTHA LAKE|SNOHOMISH|Alderwood Manor": 85, "westside-lakes-special-rules-q-z|SHOE LAKE|MASON|": 88, "eastside-lakes-special-rules-a-f|ELL LAKE|OKANOGAN|": 94,
    "eastside-lakes-special-rules-q-z|WANNACUT LAKE|OKANOGAN|": 100, "westside-lakes-special-rules-f-p|HORSESHOE LAKE|KITSAP|": 84, "westside-lakes-special-rules-f-p|PACKWOOD LAKE|LEWIS|": 87,
    "eastside-lakes-special-rules-a-f|CAMPBELL LAKE|OKANOGAN|": 93, "eastside-lakes-special-rules-a-f|BLUE LAKE|OKANOGAN|(near Wannacut Lake)": 93,
    "eastside-lakes-special-rules-g-p|PARA -JUVENILE LAKE|ADAMS/GRANT|": 97 };
  const wrong = Object.entries(want).filter(([k, v]) => got[k] !== v).map(([k, v]) => k + ": " + got[k] + " (" + v + ")");
  ok(!wrong.length, "a lake's page is where its whole heading starts a word (Shoe is not in Horseshoe, Wood - Mason not Packwood - Lewis, Ell not Campbell), with the words under it on that page (Warm Beach); a hyphen spaced either way and two counties still read (Para-Juvenile) (N2)", wrong);
}

// ---- the build's day is Pacific time (M4) ----------------------------------------------
ok(L.pacificDay(new Date("2026-11-28T03:00:00Z")) === "2026-11-27" && L.pacificDay(new Date("2026-11-27T20:00:00Z")) === "2026-11-27" && L.pacificDay(new Date("2026-07-01T06:30:00Z")) === "2026-06-30" &&
  L.pacificDay(new Date("2027-01-01T07:59:00Z")) === "2026-12-31", "the build is stamped with Bonney Lake's day, not UTC's (a build after 4 PM is still today) (M4)");
{
  const tmp2 = mkdtempSync(join(tmpdir(), "lakes-"));
  try {
    const out = join(tmp2, "lakes.js");
    const w2 = await L.main({ get, waters, now: new Date("2027-01-01T05:00:00Z"), out, print: () => {}, min: MIN });
    ok(w2.wrote && /^\/\/ Built by scripts\/build-lakes\.mjs on 2026-12-31\./.test(readFileSync(out, "utf8")) && w2.data.built === "2026-12-31" && w2.data.year === 2026,
      "a build on New Year's Eve evening is stamped Dec 31, 2026, in the 2026 year", [w2.data.built, w2.data.year]);
  } finally { rmSync(tmp2, { recursive: true, force: true }); }
}

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
