// Hot Trips planner: forecast in, honest week out.
// Run: node tests/rigs-trips.test.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.window = ctx;
vm.runInContext(readFileSync(resolve(ROOT, "rigs/content.js"), "utf8"), ctx);
vm.runInContext(readFileSync(resolve(ROOT, "rigs/trips.js"), "utf8"), ctx);
vm.runInContext(readFileSync(resolve(ROOT, "rigs/runs.js"), "utf8"), ctx);
vm.runInContext(readFileSync(resolve(ROOT, "rigs/rules.js"), "utf8"), ctx);
vm.runInContext(readFileSync(resolve(ROOT, "rigs/waters.js"), "utf8"), ctx);
vm.runInContext(readFileSync(resolve(ROOT, "rigs/sky.js"), "utf8"), ctx);
const T = ctx.RIG.trips;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};

const pad = (n) => String(n).padStart(2, "0");
function isoAdd(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
// A week of weather at every spot. over(spot, iso, hour) can change one hour.
function week(today, over = () => ({})) {
  const wx = {};
  for (const s of T.spots) {
    const hours = [], sun = {};
    for (let i = 0; i < 7; i++) {
      const iso = isoAdd(today, i);
      sun[iso] = { rise: 7.5, set: 16.4 };
      for (let h = 0; h < 24; h++) hours.push({ t: `${iso}T${pad(h)}:00`, wind: 4, gust: 8, rain: 0, temp: 45, wave: 3, ...over(s.id, iso, h) });
    }
    wx[s.id] = { hours, sun };
  }
  return wx;
}
// High slack at 17:15 every day (right at full dark), lows morning and night.
function tidesFor(today, low = "21:00") {
  const out = {};
  for (const s of T.spots) if (s.tide) {
    out[s.tide] = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoAdd(today, i);
      out[s.tide].push({ t: `${iso} 04:30`, v: 11, type: "H" }, { t: `${iso} 11:00`, v: 2, type: "L" },
        { t: `${iso} 17:15`, v: 12, type: "H" }, { t: `${iso} ${low}`, v: -0.5, type: "L" });
    }
  }
  return out;
}
const tripsOn = (r, iso) => (r.days.find((d) => d.iso === iso) || { trips: [] }).trips;
const ids = (r, iso) => tripsOn(r, iso).map((t) => t.planId);

// --- a calm week in late November -----------------------------------------
{
  const today = "2026-11-23"; // Monday
  const r = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  ok(r.days.length === 7, "plans seven days", r.days.length);
  ok(r.days[0].label.startsWith("Today") && r.days[1].label.startsWith("Tomorrow"), "today and tomorrow are named");
  ok(ids(r, "2026-11-24").includes("squid-redondo"), "squid at Redondo after work on a calm Tuesday");
  const sq = tripsOn(r, "2026-11-24").find((t) => t.planId === "squid-redondo");
  ok(sq && sq.from >= 16.4 + 0.5, "squid starts at full dark, not before", sq && sq.from);
  ok(sq && sq.why.some((w) => /High slack 5:15 PM, right at dark/.test(w)), "squid says why: high slack at dark", sq && sq.why.join(" | "));
  ok(sq && sq.slot === "After work" && sq.drive <= 45, "a weeknight trip is close to home");
  ok(!r.days.some((d) => d.trips.some((t) => t.planId === "coho-dash-point")), "Dash Point coho is closed Nov 16 to Mar 30, never listed");
  ok(!r.days.some((d) => d.trips.some((t) => t.planId === "steelhead-green-river")), "Green River steelhead waits for WDFW's December seasons");
  ok(!r.notListed.some((n) => /Coho on the Green|Chum on the Green/.test(n.name)), "Green River coho and chum rules are confirmed (WSR 26-13-052)");
  const chum = T.plans.find((p) => p.id === "chum-green-river");
  ok(T.season(chum, { y: 2026, m: 9, d: 10, iso: "2026-09-10" }) === null, "the Green is closed for salmon before Sept 16");
  ok(!r.days.some((d) => d.trips.some((t) => t.planId === "bass-fenwick")), "no bass in November");
  ok(!tripsOn(r, "2026-11-24").some((t) => t.spot === "westport" || t.spot === "ocean-shores"), "no 2 hour drives on a weeknight");
  // Thanksgiving plans like a weekend, so the clam dig can show.
  ok(ids(r, "2026-11-26").includes("clams-ocean-shores"), "Thanksgiving gets an adventure day: razor clams", ids(r, "2026-11-26").join(","));
  const cl = tripsOn(r, "2026-11-26").find((t) => t.planId === "clams-ocean-shores");
  ok(cl && /Copalis, low 7:35 PM/.test(cl.why.join(" ")), "the dig uses WDFW's own beach and low tide", cl && cl.why.join(" | "));
  ok(cl && Math.abs(cl.from - (19.58 - 2)) < 0.01, "and starts digging 2 hours before the low", cl && cl.from);
  ok(cl && cl.gear, "the clam trip says the gear is missing");
  ok(!ids(r, "2026-11-29").includes("clams-ocean-shores"), "no clam trip on a day with no dig");
  ok(r.days.every((d) => d.trips.length <= (T.slotsFor(new Date(d.iso + "T12:00:00Z").getUTCDay(), d.iso).length > 1 ? 6 : 4)), "a weeknight lists four trips at most, a weekend or day off six");
  ok(r.days.every((d) => d.trips.every((t) => t.score >= 6)), "only good trips are listed");
}

// --- weekends and days off still get the evening squid -------------------
{
  const today = "2026-11-23";
  const r = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  ok(ids(r, "2026-11-28").includes("squid-redondo"), "Saturday evening: squid at Redondo", ids(r, "2026-11-28").join(","));
  ok(ids(r, "2026-11-26").includes("squid-redondo"), "Thanksgiving evening: squid too");
}

