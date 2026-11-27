// The lakes build (scripts/build-lakes.mjs) on recorded answers, and the
// lake fish file (rigs/lakefish.js) it is read with.
// Run: node tests/rigs-lakes.test.mjs
//
// What this guards: the build reads WDFW's map, WDFW's plants and USGS's
// records the way they answer (tests/fixtures/lakes: real answers, trimmed),
// with no network; it joins plants to a lake only when sure (the app's own
// code, a point that is this lake, a township, the kind of water, a name
// that is the only one in its county) and leaves the rest out, logged; a
// plant row named for another water under the same code is not this lake's;
// a USGS record joins only the one lake its place names; tags are stocked,
// in the lake and introduced, never wild or native; Lake Tapps has its tiger
// muskie, planted May 5, 2026, with the 50 inch rule from the pamphlet; the
// dry run writes nothing; and the committed rigs/lakes.js is the build's.
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as L from "../scripts/build-lakes.mjs";

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
const asked = [];
const answer = (body) => ({ ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(body)) });
async function get(url) {
  asked.push(url);
  const u = new URL(url);
  if (u.hostname !== "geodataservices.wdfw.wa.gov" && u.hostname !== "data.wa.gov" && u.hostname !== "nas.er.usgs.gov") throw new Error("not a source: " + url);
  if (/wdfw\.wa\.gov$/.test(u.hostname) && u.hostname !== "geodataservices.wdfw.wa.gov") throw new Error("wdfw.wa.gov is off limits");
  const layer = /\/MapServer\/(\d+)\/query$/.exec(u.pathname);
  if (layer) return answer(layer[1] === "2" ? lowland : layer[1] === "21" ? high : layers[layer[1]] || { features: [] });
  if (u.pathname === "/api/views/6fex-3r7d.json") return answer(meta);
  if (u.pathname === "/resource/6fex-3r7d.json") {
    if (u.searchParams.get("$group")) return answer(groups);
    const codes = (/in\(([^)]*)\)/.exec(u.searchParams.get("$where") || "") || [, ""])[1].split(",").map((c) => c.replace(/'/g, "").trim());
    return answer(rows.filter((r) => codes.includes(r.geo_code)));
  }
  if (u.hostname === "nas.er.usgs.gov") {
    const off = +u.searchParams.get("offset") || 0;
    return answer({ endOfRecords: "true", results: off ? [] : nas });
  }
  throw new Error("unexpected " + url);
}
const NOW = new Date("2026-11-27T20:00:00Z");
const MIN = { groups: 10, lakes: 5 };
const lines = [];
const run = await L.main({ dry: true, get, waters, now: NOW, print: (s) => lines.push(s), min: MIN });
const D = run.data, byName = (n, c) => D.lakes.find((l) => l.n === n && (!c || l.c === c));
const fish = (l, id) => l && l.f.find((x) => x[0] === id);

// ---- reading the sources -------------------------------------------------------
ok(run.wrote === false && asked.length > 0 && asked.every((u) => !/(^|\/\/)(www\.)?wdfw\.wa\.gov\//.test(u)), "a dry run reads only the allowed sources and writes nothing", asked.filter((u) => /wdfw\.wa\.gov/.test(u) && !/geodataservices/.test(u)));
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
const text = JSON.stringify(D);
ok(!/\bwild\b|\bnative\b/i.test(text), "the lake data never says wild or native");
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
ok(NEW.filter((id) => id !== "sturgeon").every((id) => (LF.fish[id].when || []).length && (LF.fish[id].how || []).length && LF.fish[id].what), "and what it is, when and how (white sturgeon has no source for when or how)");
ok(NEW.concat(["bass", "perch", "trout", "cutthroat"]).every((id) => { const f = LF.fish[id]; return ![f.name, f.hint, f.what, f.rule.say, f.rule.note].concat(f.when || [], f.how || []).some((t) => /\bwild\b|\bnative\b/i.test(t || "")); }),
  "no line of the app's own says wild or native (the pamphlet's own words are quoted as they are)");
ok(!/—/.test(readFileSync(join(ROOT, "rigs/lakefish.js"), "utf8")) && !/—/.test(readFileSync(join(ROOT, "rigs/lakes.js"), "utf8")), "no em dash in either file");
ok(LF.fish.muskie.rule.say === "50 inches to keep, 1 a day: nearly all are released" && LF.fish.muskie.rule.q[0] === 'Tiger Muskellunge (Tiger Muskie): Min. size 50". Daily limit 1.' && LF.fish.muskie.rule.page === 25,
  "the tiger muskie rule: 50 inches, 1 a day, quoted from page 25", LF.fish.muskie.rule);
// The pamphlet's text, its spacing evened out ("Kokanee :" is "Kokanee:").
const flat = (t) => String(t).replace(/\s+/g, " ").replace(/ :/g, ":").trim();
const facts = flat(readFileSync(join(ROOT, "tests/fixtures/lakes/rule-quotes.txt"), "utf8"));
const unquoted = [];
NEW.concat(["bass", "perch", "trout", "cutthroat"]).forEach((id) => LF.fish[id].rule.q.forEach((q) => { if (!facts.includes(flat(q))) unquoted.push(id + ": " + q); }));
ok(!unquoted.length, "every rule quote is the pamphlet's own text, word for word (tests/fixtures/lakes/rule-quotes.txt)", unquoted);

// ---- the committed file ---------------------------------------------------------------
const cmt = { console }; cmt.window = cmt; vm.createContext(cmt);
vm.runInContext(readFileSync(join(ROOT, "rigs/lakes.js"), "utf8"), cmt);
const C = cmt.RIG.lakesData, ct = C && C.lakes.find((l) => l.id === "lake-tapps-pierce"), cm = ct && ct.f.find((x) => x[0] === "muskie");
ok(C && C.lakes.length > 400 && C.lakes.every((l) => l.km <= 230), "rigs/lakes.js holds every lake in range (" + (C && C.lakes.length) + ")");
ok(cm && cm[1] === 1 && cm[2][0] === "2026-05-05" && cm[2][1] === 1631, "and Lake Tapps has its tiger muskie, planted May 5, 2026");
ok(readFileSync(join(ROOT, "rigs/lakes.js"), "utf8").length < 200000, "small enough for the offline app (under 200 KB)");
const content = readFileSync(join(ROOT, "rigs/content.js"), "utf8");
ok(["lake-fenwick-king", "american-lake-pierce", "lake-tapps-pierce"].every((id) => content.includes('lake: "' + id + '"') && C.lakes.some((l) => l.id === id)), "the app's lake spots point at their lakes");
const sw = readFileSync(join(ROOT, "rigs/sw.js"), "utf8");
ok(/"\/rigs\/lakes\.js"/.test(sw) && /"\/rigs\/lakefish\.js"/.test(sw), "both files are in the service worker's shell, so a lake opens with no signal");

// ---- writing --------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), "lakes-"));
try {
  const out = join(tmp, "lakes.js");
  const w = await L.main({ get, waters, now: NOW, out, print: () => {}, min: MIN });
  const js = readFileSync(out, "utf8");
  ok(w.wrote && existsSync(out) && /^\/\/ Built by scripts\/build-lakes\.mjs on 2026-11-27\./.test(js) && /RIG\.lakesData = /.test(js), "a real run writes the file, stamped with its day");
  let threw = "";
  try { await L.main({ get, waters, now: NOW, out: join(tmp, "x.js"), print: () => {} }); } catch (e) { threw = e.message; }
  ok(/did not load whole|plants/.test(threw) && !existsSync(join(tmp, "x.js")), "an answer too small to be the whole map stops the build; the last good file stays", threw);
} finally { rmSync(tmp, { recursive: true, force: true }); }

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
