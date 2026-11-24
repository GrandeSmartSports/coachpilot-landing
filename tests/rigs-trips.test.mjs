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

// --- the API shapes become planner input -----------------------------------
{
  const n = T.spots.length;
  const wxJson = T.spots.map(() => ({
    hourly: { time: ["2026-11-23T17:00"], temperature_2m: [44], precipitation: [0], wind_speed_10m: [5], wind_gusts_10m: [9] },
    daily: { time: ["2026-11-23"], sunrise: ["2026-11-23T07:31"], sunset: ["2026-11-23T16:24"] }
  }));
  const u = T.urls("2026-11-23", "2026-11-30");
  const marine = u.marineSpots.map(() => ({ hourly: { time: ["2026-11-23T17:00"], wave_height: [6.5] } }));
  const shaped = T.shape(wxJson, marine, u.marineSpots, { "9446248": { predictions: [{ t: "2026-11-23 17:15", v: "11.9", type: "H" }] } });
  ok(Object.keys(shaped.wx).length === n, "one weather series per spot");
  ok(Math.abs(shaped.wx.redondo.sun["2026-11-23"].set - 16.4) < 0.01, "sunset becomes a local hour");
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