// --- the tide that counts is the one running during the trip --------------
{
  const today = "2026-11-27";
  const tides = { "9446705": [{ t: "2026-11-27 00:45", v: -3.5, type: "L" }, { t: "2026-11-27 07:56", v: 14.7, type: "H" },
    { t: "2026-11-27 13:36", v: 8.0, type: "L" }, { t: "2026-11-27 18:13", v: 12.9, type: "H" }] };
  const r = T.plan({ today, wx: week(today), tides, days: 1 });
  const c = tripsOn(r, today).find((t) => t.planId === "cutthroat-dash-point");
  ok(!c, "a day that ebbs through every daylight slot lists no cutthroat trip", c && c.when);
  const flood = { "9446705": [{ t: "2026-11-27 05:30", v: 2.0, type: "L" }, { t: "2026-11-27 11:45", v: 13.5, type: "H" }] };
  const r2 = T.plan({ today, wx: week(today), tides: flood, days: 1 });
  const c2 = tripsOn(r2, today).find((t) => t.planId === "cutthroat-dash-point");
  ok(c2 && /Incoming tide/.test(c2.why.join(" ")), "a morning flood up to high is the cutthroat window", c2 && c2.why.join(" | "));
  ok(c2 && c2.from >= 8 && c2.to <= 12.25 + 0.01, "the trip is fitted to the flood: from the park opening to just past high", c2 && c2.when);
}

// --- a blown-out coast is not a no-fishing day -----------------------------
{
  const today = "2026-11-28";
  const r = T.plan({ today, wx: week(today, (s, iso, h) => (s === "ocean-shores" || s === "westport" ? { wave: 14 } : { wind: 14, gust: 20 })),
    tides: tidesFor(today), days: 1 });
  const d = r.days[0];
  ok(!d.trips.some((t) => t.how === "surf" || t.planId === "clams-ocean-shores"), "14 ft surf keeps you off the beaches", d.trips.map((t) => t.planId).join(","));
  ok(!/^No fishing/.test(d.note || ""), "but the day does not claim no fishing anywhere", d.note);
}

// --- weather can cancel a day ---------------------------------------------
{
  const today = "2026-11-23";
  const r = T.plan({ today, wx: week(today, (s, iso) => (iso === "2026-11-25" ? { wind: 28, gust: 42 } : {})), tides: tidesFor(today) });
  ok(tripsOn(r, "2026-11-25").length === 0, "a 40 mph day lists no trips");
  ok(/No fishing: gusts to 42 mph/.test(r.days.find((d) => d.iso === "2026-11-25").note || ""), "and says why",
    r.days.find((d) => d.iso === "2026-11-25").note);
  ok(ids(r, "2026-11-24").includes("squid-redondo"), "the calm day next to it still has its trip");
}

// --- the kayak has tighter limits than the bank ---------------------------
{
  const today = "2027-04-10"; // Saturday, trout season
  const r = T.plan({ today, wx: week(today, () => ({ wind: 13, gust: 17 })), tides: tidesFor(today) });
  const sat = ids(r, today);
  ok(!sat.includes("trout-tapps") && !sat.includes("trout-american"), "13 mph keeps the kayak home", sat.join(","));
  ok(sat.some((x) => /^trout-/.test(x) && T.plans.find((p) => p.id === x).how === "shore"), "the same wind still fishes from the bank at a lake", sat.join(","));
  const calm = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  ok(ids(calm, today).includes("trout-american"), "a calm Saturday puts the kayak on American Lake", ids(calm, today).join(","));
  ok(ids(calm, today).filter((x) => /^surfperch-/.test(x)).length === 1, "one coast surf perch trip a day, the better beach", ids(calm, today).join(","));
  ok(!ids(calm, today).includes("trout-tapps") && calm.notListed.some((n) => /Tapps/.test(n.name) && /ramp closed/.test(n.why)),
    "Lake Tapps stays off while the ramp is closed, and says so");
}

// --- surf cancels the ocean ----------------------------------------------
{
  const today = "2026-11-28";
  const r = T.plan({ today, wx: week(today, (s) => (s === "ocean-shores" || s === "westport" ? { wave: 12 } : {})), tides: tidesFor(today) });
  ok(!ids(r, today).includes("clams-ocean-shores"), "12 ft surf cancels the clam dig");
}

// --- the beach park opens at 8 -------------------------------------------
{
  const today = "2026-11-28";
  const r = T.plan({ today, wx: week(today), tides: tidesFor(today), days: 1 });
  const c = tripsOn(r, today).find((t) => t.planId === "cutthroat-dash-point");
  ok(!c || c.from >= 8, "no cutthroat trip before the state park opens at 8 AM", c && c.from);
}

// --- a trip carries what its run card needs --------------------------------
{
  const today = "2026-11-24";
  const r = T.plan({ today, wx: week(today), tides: tidesFor(today), days: 1 });
  const sq = tripsOn(r, today).find((t) => t.planId === "squid-redondo");
  ok(sq && sq.hours.length >= 3 && sq.hours.every((h) => h.h >= Math.floor(sq.from) && h.h < sq.to), "hour by hour weather for the window");
  ok(sq && sq.tides.length === 4 && typeof sq.moon === "number" && sq.sun.set === 16.4, "the day's tides, sun and moon ride along");
}

// --- seasons ---------------------------------------------------------------
{
  const pink = T.plans.find((p) => p.id === "pink-dash-point");
  const day = (y, m, d) => ({ y, m, d, iso: `${y}-${pad(m)}-${pad(d)}` });
  ok(T.season(pink, day(2026, 8, 10)) === null, "no pinks in an even year");
  ok(T.season(pink, day(2027, 8, 10)) === "peak", "pinks peak in August of an odd year");
  const coho = T.plans.find((p) => p.id === "coho-dash-point");
  ok(T.season(coho, day(2027, 1, 10)) === null && T.season(coho, day(2026, 9, 5)) === "peak", "closures wrap the new year");
  ok(T.moonLit(Date.UTC(2026, 11, 9, 2)) < 0.05, "the Dec 9 new moon is dark", T.moonLit(Date.UTC(2026, 11, 9, 2)));
  ok(T.moonLit(Date.UTC(2026, 10, 24, 15)) > 0.9, "the Nov 24 full moon is bright", T.moonLit(Date.UTC(2026, 10, 24, 15)));
  ok(T.slotsFor(3).length === 1 && T.slotsFor(6).length === 4, "weeknights get one slot, weekends get quick, long, adventure and evening");
}

// --- every plan points at real Rig Card ids --------------------------------
{
  const spotIds = T.spots.map((s) => s.id);
  ok(T.plans.every((p) => spotIds.includes(p.spot)), "every plan's spot has weather coordinates");
  ok(new Set(T.plans.map((p) => p.id)).size === T.plans.length, "plan ids are unique");
  ok(T.plans.every((p) => p.rules), "every plan states its rules status");
}

// --- every trip that can be listed has a full run card ---------------------
{
  const C = ctx.RIG.content;
  const listable = T.plans.filter((p) => p.rules === "confirmed" && !p.access);
  const missing = listable.filter((p) => !T.runs[p.id]).map((p) => p.id);
  ok(missing.length === 0, "every listable trip has a run card", missing.join(","));
  const bad = [];
  for (const [id, r] of Object.entries(T.runs)) {
    if (!T.plans.some((p) => p.id === id)) bad.push(id + ": no such plan");
    for (const k of ["what", "setup", "during", "gear", "how", "spot", "expect", "rules"]) if (!r[k] || (Array.isArray(r[k]) && !r[k].length)) bad.push(id + ": no " + k);
    if (!r.gear.every((g) => ["have", "need", "check"].includes(g.s))) bad.push(id + ": gear status");
    const all = JSON.stringify(r);
    if (/\u2014|—/.test(all)) bad.push(id + ": em dash");
    for (const [sp, loc, card] of r.more || []) {
      let found;
      if (sp === "learn") found = C.fundamentals.some((c) => c.id === card);
      else {
        const s = C.species.find((x) => x.id === sp);
        const l = s && s.locations.find((x) => x.id === loc);
        const ids = s && [...s.cards, ...(l ? l.cards : [])].map((c) => (typeof c === "string" ? c : c.id));
        found = !!l && ids.includes(card);
      }
      if (!found) bad.push(`${id}: Go deeper link ${sp}/${loc}/${card} is not a real card`);
    }
  }
  ok(bad.length === 0, "run cards are complete and every Go deeper link is real", bad.join(" | "));
  ok(T.runs["cutthroat-dash-point"].spot.lines.some((l) => /8 AM/.test(l)) && T.runs["cutthroat-dash-point"].gear.some((g) => /Discover Pass/.test(g.i)),
    "Dash Point says the park opens at 8 and needs a Discover Pass");
}

// --- river flow: the go or no-go for every river trip -----------------------
{
  const today = "2026-11-23";
  // flowDays(cfs by day index) -> { "green-river": { days: { iso: {min,max} }, now } }
  const fl = (arr) => {
    const days = {};
    arr.forEach((v, i) => { if (v != null) days[isoAdd(today, i)] = Array.isArray(v) ? { min: v[0], max: v[1] } : { min: v, max: v }; });
    return { "green-river": { gauge: "AUBW1", days, now: { cfs: arr[0], at: "2026-11-23T20:00:00Z" } } };
  };
  const chumOn = (r, iso) => tripsOn(r, iso).find((t) => t.planId === "chum-green-river");
  const river = T.spots.find((s) => s.id === "green-river");
  ok(river.river && river.river.gauge === "AUBW1" && river.river.usgs === "12113000", "the Green reads the Auburn gauge (NOAA AUBW1, USGS 12113000)");
  ok(T.spots.filter((s) => s.river).every((s) => s.river.good > 0 && s.river.high > s.river.good && s.river.flood > s.river.high), "every river spot has good, high (no-go) and flood flows in order");
  ok(T.plans.filter((p) => T.spots.find((s) => s.id === p.spot).river).length >= 4, "every Green River plan is a river trip");

  const steady = T.plan({ today, wx: week(today), tides: tidesFor(today), flow: fl([400, 400, 400, 400, 400, 400, 400]) });
  const c1 = chumOn(steady, "2026-11-28");
  ok(c1 && c1.why.some((w) => /Good flow, 400 cfs/.test(w)), "steady fishable flow is a reason to go", c1 && c1.why.join(" | "));
  ok(c1 && c1.flow && c1.flow.cfs === 400 && c1.flow.call === "go", "the trip carries the flow for the run card", c1 && JSON.stringify(c1.flow));

  const high = T.plan({ today, wx: week(today), tides: tidesFor(today), flow: fl([400, 400, 400, 400, 400, 1600, 400]) });
  const c2 = chumOn(high, "2026-11-28");
  ok(!c2 || c2.score < c1.score, "high water scores lower", c2 && c2.score);
  ok(!c2 || c2.why.some((w) => /High water, 1,600 cfs/.test(w)), "high water says so", c2 && c2.why.join(" | "));

  const blown = T.plan({ today, wx: week(today), tides: tidesFor(today), flow: fl([400, 400, 400, 400, 400, 3200, 400]) });
  ok(!chumOn(blown, "2026-11-28"), "a blown-out river is a no-go");
  ok(!tripsOn(blown, "2026-11-28").some((t) => t.spot === "green-river"), "no river trip that day at all");
  const bd = blown.days.find((d) => d.iso === "2026-11-28");
  ok(tripsOn(blown, "2026-11-28").length > 0, "the lakes and the salt still fish when the river blows out");
  ok(!bd.note || !/No fishing/.test(bd.note), "a blown river alone is not a no-fishing day", bd.note);

  const rising = T.plan({ today, wx: week(today), tides: tidesFor(today), flow: fl([400, 400, 400, 400, 400, [500, 1100], 400]) });
  const c3 = chumOn(rising, "2026-11-28");
  ok(!c3 || c3.why.some((w) => /River rising/.test(w)), "a river coming up fast says so", c3 && c3.why.join(" | "));
  ok(!c3 || c3.score < c1.score, "rising water scores lower than steady", c3 && c3.score);

  const dropping = T.plan({ today, wx: week(today), tides: tidesFor(today), flow: fl([400, 400, 400, 400, 1500, 700, 400]) });
  const c4 = chumOn(dropping, "2026-11-28");
  ok(c4 && c4.why.some((w) => /Dropping after a rise/.test(w)), "dropping after a bump is the good day", c4 && c4.why.join(" | "));

  const none = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  const c5 = chumOn(none, "2026-11-28");
  ok(c5 && c5.why.some((w) => /No river reading/.test(w)), "no flow data is said out loud, not hidden", c5 && c5.why.join(" | "));
  ok(c5 && c5.flow && c5.flow.call === "unknown", "no flow data means the call is unknown");

  const sq = tripsOn(steady, "2026-11-24").find((t) => t.planId === "squid-redondo");
  ok(sq && !sq.flow && !sq.why.some((w) => /cfs|river/i.test(w)), "salt and lake trips ignore river flow");

  // NOAA NWPS stageflow -> days in local time, kcfs -> cfs.
  const nw = { observed: { data: [{ validTime: "2026-11-23T20:00:00Z", primary: 0.273 }, { validTime: "2026-11-24T02:45:00Z", primary: 0.31 }] },
    forecast: { data: [{ validTime: "2026-11-24T06:00:00Z", primary: 0.29 }, { validTime: "2026-11-24T12:00:00Z", primary: 0.9 }, { validTime: "2026-11-25T18:00:00Z", primary: 1.2 }] } };
  const f = T.shapeFlow(nw);
  ok(f.days["2026-11-23"] && f.days["2026-11-23"].max === 310 && f.days["2026-11-23"].min === 273, "late-evening UTC readings land on the local day", JSON.stringify(f.days));
  ok(f.days["2026-11-24"] && f.days["2026-11-24"].max === 900, "forecast days carry their peak", JSON.stringify(f.days));
  ok(f.now && f.now.cfs === 310, "now is the last observed reading", JSON.stringify(f.now));
  ok(f.ends === "2026-11-25", "the forecast says how far out it goes", f.ends);
  const u2 = T.urls("2026-11-23", "2026-11-30");
  ok(u2.flow && u2.flow.some((x) => x.spot === "green-river" && /nwps\/v1\/gauges\/AUBW1\/stageflow/.test(x.url)), "one flow call per river gauge");
}

// --- more water: batch 1 (squid piers, pier salmon, stocked lakes) --------
{
  const today = "2026-11-23";
  const r = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  const tue = tripsOn(r, "2026-11-24");
  const squid = tue.filter((t) => t.species === "squid");
  ok(squid.length === 1, "one squid trip a night, the best pier", tue.map((t) => t.planId).join(","));
  ok(squid[0] && squid[0].why.some((w) => /^Also good: /.test(w)), "the other squid piers are named as backups", squid[0] && squid[0].why.join(" | "));
  for (const id of ["squid-les-davis", "squid-point-defiance", "squid-des-moines", "salmon-les-davis", "salmon-point-defiance",
    "salmon-des-moines", "salmon-redondo", "salmon-fox-island"]) {
    const p = T.plans.find((x) => x.id === id);
    ok(p && p.rules === "confirmed" && T.runs[id], `${id} is in, rules confirmed, with a run card`);
  }
  // Stocked lakes now come from CastAI's waters feed (rigs/waters.js), not hand typing.
  const W = ctx.RIG.watersSnapshot;
  ok(W && W.waters.length >= 10, "the CastAI waters snapshot carries the stocked lakes", W && W.waters.length);
  ok(W.waters.every((w) => w.plants.every((p) => p.fpp <= 6)), "only catchable-size plants count, never fry");
  const gen = T.plans.filter((p) => p.gen);
  ok(gen.length === W.waters.length, "every stocked water became a trip plan", gen.length + " vs " + W.waters.length);
  ok(gen.filter((p) => p.rules === "confirmed").every((p) => T.runs[p.id] && T.runs[p.id].rules.some((x) => /5 a day/.test(x))), "every listable lake has a run card with the trout limit");
  ok(gen.filter((p) => /gear rule|East of the mountains/.test(p.rules)).length >= 2, "lakes with gear rules or unread rules are held back, not listed");
  const cady = gen.find((p) => /Cady/.test(p.name));
  ok(!cady || cady.rules !== "confirmed", "Cady Lake (fly fishing only) is never sent out with a PowerBait card");
  // A plant 10 days ago is peak with the real numbers; 45 days is in season; 90 days is not.
  const fake = { waters: [{ geo: "LTEST", name: "Test Lake", county: "Pierce", lat: 47.2, lon: -122.2, km: 5,
    plants: [{ d: "2026-11-13", sp: "Rainbow", n: 600, fpp: 0.5 }], rule: { status: "ok", open: "all", lines: [] } }] };
  T.addWaters(fake);
  const tp = T.plans.find((p) => p.id === "trout-w-ltest");
  ok(tp && T.season(tp, { y: 2026, m: 11, d: 23, iso: "2026-11-23" }) === "peak", "10 days after a plant is peak");
  ok(T.season(tp, { y: 2026, m: 12, d: 28, iso: "2026-12-28" }) === "ok" && T.season(tp, { y: 2027, m: 2, d: 11, iso: "2027-02-11" }) === null, "45 days is in season, 90 days is not");
  const r2 = T.plan({ today, wx: week(today), tides: tidesFor(today), waters: fake });
  const tl = tripsOn(r2, "2026-11-28").find((t) => t.planId === "trout-w-ltest");
  ok(tl && tl.why.some((w) => /Stocked Nov 13: 600 rainbow, about 2 lb each/.test(w)), "the trip says when, how many and how big", tl && tl.why.join(" | "));
  ok(ctx.RIG.rules.places["w-ltest"] && ctx.RIG.rules.places["w-ltest"].re.test("Test Lake closure"), "every generated lake is watched by the WDFW rule check");
  T.addWaters(W);
  ok(!T.plans.some((p) => p.id === "trout-w-ltest"), "a new feed replaces the old generated lakes");
  ok(T.runs["salmon-fox-island"].rules.some((x) => /release chum/i.test(x)), "Fox Island pier says release chum");
  ok(T.runs["squid-les-davis"].rules.some((x) => /one line/i.test(x)) && T.runs["squid-les-davis"].rules.some((x) => /5 quarts/.test(x)), "squid piers carry the one-line rule and the limit");
  const pierSalmon = T.plans.find((x) => x.id === "salmon-les-davis");
  ok(T.season(pierSalmon, { y: 2026, m: 6, d: 10, iso: "2026-06-10" }) === null, "pier salmon is a winter trip here (May to Sept is the open-water season)");
  const missing = T.spots.filter((s) => !ctx.RIG.rules.places[s.id]).map((s) => s.id);
  ok(missing.length === 0, "every spot is watched by the WDFW rule check", missing.join(","));
  ok(T.runs["trout-fenwick"].rules.some((x) => /5 a day/.test(x)), "Fenwick now carries the confirmed trout limit");
}

// --- a weeknight says why the lakes are not on it -------------------------
{
  // December: a lake is stocked and 13 minutes away, but it is dark by
  // 4:24 PM and the only weeknight window is after work.
  const today = "2026-12-07"; // Monday
  const fake = { waters: [{ geo: "LTEST", name: "Test Lake", county: "Pierce", lat: 47.18, lon: -122.17, km: 5,
    plants: [{ d: "2026-12-05", sp: "Rainbow", n: 600, fpp: 0.5 }], rule: { status: "ok", open: "all", lines: [] } }] };
  T.addWaters(fake);
  const r = T.plan({ today, wx: week(today), tides: tidesFor(today), waters: fake });
  const mon = r.days.find((d) => d.iso === today);
  ok(/no daylight after work/i.test(mon.note || ""), "a winter weeknight says there is no daylight after work", mon.note);
  ok(/4:24 PM/.test(mon.note || ""), "it says when the sun goes down", mon.note);
  ok(/Test Lake/.test(mon.note || ""), "it names what is waiting for the weekend", mon.note);
  ok(mon.trips.some((t) => t.species === "squid"), "night trips still list on that weeknight", mon.trips.map((t) => t.planId).join(","));
  const sat = r.days.find((d) => d.iso === "2026-12-12");
  ok(sat.trips.some((t) => t.planId === "trout-w-ltest"), "the same lake fishes fine on the weekend", sat.trips.map((t) => t.planId).join(","));
  ok(!/no daylight after work/i.test(sat.note || ""), "a weekend day never blames the dark", sat.note);
  // A day with nothing on it names the closest miss instead of going quiet.
  const gale = T.plan({ today, wx: week(today, (sp, iso) => (iso === "2026-12-09" ? { wind: 26, gust: 44 } : {})), tides: tidesFor(today), waters: fake });
  const wed = gale.days.find((d) => d.iso === "2026-12-09");
  ok(wed.trips.length === 0 && /No fishing/.test(wed.note || ""), "a blown-out weeknight still says no fishing", wed.note);
  ok(!/mph No daylight/.test(wed.note || "") && /mph\. No daylight/.test(wed.note || ""), "two reasons on one day read as two sentences", wed.note);
  T.addWaters(ctx.RIG.watersSnapshot);
}

// --- more water: batch 2 (winter steelhead rivers) ------------------------
{
  const today = "2026-12-05"; // Saturday
  const wx = week(today);
  const flow = {};
  for (const sp of T.spots.filter((x) => x.river)) {
    const days = {}; for (let i = 0; i < 7; i++) days[isoAdd(today, i)] = { min: sp.river.good * 0.6, max: sp.river.good * 0.7 };
    flow[sp.id] = { days, now: { cfs: sp.river.good * 0.6, at: "2026-12-05T18:00:00Z" } };
  }
  const r = T.plan({ today, wx, tides: tidesFor(today), flow });
  for (const id of ["steelhead-tokul", "steelhead-cowlitz"]) {
    const p = T.plans.find((x) => x.id === id);
    ok(p && p.rules === "confirmed" && T.runs[id], `${id} is in, rules confirmed, with a run card`);
  }
  const all = r.days.flatMap((d) => d.trips).concat(r.days.flatMap((d) => d.trips));
  const tok = r.days.flatMap((d) => d.trips).filter((t) => t.planId === "steelhead-tokul" || (t.alts || []).includes("steelhead-tokul"));
  ok(tok.length > 0, "Tokul Creek steelhead shows on a December weekend", r.days.map((d) => d.trips.map((t) => t.planId).join("+")).join(" / "));
  const tk = r.days.flatMap((d) => d.trips).find((t) => t.planId === "steelhead-tokul");
  ok(!tk || (tk.from >= 7 && tk.to <= 17), "Tokul trips stay inside 7 AM to 5 PM", tk && tk.when);
  ok(T.season(T.plans.find((x) => x.id === "steelhead-tokul"), { y: 2027, m: 2, d: 20, iso: "2027-02-20" }) === null, "Tokul closes after Feb 15");
  ok(T.runs["steelhead-cowlitz"].rules.some((x) => /Endorsement/i.test(x)) && T.runs["steelhead-cowlitz"].gear.some((g) => /Endorsement/.test(g.i)), "Cowlitz says it needs the Columbia River endorsement");
  ok(T.spots.find((x) => x.id === "cowlitz").drive >= 90, "the Cowlitz is an adventure day drive");
  ok(T.runs["steelhead-tokul"].rules.some((x) => /5 PM to 7 AM/.test(x)), "Tokul carries the night closure");
}

// --- the sky: the screen is the light you are standing in -----------------
{
  const S = ctx.RIG.sky, sun = { rise: 7.5, set: 16.4 };
  ok(S.phase(12, sun, { clouds: 20, rain: 0 }) === "bright" && S.phase(12, sun, { clouds: 90, rain: 0 }) === "overcast",
    "midday reads the cloud cover");
  ok(S.phase(12, sun, { clouds: 95, rain: 0.05 }) === "rain", "rain has its own sky");
  ok(S.phase(21, sun, {}) === "night" && S.phase(5, sun, {}) === "night", "after dark is night");
  ok(!S.paletteFor(S.phase(12, sun, { clouds: 90 })).dark && S.paletteFor(S.phase(21, sun, {})).dark,
    "daylight is a light screen, night is a dark one");
  ok(S.resolve(12, sun, { clouds: 90 }, "dark").p.dark && !S.resolve(21, sun, {}, "light").p.dark,
    "the switch beats the sky, for glare");
  ok(S.resolve(12, sun, { clouds: 90 }, "dark").forced, "a held screen says it is held");
  // Every palette has to carry the whole set, or the app loses a colour.
  const need = ["sky", "water", "ground", "paper", "line", "ink", "ink2", "dim", "accent", "accent2", "gold", "onGold", "shore"];
  const missing = Object.entries(S.palettes).flatMap(([k, p]) => need.filter((n) => p[n] == null).map((n) => k + "." + n));
  ok(missing.length === 0, "every sky carries every colour", missing.join(","));
  // Readable in sun: small text and text on the gold tag.
  const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const low = Object.entries(S.palettes).filter(([, p]) =>
    ratio(p.dim, p.paper) < 4.5 || ratio(p.accent, p.paper) < 4.5 || ratio(p.onGold, p.gold) < 4.5 || ratio(p.ink, p.paper) < 7);
  ok(low.length === 0, "every sky keeps small text readable (4.5:1)", low.map(([k]) => k).join(","));
}

// --- the API shapes become planner input -----------------------------------
{
  const n = T.spots.length;
  const wxJson = T.spots.map(() => ({
    hourly: { time: ["2026-11-23T17:00"], temperature_2m: [44], precipitation: [0], wind_speed_10m: [5], wind_gusts_10m: [9], cloud_cover: [92] },
    daily: { time: ["2026-11-23"], sunrise: ["2026-11-23T07:31"], sunset: ["2026-11-23T16:24"] }
  }));
  const u = T.urls("2026-11-23", "2026-11-30");
  const marine = u.marineSpots.map(() => ({ hourly: { time: ["2026-11-23T17:00"], wave_height: [6.5] } }));
  const shaped = T.shape(wxJson, marine, u.marineSpots, { "9446248": { predictions: [{ t: "2026-11-23 17:15", v: "11.9", type: "H" }] } });
  ok(Object.keys(shaped.wx).length === n, "one weather series per spot");
  ok(Math.abs(shaped.wx.redondo.sun["2026-11-23"].set - 16.4) < 0.01, "sunset becomes a local hour");
  ok(shaped.wx.redondo.hours[0].clouds === 92, "cloud cover rides along, so the screen knows the sky", JSON.stringify(shaped.wx.redondo.hours[0]));
  ok(/cloud_cover/.test(u.wx), "the weather call asks for cloud cover");
  ok(shaped.wx["ocean-shores"].hours[0].wave === 6.5 && shaped.wx.redondo.hours[0].wave === undefined, "waves only on the ocean");
  ok(shaped.tides["9446248"][0].v === 11.9, "tide heights become numbers");
  ok(/latitude=47\.349,/.test(u.wx) && /forecast_days=7/.test(u.wx), "one weather call covers every spot");
  ok(u.tides.length === new Set(T.spots.map((s) => s.tide).filter(Boolean)).size, "one tide call per station");
}

// --- the phone app matches the family (gold line-and-dot on dark) ---------
{
  const { existsSync } = await import("node:fs");
  const m = JSON.parse(readFileSync(resolve(ROOT, "rigs/manifest.webmanifest"), "utf8"));
  ok(m.icons.every((i) => existsSync(resolve(ROOT, i.src.replace(/^\//, "")))), "every manifest icon file exists", m.icons.map((i) => i.src).join(","));
  const png = readFileSync(resolve(ROOT, "rigs/icon-v4-512.png"));
  ok(png.length > 1000 && m.icons.some((i) => /icon-v4-512/.test(i.src)), "the gold hook icon ships at 512");
  const html = readFileSync(resolve(ROOT, "rigs/index.html"), "utf8");
  const touch = /rel="apple-touch-icon" href="([^"]+)"/.exec(html);
  ok(touch && existsSync(resolve(ROOT, touch[1].slice(1))) && /apple-mobile-web-app-title" content="Rig Card"/.test(html), "iPhone home screen gets the icon and the name");
}

// --- one trip, asked for by name: what a crew trip page shows -------------
{
  const today = "2026-11-23"; // Monday
  const wx = week(today), tides = tidesFor(today);
  const r = T.plan({ today, wx, tides });
  const heatFor = (n) => (n >= 8 ? "Hot" : n >= 6 ? "Good" : "Slow");

  // ok at Hot, no window given: a dark trip runs from full dark onward.
  const hot = T.detail({ planId: "squid-redondo", iso: "2026-11-24", wx, tides });
  ok(hot.status === "ok" && hot.trip.planId === "squid-redondo" && hot.trip.score >= 8 && hot.trip.heat === "Hot",
    "detail: a calm squid night is ok and Hot", JSON.stringify(hot).slice(0, 200));
  ok(hot.trip && Math.abs(hot.trip.from - 17) < 0.01 && hot.trip.to === 22, "detail: no window puts a night trip at full dark to 10 PM", hot.trip && hot.trip.when);
  ok(hot.trip && hot.trip.slot === "Crew trip", "detail: the slot is named Crew trip", hot.trip && hot.trip.slot);
  ok(hot.trip && hot.trip.name === "Squid at Redondo" && hot.trip.hours.length >= 3 && hot.trip.tides.length === 4 && hot.trip.sun.set === 16.4 && hot.trip.why.length >= 3,
    "detail: the trip carries its name, hours, tides, sun and reasons like a week trip");

  // ok below the 6 point cut: in season but slow, so the week leaves it off.
  const slow = T.detail({ planId: "trout-fenwick", iso: "2026-11-28", wx, tides });
  ok(!r.days.some((d) => d.trips.some((t) => t.planId === "trout-fenwick" || (t.alts || []).includes("trout-fenwick"))), "the week leaves slow Lake Fenwick off");
  ok(slow.status === "ok" && slow.trip.score < 6 && slow.trip.heat === "Slow", "detail: a trip under the cut still answers ok, heat Slow", JSON.stringify(slow).slice(0, 200));
  ok(slow.trip && slow.trip.from === 7.5 && slow.trip.to === 16.4, "detail: no window puts a daylight trip at sunrise to sunset", slow.trip && slow.trip.when);
  const late = T.detail({ planId: "trout-fenwick", iso: "2026-11-28", from: 10, wx, tides });
  ok(late.status === "ok" && late.trip.from === 10 && late.trip.to === 16.4, "detail: a start with no end still ends at sunset", late.trip && late.trip.when);

  // Every listed trip of the week, asked for with its own window, is the same trip.
  const listed = r.days.flatMap((d) => d.trips.map((t) => ({ iso: d.iso, t })));
  const drift = listed.filter(({ iso, t }) => {
    const x = T.detail({ planId: t.planId, iso, from: t.from, to: t.to, wx, tides });
    return !(x.status === "ok" && x.trip.when === t.when && x.trip.score === t.score && x.trip.heat === t.heat &&
      x.trip.why.join("|") === t.why.filter((w) => !/^Also good: /.test(w)).join("|"));
  }).map(({ iso, t }) => iso + " " + t.planId);
  ok(listed.length >= 8 && drift.length === 0, "detail: a listed trip gets the same when, why and score the week shows", drift.join(", "));

  // Every plan, every day: one of the six answers, never a throw, heat matches the score.
  const seen = {}, heats = {}, bad = [];
  for (const p of T.plans) for (let i = 0; i < 9; i++) {
    const iso = isoAdd(today, i);
    let x;
    try { x = T.detail({ planId: p.id, iso, wx, tides }); } catch (e) { bad.push(p.id + " " + iso + " threw " + e.message); continue; }
    seen[x.status] = (seen[x.status] || 0) + 1;
    if (!["ok", "nogo", "dark", "closed", "nodata"].includes(x.status)) bad.push(p.id + " " + iso + " " + x.status);
    if (x.status === "ok") {
      heats[x.trip.heat] = true;
      if (x.trip.planId !== p.id || x.trip.heat !== heatFor(x.trip.score) || !x.trip.when || !x.trip.hours.length) bad.push(p.id + " " + iso + " trip shape");
    }
    if (i >= 7 && x.status !== "closed" && x.status !== "nodata") bad.push(p.id + " " + iso + " past the forecast: " + x.status);
  }
  ok(bad.length === 0, "detail: every plan answers every day with a known status", bad.slice(0, 5).join(" | "));
  ok(heats.Hot && heats.Good && heats.Slow, "detail: Hot is 8 and up, Good is 6 and 7, Slow is under 6", Object.keys(heats).join(","));
  ok(T.plans.some((p) => p.gen && T.detail({ planId: p.id, iso: today, wx, tides }).status !== "unknown"), "detail: lakes from the waters feed are known by their id");

  // nogo from wind, in the week's own words.
  const windy = week(today, (s, iso) => (iso === "2026-11-25" ? { gust: 32 } : {}));
  const blow = T.detail({ planId: "squid-redondo", iso: "2026-11-25", wx: windy, tides });
  ok(blow.status === "nogo" && blow.why === "gusts to 32 mph" && !blow.trip, "detail: 32 mph gusts are a no-go, and it says so", JSON.stringify(blow));
  const note = T.plan({ today, wx: windy, tides }).days.find((d) => d.iso === "2026-11-25").note || "";
  ok(note.includes(blow.why), "detail: the no-go reason is the one the week prints", note);
  ok(T.detail({ planId: "squid-redondo", iso: "2026-11-24", wx: windy, tides }).status === "ok", "detail: the calm day next to it is still ok");
  const wet = T.detail({ planId: "trout-fenwick", iso: "2026-11-28", wx: week(today, () => ({ rain: 0.4 })), tides });
  ok(wet.status === "nogo" && wet.why === "heavy rain", "detail: heavy rain is a no-go", JSON.stringify(wet));
  const surf = T.detail({ planId: "clams-ocean-shores", iso: "2026-11-26", wx: week(today, (s) => (s === "ocean-shores" ? { wave: 12 } : {})), tides });
  ok(surf.status === "nogo" && surf.why === "12 ft surf", "detail: big surf is a no-go for the dig", JSON.stringify(surf));

  // nogo from a blown-out river.
  const flowAt = (v) => ({ "green-river": { days: { "2026-11-27": { min: 400, max: 400 }, "2026-11-28": { min: v, max: v } } } });
  const blown = T.detail({ planId: "chum-green-river", iso: "2026-11-28", wx, tides, flow: flowAt(3200) });
  ok(blown.status === "nogo" && blown.why === "river blown out, 3,200 cfs", "detail: a blown-out river is a no-go with the flow", JSON.stringify(blown));
  const runs = T.detail({ planId: "chum-green-river", iso: "2026-11-28", wx, tides, flow: flowAt(400) });
  ok(runs.status === "ok" && runs.trip.flow && runs.trip.flow.call === "go" && runs.trip.flow.cfs === 400, "detail: a fishable river is ok and carries its flow", JSON.stringify(runs).slice(0, 200));

  // A window the trip cannot use is a no-go with the reason, never a blank.
  const noon = T.detail({ planId: "squid-redondo", iso: "2026-11-24", from: 9, to: 13, wx, tides });
  ok(noon.status === "nogo" && /after dark, from 5:00 PM/.test(noon.why), "detail: a night trip in a daylight window says it fishes after dark", JSON.stringify(noon));
  const dig = T.detail({ planId: "clams-ocean-shores", iso: "2026-11-26", from: 7, to: 11, wx, tides });
  ok(dig.status === "nogo" && /7:35 PM low/.test(dig.why), "detail: a dig window that misses the low says when the low is", JSON.stringify(dig));
  const ebb = { "9446705": [{ t: "2026-11-27 00:45", v: -3.5, type: "L" }, { t: "2026-11-27 07:56", v: 14.7, type: "H" },
    { t: "2026-11-27 13:36", v: 8.0, type: "L" }, { t: "2026-11-27 18:13", v: 12.9, type: "H" }] };
  const out = T.detail({ planId: "cutthroat-dash-point", iso: "2026-11-27", from: 9, to: 13, wx, tides: ebb });
  ok(out.status === "nogo" && /incoming tide/.test(out.why), "detail: an incoming-tide fish in a window that only ebbs is a no-go", JSON.stringify(out));
  const aft = T.detail({ planId: "cutthroat-dash-point", iso: "2026-11-27", wx, tides: ebb });
  ok(aft.status === "ok" && Math.abs(aft.trip.from - 13.6) < 0.01 && aft.trip.to === 16.4, "detail: with no window it finds the afternoon flood, low to sunset", JSON.stringify(aft).slice(0, 200));
  ok(T.detail({ planId: "cutthroat-dash-point", iso: "2026-11-27", wx }).status === "nodata", "detail: an incoming-tide fish with no tide table is no data, not a guess");
  const eve = T.detail({ planId: "cutthroat-dash-point", iso: "2026-11-27", from: 16.5, to: 20.5, wx, tides: ebb });
  ok(eve.status === "dark" && eve.sunset === 16.4, "detail: an incoming-tide fish after sunset is dark, not a tide story", JSON.stringify(eve));
  const spring = "2027-04-10", wxSpring = week(spring);
  for (const sp of Object.keys(wxSpring)) for (const d of Object.keys(wxSpring[sp].sun)) wxSpring[sp].sun[d] = { rise: 6.4, set: 19.9 };
  const early = T.detail({ planId: "cutthroat-dash-point", iso: spring, from: 6, to: 8, wx: wxSpring, tides: tidesFor(spring) });
  ok(early.status === "nogo" && early.why === "the spot opens at 8:00 AM", "detail: daylight before the park opens says when it opens, not dark", JSON.stringify(early));

  // closed: out of season, or inside a closed range, with or without a forecast.
  const shut = T.detail({ planId: "coho-dash-point", iso: "2026-11-24", wx, tides });
  ok(shut.status === "closed" && shut.why === undefined, "detail: inside a closed range is closed", JSON.stringify(shut));
  ok(T.detail({ planId: "bass-fenwick", iso: "2026-11-24", wx, tides }).status === "closed", "detail: out of season is closed");
  ok(T.detail({ planId: "bass-fenwick", iso: "2027-01-15", wx, tides }).status === "closed", "detail: out of season is closed even past the forecast");
  ok(T.detail({ planId: "clams-ocean-shores", iso: "2026-11-29", wx, tides }).status === "closed", "detail: a day with no dig is closed");

  // closed with a why: the plans the app does not send anyone to.
  const dec = "2026-12-05", wxDec = week(dec), tidesDec = tidesFor(dec);
  const held = T.detail({ planId: "steelhead-green-river", iso: dec, wx: wxDec, tides: tidesDec });
  const said = T.plan({ today: dec, wx: wxDec, tides: tidesDec }).notListed.find((n) => /steelhead on the Green/.test(n.name));
  ok(held.status === "closed" && /December steelhead limit not confirmed/.test(held.why), "detail: unconfirmed rules are closed, with the reason", JSON.stringify(held));
  ok(said && said.why === held.why, "detail: that reason is the one the week's not-listed note gives");
  const apr = "2027-04-10";
  const ramp = T.detail({ planId: "trout-tapps", iso: apr, wx: week(apr), tides: tidesFor(apr) });
  ok(ramp.status === "closed" && /ramp closed/.test(ramp.why), "detail: a closed ramp is closed, with the reason", JSON.stringify(ramp));

  // nodata: the forecast does not reach the day, or there is none.
  ok(T.detail({ planId: "squid-redondo", iso: "2026-12-03", wx, tides }).status === "nodata", "detail: ten days out is past the forecast");
  ok(T.detail({ planId: "squid-redondo", iso: "2026-11-24" }).status === "nodata", "detail: no forecast at all is no data");
  ok(T.detail({ planId: "squid-redondo", iso: "2026-11-24", wx: { "lake-fenwick": wx["lake-fenwick"] }, tides }).status === "nodata", "detail: a forecast for other spots only is no data");

  // unknown: no such plan.
  ok(T.detail({ planId: "no-such-trip", iso: "2026-11-24", wx, tides }).status === "unknown", "detail: an id the app does not have is unknown");
  ok(T.detail({ iso: "2026-11-24", wx, tides }).status === "unknown" && T.detail().status === "unknown", "detail: no id is unknown, not a crash");

  // Lakes from the waters feed, and dark: a daylight trip in a window with no daylight.
  const lake = (geo, rule) => ({ geo, name: "Test Lake", county: "Pierce", lat: 47.18, lon: -122.17, km: 5,
    plants: [{ d: "2026-12-05", sp: "Rainbow", n: 600, fpp: 0.5 }], rule });
  T.addWaters({ waters: [lake("LTEST", { status: "ok", open: "all", lines: [] }), lake("LHELD", { status: "check", why: "Fly fishing only" })] });
  const mon = "2026-12-07", wxMon = week(mon);
  const dk = T.detail({ planId: "trout-w-ltest", iso: mon, from: 16.5, to: 20.5, wx: wxMon });
  ok(dk.status === "dark" && dk.sunset === 16.4 && !dk.trip, "detail: a lake after work in December is dark, with the sunset", JSON.stringify(dk));
  const lit = T.detail({ planId: "trout-w-ltest", iso: mon, wx: wxMon });
  ok(lit.status === "ok" && lit.trip.from === 7.5 && lit.trip.to === 16.4 && lit.trip.why.some((w) => /Stocked Dec 5: 600 rainbow/.test(w)),
    "detail: the same lake with no window fishes sunrise to sunset", JSON.stringify(lit).slice(0, 200));
  const hour = T.detail({ planId: "trout-w-ltest", iso: mon, from: 10, to: 11, wx: wxMon });
  ok(hour.status === "ok" && hour.trip.from === 10 && hour.trip.to === 11 && hour.trip.hours.length === 1, "detail: a one hour window in daylight is a trip, not dark", JSON.stringify(hour).slice(0, 200));
  const dusk = T.detail({ planId: "trout-w-ltest", iso: mon, from: 16, to: 17, wx: wxMon });
  ok(dusk.status === "dark" && dusk.sunset === 16.4, "detail: a one hour window the sunset cuts short is dark", JSON.stringify(dusk));
  ok(T.detail({ planId: "trout-w-ltest", iso: mon, from: 16.5, to: 20.5 }).status === "nodata", "detail: with no forecast it never makes up a sunset");
  const fly = T.detail({ planId: "trout-w-lheld", iso: mon, wx: wxMon });
  ok(fly.status === "closed" && fly.why === "Fly fishing only", "detail: a lake held back for its rules is closed, with the rule", JSON.stringify(fly));
  T.addWaters(ctx.RIG.watersSnapshot);
  ok(T.detail({ planId: "trout-w-ltest", iso: mon, wx: wxMon }).status === "unknown", "detail: a lake the feed dropped is unknown");

  // Pure: same answer twice, and the forecast handed in is left alone.
  const before = JSON.stringify(wx);
  const again = T.detail({ planId: "squid-redondo", iso: "2026-11-24", wx, tides });
  ok(JSON.stringify(again) === JSON.stringify(hot) && JSON.stringify(wx) === before, "detail: the same question gets the same answer and changes nothing");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
