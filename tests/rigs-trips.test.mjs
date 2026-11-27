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

// --- nothing waits for a weekend that is blown out too --------------------
{
  const today = "2026-11-23"; // Monday
  const calm = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  ok(calm.days.slice(0, 3).some((d) => /Waiting for the weekend/.test(d.dark || "")), "with a weekend that fishes, a dark weeknight names what waits for it",
    calm.days.slice(0, 3).map((d) => d.dark).join(" | "));
  const gale = T.plan({ today, wx: week(today, () => ({ wind: 28, gust: 42 })), tides: tidesFor(today) });
  ok(gale.days.every((d) => d.trips.length === 0), "a week of 42 mph gusts lists no trips");
  ok(gale.days.every((d) => !/Waiting for the weekend/.test((d.dark || "") + (d.note || ""))), "and no day says anything is waiting for the weekend",
    gale.days.map((d) => d.note).join(" | "));
  ok(gale.days.slice(0, 3).some((d) => /No daylight after work, sunset 4:24 PM\.$/.test(d.dark || "")), "the weeknight's own reason still stands, as a whole sentence",
    gale.days.slice(0, 3).map((d) => d.dark).join(" | "));
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
  ok(T.spots.filter((s) => s.river).every((s) => s.river.good > 0 && s.river.high > s.river.good && (s.river.flood == null ? s.river.floodStage > 0 : s.river.flood > s.river.high)),
    "every river spot has good, high (no-go) and flood flows in order, or a flood stage where NWS gives flood only as a stage (PUYW1)");
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

// --- spring-only lakes: closed until the 4th Saturday in April, every year --
{
  const plant = (d, n) => ({ d, sp: "Rainbow", n, fpp: 2.5 });
  const springLake = { geo: "LSPRING", name: "Opener Lake", county: "King", lat: 47.4, lon: -122.1, km: 12,
    // WDFW plants these in the weeks before opening day, while the lake is still closed.
    plants: [plant("2026-04-15", 900), plant("2027-03-10", 900), plant("2027-04-15", 900), plant("2027-10-10", 300)],
    rule: { status: "ok", open: "spring", closed: [["11-01", "04-27"]], lines: ["Open the 4th Saturday in April to Oct 31 only.", "WDFW special rule: Chumming permitted."] } };
  const allYear = { geo: "LALLYEAR", name: "All Year Lake", county: "King", lat: 47.41, lon: -122.11, km: 13, plants: [plant("2027-04-15", 900)],
    rule: { status: "ok", open: "all", lines: ["Open all year.", "WDFW special rule, crappie: Min. size 9\". Daily limit 10."] } };
  T.addWaters({ waters: [springLake, allYear] });
  const id = "trout-w-lspring", p = T.plans.find((x) => x.id === id);
  const day = (iso) => { const [y, m, d] = iso.split("-").map(Number); return { y, m, d, iso }; };
  ok(p && p.rules === "confirmed", "a spring-only lake is a plan with confirmed rules");
  ok(T.season(p, day("2027-03-20")) === null && T.season(p, day("2027-04-20")) === null, "stocked in March, still closed: a plant does not open a closed lake");
  // The 4th Saturday in April: the 24th in 2027, the 25th in 2026.
  ok(T.season(p, day("2027-04-23")) === null, "2027: closed on Friday Apr 23, the day before the opener");
  ok(T.season(p, day("2027-04-24")) === "peak" && T.season(p, day("2027-04-25")) === "peak", "2027: open on opening weekend, Apr 24 and 25",
    T.season(p, day("2027-04-24")) + " " + T.season(p, day("2027-04-25")));
  ok(T.season(p, day("2026-04-24")) === null && T.season(p, day("2026-04-25")) === "peak", "2026: the opener is Apr 25, not a day sooner",
    T.season(p, day("2026-04-24")) + " " + T.season(p, day("2026-04-25")));
  ok(T.season(p, day("2027-10-31")) === "peak" && T.season(p, day("2027-11-01")) === null, "open through Oct 31, closed again on Nov 1");
  // The week of the 2027 opener: nothing before Saturday, then it is on the list.
  const today = "2027-04-19", wx = week(today); // Monday
  for (const sp of Object.keys(wx)) for (const d of Object.keys(wx[sp].sun)) wx[sp].sun[d] = { rise: 6.2, set: 20.1 };
  const r = T.plan({ today, wx, tides: tidesFor(today) });
  const listed = (iso, pid) => tripsOn(r, iso).some((t) => t.planId === pid || (t.alts || []).includes(pid));
  const early = ["2027-04-19", "2027-04-20", "2027-04-21", "2027-04-22", "2027-04-23"].filter((iso) => listed(iso, id));
  ok(early.length === 0, "the week before the opener never lists the closed lake", early.join(","));
  ok(listed("2027-04-21", "trout-w-lallyear"), "a year-round lake stocked the same day is on that week", ids(r, "2027-04-21").join(","));
  ok(listed("2027-04-24", id) && listed("2027-04-25", id), "opening weekend lists it", ids(r, "2027-04-24").join(",") + " / " + ids(r, "2027-04-25").join(","));
  ok(T.detail({ planId: id, iso: "2027-04-23", wx }).status === "closed" && T.detail({ planId: id, iso: "2027-04-24", wx }).status === "ok", "a crew trip there is closed on the 23rd and a trip on the 24th");
  // F11: the Rules card of a spring lake starts with its own season.
  const card = T.runs[id].rules, yr = T.runs["trout-w-lallyear"].rules;
  ok(card[0] === "Open the 4th Saturday in April to Oct 31 only." && !card.some((x) => /^Open all year/.test(x)),
    "a spring-only lake's Rules card starts with its own season, and never says open all year", card.join(" | "));
  ok(card.some((x) => /5 a day/.test(x)) && card.some((x) => /Chumming permitted/.test(x)) && card.filter((x) => /4th Saturday/.test(x)).length === 1,
    "it still carries the trout limit and the lake's own rules, the season once", card.join(" | "));
  ok(yr[0] === "Open all year." && yr.filter((x) => /^Open all year/.test(x)).length === 1 && yr.some((x) => /crappie/.test(x)),
    "a year-round lake's card still starts Open all year, once", yr.join(" | "));
  T.addWaters(ctx.RIG.watersSnapshot);
}

// --- a spot's own hours are not the sun's fault ---------------------------
{
  // Drive 1 keeps it first in the "waiting" names whatever the lakes of the day are.
  T.spots.push({ id: "test-park", name: "Test Park Pond", lat: 47.2, lon: -122.2, drive: 1 });
  T.plans.push({ id: "trout-test-park", species: "perch", spot: "test-park", name: "Trout at Test Park Pond", ok: [6, 12], closes: 17,
    how: "shore", rules: "confirmed", site: { name: "Test Park Pond" } });
  const june = "2026-06-08", wxJ = week(june); // Monday, light until 9 PM
  for (const sp of Object.keys(wxJ)) for (const d of Object.keys(wxJ[sp].sun)) wxJ[sp].sun[d] = { rise: 5.2, set: 21 };
  const mon = T.plan({ today: june, wx: wxJ, tides: tidesFor(june) }).days[0];
  const line = [mon.dark, mon.note].filter(Boolean).join(" ~ ");
  ok(/Test Park Pond closes at 5:00 PM/.test(mon.dark || ""), "a park that shuts at 5 PM says so on a summer weeknight", line);
  ok(!/No daylight|sunset/i.test(line), "and the sun is not blamed with hours of light left", line);
  ok(/Waiting for the weekend/.test(mon.dark || "") && (mon.trips.length || /closes at 5:00 PM/.test(mon.note || "")), "it still says the trip waits for the weekend, on the day itself", line);
  const asked = T.detail({ planId: "trout-test-park", iso: june, from: 16.5, to: 20.5, wx: wxJ });
  ok(asked.status === "nogo" && asked.why === "the spot closes at 5:00 PM", "a crew trip asked for after work there gets the same reason", JSON.stringify(asked));
  // December: the sun is down before the park shuts, so darkness is the reason.
  const dec = "2026-12-07", d = T.plan({ today: dec, wx: week(dec), tides: tidesFor(dec) }).days[0];
  const lineD = [d.dark, d.note].filter(Boolean).join(" ~ ");
  ok(/No daylight after work, sunset 4:24 PM\. Waiting for the weekend: Test Park Pond/.test(lineD) && !/closes at/.test(lineD),
    "in December the same park is dark by then: the sunset wording stays when darkness is the cause", lineD);
  // Tokul Creek shuts at 5 PM. Asked for on a long evening, that is the reason given, not its opening hour.
  const tok = T.plans.find((x) => x.id === "steelhead-tokul"), save = { peak: tok.peak, ok: tok.ok, closed: tok.closed };
  tok.peak = [6]; tok.ok = []; tok.closed = [];
  const flowJ = { tokul: { days: { [june]: { min: 900, max: 1000 } } } };
  const eve = T.detail({ planId: "steelhead-tokul", iso: june, from: 16.5, to: 20.5, wx: wxJ, flow: flowJ });
  ok(eve.status === "nogo" && eve.why === "the spot closes at 5:00 PM", "Tokul after work on a long evening: closes at 5:00 PM", JSON.stringify(eve));
  Object.assign(tok, save);
  T.plans.splice(T.plans.findIndex((x) => x.id === "trout-test-park"), 1);
  T.spots.splice(T.spots.findIndex((x) => x.id === "test-park"), 1);
}

// --- an incoming-tide fish on a river keeps the river's go or no-go -------
{
  T.spots.push({ id: "test-mouth", name: "Test River mouth", lat: 47.3, lon: -122.4, drive: 30, tide: "9446705",
    river: { gauge: "TESTW1", usgs: "1", name: "Test River at the mouth", good: 1000, high: 2000, flood: 5000 } });
  T.plans.push({ id: "cutthroat-test-mouth", species: "cutthroat", spot: "test-mouth", name: "Sea-run cutthroat at the Test River mouth",
    peak: [11], how: "shore", tide: "flood", rules: "confirmed" });
  const today = "2026-11-23", iso = "2026-11-28", wx = week(today), tides = tidesFor(today), id = "cutthroat-test-mouth";
  const flowAt = (v) => ({ "test-mouth": { days: { "2026-11-27": { min: 500, max: 500 }, "2026-11-28": { min: v, max: v } } } });
  const good = T.detail({ planId: id, iso, wx, tides, flow: flowAt(600) });
  ok(good.status === "ok" && good.trip.why.some((w) => /Incoming tide/.test(w)) && good.trip.why.some((w) => /Good flow, 600 cfs/.test(w)),
    "an incoming-tide trip at a river mouth reads the river too", JSON.stringify(good).slice(0, 300));
  ok(good.trip && good.trip.flow && good.trip.flow.call === "go" && good.trip.flow.cfs === 600, "and carries the river card", JSON.stringify(good.trip && good.trip.flow));
  const blown = T.detail({ planId: id, iso, wx, tides, flow: flowAt(4200) });
  ok(blown.status === "nogo" && blown.why === "river blown out, 4,200 cfs", "a blown-out river calls that trip off", JSON.stringify(blown).slice(0, 200));
  const wk = T.plan({ today, wx, tides, flow: flowAt(4200) });
  ok(!tripsOn(wk, iso).some((t) => t.planId === id || (t.alts || []).includes(id)), "and the week does not send anyone to it", ids(wk, iso).join(","));
  T.plans.splice(T.plans.findIndex((x) => x.id === id), 1);
  T.spots.splice(T.spots.findIndex((x) => x.id === "test-mouth"), 1);
}

// --- F8: a lake that is new in today's feed gets weather on that same load --
{
  const snap = ctx.RIG.watersSnapshot, okRule = { status: "ok", open: "all", lines: ["Open all year."] };
  const hourly = (temp) => ({ hourly: { time: ["2026-11-23T17:00"], temperature_2m: [temp], precipitation: [0], wind_speed_10m: [5], wind_gusts_10m: [9], cloud_cover: [50] },
    daily: { time: ["2026-11-23"], sunrise: ["2026-11-23T07:31"], sunset: ["2026-11-23T16:24"] } });

  // The answer is matched to the spots that were asked for, not to whatever the list is by then.
  const u = T.urls("2026-11-23", "2026-11-30");
  ok(Array.isArray(u.wxSpots) && u.wxSpots.length === T.spots.length && u.wxSpots.join() === T.spots.map((s) => s.id).join(), "the weather call remembers which spots it asked for, in order");
  const answer = u.wxSpots.map((spotId, i) => hourly(i));
  T.addWaters({ waters: [{ geo: "LFIRST", name: "First Lake", county: "Pierce", lat: 47.1, lon: -122.1, km: 3, plants: [{ d: "2026-11-20", sp: "Rainbow", n: 500, fpp: 2 }], rule: okRule }].concat(snap.waters) });
  const shaped = T.shape(answer, null, [], {}, u.wxSpots);
  const wrong = u.wxSpots.filter((spotId, i) => !shaped.wx[spotId] || shaped.wx[spotId].hours[0].temp !== i);
  ok(wrong.length === 0, "each spot keeps its own weather when the lake list changes while the call is out", wrong.slice(0, 5).join(","));
  ok(!shaped.wx["w-lfirst"], "a lake that was not asked for gets nobody else's weather");
  T.addWaters(snap);

  // No weather for a lake is never "no daylight".
  const may = "2027-05-17", lost = { geo: "LNOWX", name: "No Forecast Lake", county: "Pierce", lat: 47.15, lon: -122.15, km: 2, // Monday
    plants: [{ d: "2027-05-14", sp: "Rainbow", n: 700, fpp: 2 }], rule: okRule };
  T.addWaters({ waters: [lost] });
  const wxMay = week(may);
  for (const sp of Object.keys(wxMay)) for (const d of Object.keys(wxMay[sp].sun)) wxMay[sp].sun[d] = { rise: 5.5, set: 20.67 };
  delete wxMay["w-lnowx"];
  const rMay = T.plan({ today: may, wx: wxMay, tides: tidesFor(may) });
  const blamed = rMay.days.map((d) => [d.dark, d.note].filter(Boolean).join(" ")).filter((x) => /No daylight|No Forecast Lake|4:30 PM/.test(x));
  ok(blamed.length === 0, "a lake with no forecast is left off: it is not called dark at 4:30 PM in May", blamed.join(" ~ "));
  ok(!rMay.days.some((d) => d.trips.some((t) => t.planId === "trout-w-lnowx" || (t.alts || []).includes("trout-w-lnowx"))), "and it is not listed on a guess");

  // load(), with every server stubbed. The dates follow the real clock, as load() does.
  const store = {}, calls = [];
  ctx.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  ctx.setTimeout = setTimeout; ctx.clearTimeout = clearTimeout;
  const now = new Date(), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const point = () => {
    const time = [], temperature_2m = [], precipitation = [], wind_speed_10m = [], wind_gusts_10m = [], cloud_cover = [], days = [], sunrise = [], sunset = [];
    for (let i = 0; i < 7; i++) {
      const iso = isoAdd(today, i);
      days.push(iso); sunrise.push(iso + "T07:30"); sunset.push(iso + "T16:24");
      for (let h = 0; h < 24; h++) { time.push(`${iso}T${pad(h)}:00`); temperature_2m.push(45); precipitation.push(0); wind_speed_10m.push(4); wind_gusts_10m.push(8); cloud_cover.push(60); }
    }
    return { hourly: { time, temperature_2m, precipitation, wind_speed_10m, wind_gusts_10m, cloud_cover }, daily: { time: days, sunrise, sunset } };
  };
  let feed = null, smallCallFails = false;
  const isWx = (url) => /api\.open-meteo\.com\/v1\/forecast/.test(url), lats = (url) => new URL(url).searchParams.get("latitude").split(",");
  ctx.fetch = (url) => {
    calls.push(url);
    const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    if (isWx(url)) {
      const n = lats(url).length;
      if (n === 1 && smallCallFails) return Promise.reject(new Error("weak signal"));
      return json(n === 1 ? point() : Array.from({ length: n }, point)); // one place comes back as one object, not a list
    }
    if (/marine-api/.test(url)) return json(lats(url).map(() => ({ hourly: { time: [today + "T12:00"], wave_height: [3] } })));
    if (/tidesandcurrents/.test(url)) return json({ predictions: [] });
    if (/castai-waters/.test(url)) return feed ? json(feed) : Promise.reject(new Error("feed down"));
    return Promise.reject(new Error("not stubbed")); // the river gauges
  };
  const lakeOld = { geo: "LOLD", name: "Old Lake", wdfw: "OLD LK (PIER)", county: "Pierce", lat: 47.111, lon: -122.111, km: 6, plants: [{ d: isoAdd(today, -3), sp: "Rainbow", n: 500, fpp: 2 }] };
  const lakeNew = { geo: "LNEW", name: "New Lake", wdfw: "NEW LK (PIER)", county: "Pierce", lat: 47.777, lon: -122.777, km: 7, plants: [{ d: isoAdd(today, -1), sp: "Rainbow", n: 800, fpp: 2 }] };
  // Boot: the snapshot knows both lakes and their rules.
  T.addWaters({ waters: [{ ...lakeOld, rule: okRule }, { ...lakeNew, rule: okRule }] });
  // Then the page draws yesterday's saved forecast, whose lake list is yesterday's: no New Lake.
  T.addWaters({ waters: [lakeOld] });
  ok(!T.spots.some((s) => s.id === "w-lnew"), "yesterday's saved list does not have the new lake");
  feed = { at: now.toISOString(), waters: [lakeOld, lakeNew] };
  const data = await T.load(true);
  ok(data.wx["w-lnew"] && data.wx["w-lnew"].hours.length === 7 * 24 && data.wx["w-lnew"].sun[today].set > 16.3,
    "a lake that is new in today's feed has weather after that same load", Object.keys(data.wx).filter((k) => /^w-/.test(k)).join(","));
  const wxCalls = calls.filter(isWx);
  ok(wxCalls.length === 2 && lats(wxCalls[1]).join() === "47.777" && new URL(wxCalls[1]).searchParams.get("longitude") === "-122.777",
    "it costs one small second call, for the new lake only", wxCalls.map((x) => lats(x).length).join(" then "));
  ok(lats(wxCalls[0]).indexOf("47.777") === -1 && data.wx["w-lold"] && data.wx.redondo, "the first call was built before the feed answered, and every other spot still has its weather");
  const saved = JSON.parse(store["rig.wx.v1"] || "null");
  ok(saved && saved.wx["w-lnew"] && !(saved.missing || []).length, "the saved forecast is whole, so the next three hours are too");
  const wk = T.plan({ today, wx: data.wx, tides: data.tides, flow: data.flow, waters: data.waters });
  ok(wk.days.some((d) => d.trips.some((t) => t.planId === "trout-w-lnew" || (t.alts || []).includes("trout-w-lnew"))), "the new lake is on the week",
    wk.days.map((d) => d.trips.map((t) => t.planId).join("+")).join(" / "));
  ok(!wk.days.some((d) => /sunset 4:30 PM/.test([d.dark, d.note].join(" "))), "no day falls back to a made-up sunset", wk.days.map((d) => d.dark || "").join(" ~ "));

  // Nothing new: one weather call, as before.
  calls.length = 0;
  await T.load(true);
  ok(calls.filter(isWx).length === 1 && lats(calls.filter(isWx)[0]).indexOf("47.777") !== -1, "when nothing is new there is no second call", calls.filter(isWx).length);

  // The feed is down: the load still answers, from the lakes it already has.
  feed = null; calls.length = 0;
  const noFeed = await T.load(true);
  ok(noFeed.waters === null && noFeed.wx["w-lnew"] && calls.filter(isWx).length === 1, "with the feed down the load still answers");

  // The small call fails: the lake waits, it is not blamed on the sun, and the next open tries again soon.
  const lakeLate = { geo: "LLATE", name: "Late Lake", wdfw: "LATE LK (PIER)", county: "Pierce", lat: 47.555, lon: -122.555, km: 8, plants: [{ d: isoAdd(today, -1), sp: "Rainbow", n: 400, fpp: 2 }] };
  T.addWaters({ waters: [{ ...lakeOld, rule: okRule }, { ...lakeNew, rule: okRule }, { ...lakeLate, rule: okRule }] });
  T.addWaters({ waters: [lakeOld, lakeNew] });
  feed = { at: now.toISOString(), waters: [lakeOld, lakeNew, lakeLate] }; smallCallFails = true; calls.length = 0;
  const part = await T.load(true);
  ok(!part.wx["w-llate"] && part.wx["w-lnew"] && (part.missing || []).join() === "w-llate", "when the small call fails the rest of the forecast still lands, and it says what is missing", JSON.stringify(part.missing));
  const wkPart = T.plan({ today, wx: part.wx, tides: part.tides, flow: part.flow, waters: part.waters });
  ok(!wkPart.days.some((d) => /Late Lake|4:30 PM/.test([d.dark, d.note].join(" "))), "a lake still waiting for its forecast is not called dark");
  calls.length = 0;
  await T.load();
  ok(calls.length === 0, "a forecast saved a moment ago is used as it is, even with a lake missing");
  store["rig.wx.v1"] = JSON.stringify({ ...JSON.parse(store["rig.wx.v1"]), at: Date.now() - 11 * 60e3 });
  smallCallFails = false; calls.length = 0;
  const healed = await T.load();
  ok(calls.filter(isWx).length >= 1 && healed.wx["w-llate"] && !(healed.missing || []).length, "ten minutes on, a forecast with a lake missing is fetched again and comes back whole");
  store["rig.wx.v1"] = JSON.stringify({ ...JSON.parse(store["rig.wx.v1"]), at: Date.now() - 11 * 60e3 });
  calls.length = 0;
  await T.load();
  ok(calls.length === 0, "a whole forecast is still good for three hours");

  delete ctx.fetch; delete ctx.localStorage;
  T.addWaters(snap);
}

// --- the call: the one best trip in the week, said the way a guide would ----
{
  const today = "2026-11-23"; // Monday
  const wx = week(today), tides = tidesFor(today);
  const r = T.plan({ today, wx, tides });
  const c = T.theCall(r);
  const all = r.days.flatMap((d, i) => d.trips.map((t) => ({ t, d, i })));
  const top = all.slice().sort((a, b) => b.t.score - a.t.score || a.i - b.i || a.t.drive - b.t.drive)[0];
  ok(c && !c.none && c.trip === top.t && c.day === top.d, "the call: the highest score in the week, the sooner day on a tie, then the shorter drive",
    c && c.trip && c.trip.planId + " " + c.day.iso + " vs " + top.t.planId + " " + top.d.iso);
  ok(/^(This morning|This afternoon|Tonight|Tomorrow (morning|afternoon|evening)|(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day (morning|afternoon|evening))\. /.test(c.headline) &&
    c.headline.endsWith(" " + c.trip.name + "."), "the call: the headline is when, then the trip by name", c.headline);
  ok(typeof c.why === "string" && /^[A-Z].*\.$/.test(c.why) && !/Also good/.test(c.why) && c.why.length < 90, "the call: one short line of why", c.why);
  ok(c.leave === "Leave by " + T.clock(c.trip.from - c.trip.drive / 60 - 0.25) + ".", "the call: when to leave is the run card's own leave time", c.leave);
  ok(r.days.reduce((n, d) => n + d.trips.length, 0) === all.length && r.days.some((d) => d.trips.includes(c.trip)), "the call: the week it was picked from is left whole");

  // The words, on a week built by hand.
  const squid = (o = {}) => ({ planId: "squid-les-davis", name: "Squid at Les Davis Pier", species: "squid", spot: "les-davis", score: 10, drive: 45,
    from: 16.97, to: 22, sun: { rise: 7.5, set: 16.37 }, dark: 16.97,
    why: ["Peak season", "High slack 5:15 PM, right at dark", "Bright moon works against you", "Light wind, 4 mph", "Dry", "Also good: Redondo, Des Moines Pier"], ...o });
  const days = (trips) => [["2026-11-23", "Today Nov 23"], ["2026-11-24", "Tomorrow Nov 24"], ["2026-11-25", "Wed Nov 25"], ["2026-11-26", "Thu Nov 26"],
    ["2026-11-27", "Fri Nov 27"], ["2026-11-28", "Sat Nov 28"], ["2026-11-29", "Sun Nov 29"]].map(([iso, label]) => ({ iso, label, trips: trips[iso] || [] }));
  const thu = T.theCall({ days: days({ "2026-11-26": [squid()] }), notListed: [] });
  ok(thu.headline === "Thursday evening. Squid at Les Davis Pier.", "the call: Thursday evening. Squid at Les Davis Pier.", thu.headline);
  ok(thu.why === "High slack right at dark, light wind.", "the call: the why is the reasons to go, without the clock times and the numbers", thu.why);
  ok(thu.leave === "Leave by 3:58 PM.", "the call: Leave by 3:58 PM.", thu.leave);
  ok(thu.trip.planId === "squid-les-davis" && thu.day.iso === "2026-11-26", "the call: it hands back the trip and the day for the button");

  const lake = (o = {}) => ({ planId: "trout-fenwick", name: "Perch and trout, Lake Fenwick", species: "perch", spot: "lake-fenwick", score: 10, drive: 30,
    from: 7.5, to: 11, sun: { rise: 7.5, set: 16.37 }, dark: 16.97, why: ["Stocked Nov 20: 400 rainbow, catchable size", "Light wind, 3 mph", "Dry"], ...o });
  const tie = T.theCall({ days: days({ "2026-11-26": [squid()], "2026-11-28": [lake()] }), notListed: [] });
  ok(tie.day.iso === "2026-11-26", "the call: the same score on two days goes to the sooner day", tie.day.iso);
  const near = T.theCall({ days: days({ "2026-11-28": [squid(), lake()] }), notListed: [] });
  ok(near.trip.planId === "trout-fenwick" && near.headline === "Saturday morning. Perch and trout, Lake Fenwick." && near.why === "Stocked Nov 20, light wind.",
    "the call: the same score on one day goes to the shorter drive", near.headline + " " + near.why);
  const better = T.theCall({ days: days({ "2026-11-24": [squid({ score: 8 })], "2026-11-28": [lake({ score: 9 })] }), notListed: [] });
  ok(better.day.iso === "2026-11-28", "the call: a better trip later beats a lesser one sooner");
  ok(T.theCall({ days: days({ "2026-11-23": [squid()] }), notListed: [] }).headline === "Tonight. Squid at Les Davis Pier.", "the call: today after sunset is Tonight");
  ok(T.theCall({ days: days({ "2026-11-23": [lake({ from: 13, to: 16 })] }), notListed: [] }).headline === "This afternoon. Perch and trout, Lake Fenwick.", "the call: today after noon is This afternoon");
  ok(T.theCall({ days: days({ "2026-11-24": [lake()] }), notListed: [] }).headline === "Tomorrow morning. Perch and trout, Lake Fenwick.", "the call: tomorrow is Tomorrow morning");
  // A trip today that is already over is not the call.
  const over = T.theCall({ days: days({ "2026-11-23": [lake()], "2026-11-26": [squid({ score: 7 })] }), notListed: [] }, { nowHour: 12 });
  ok(over.day.iso === "2026-11-26", "the call: this morning's trip is not the call at noon", over.headline);
  const still = T.theCall({ days: days({ "2026-11-23": [lake()], "2026-11-26": [squid({ score: 7 })] }), notListed: [] }, { nowHour: 9 });
  ok(still.day.iso === "2026-11-23", "the call: a trip still going is");

  // Nothing worth it: say so and why, from the days' own notes. Never a made-up trip.
  const blown = T.plan({ today, wx: week(today, () => ({ wind: 28, gust: 42 })), tides });
  const none = T.theCall(blown);
  ok(none.none === true && !none.trip, "the call: a week with nothing good has no trip", JSON.stringify(none).slice(0, 200));
  ok(none.why === "Gusts to 42 mph today, and weather every day after.", "the call: and it says why, from the days' own notes", none.why);
  const wet = days({});
  wet[0].note = "No fishing: gusts to 42 mph"; wet[1].note = "Nothing good. Squid at Redondo is off: heavy rain"; wet[4].note = "No fishing: 12 ft surf";
  const twoBad = T.theCall({ days: wet, notListed: [] });
  ok(twoBad.none && twoBad.why === "Gusts to 42 mph today, weather on 2 more days.", "the call: weather on some days counts them", twoBad.why);
  const noted = days({});
  noted[2].note = "No fishing: heavy rain. No daylight after work, sunset 4:24 PM. Waiting for the weekend: Lake Fenwick.";
  noted[2].dark = "No daylight after work, sunset 4:24 PM. Waiting for the weekend: Lake Fenwick.";
  ok(T.theCall({ days: noted, notListed: [] }).why === "Heavy rain on Wednesday, and no daylight after work on the weeknights.", "the call: weather on one day and dark weeknights, in one line", T.theCall({ days: noted, notListed: [] }).why);
  const dim = days({});
  dim[1].note = dim[1].dark = "No daylight after work, sunset 4:24 PM. Waiting for the weekend: Lake Fenwick.";
  ok(T.theCall({ days: dim, notListed: [] }).why === "No daylight after work, sunset 4:24 PM.", "the call: only dark weeknights says that", T.theCall({ days: dim, notListed: [] }).why);
  const slow = T.theCall({ days: days({}), notListed: [] });
  ok(slow.none && typeof slow.why === "string" && slow.why.length > 10 && typeof slow.headline === "string", "the call: a week with no notes still says something plain", JSON.stringify(slow));
  ok(T.theCall({ days: [], notListed: [] }).none && T.theCall(null).none, "the call: no forecast is no call, not a crash");

  // The reasons, short. A slow day leads with what is against it.
  ok(T.whyLine(squid(), 3) === "High slack right at dark, light wind, dry.", "why line: the reasons to go first, three of them", T.whyLine(squid(), 3));
  ok(T.whyLine(squid({ heat: "Slow", why: ["In season", "Bright moon works against you", "Wind to 15 mph"] }), 2) === "Wind to 15 mph, bright moon works against you.",
    "why line: a slow day says what is against it", T.whyLine(squid({ heat: "Slow", why: ["In season", "Bright moon works against you", "Wind to 15 mph"] }), 2));
  ok(T.whyLine(squid({ why: ["Peak season", "WDFW dig at Copalis, low 7:35 PM, -1.8 ft", "Light wind, 4 mph"] }), 2) === "WDFW dig at Copalis, light wind.", "why line: a dig keeps its beach and drops the numbers");
  ok(T.leaveBy(squid()) === "3:58 PM" && T.leaveBy({ from: 0.5, drive: 60 }) === "11:15 PM", "leave by: the start, less the drive, less 15 minutes to set up", T.leaveBy({ from: 0.5, drive: 60 }));
}

// --- the plans a crew can pick for a day -----------------------------------
{
  const nov = T.plansOn("2026-11-28"), ids = nov.map((p) => p.id);
  ok(ids.includes("squid-redondo") && ids.includes("chum-green-river") && ids.includes("cutthroat-dash-point"), "plans for a day: what is in season is there", ids.slice(0, 8).join(","));
  ok(!ids.includes("coho-dash-point") && !ids.includes("bass-fenwick"), "plans for a day: closed and out of season are not");
  ok(!ids.includes("pink-green-river") && !ids.includes("steelhead-green-river") && !ids.includes("trout-tapps"), "plans for a day: rules not confirmed, or no way in, are not");
  ok(nov.every((p) => p.id && p.name && p.species && p.spot && T.plans.find((x) => x.id === p.id).rules === "confirmed"), "plans for a day: each has its id, name, fish and spot");
  ok(nov.some((p) => /^trout-w-/.test(p.id)), "plans for a day: a lake stocked this month is there");
  ok(T.plansOn("2026-08-15").map((p) => p.id).includes("coho-dash-point") && !T.plansOn("2026-08-15").map((p) => p.id).includes("squid-redondo"), "plans for a day: August has coho and no squid");
  ok(T.plansOn("").length === 0 && T.plansOn("soon").length === 0 && T.plansOn().length === 0, "plans for a day: no date, no plans");
  ok(nov.every((p) => T.detail({ planId: p.id, iso: "2026-11-28", wx: {}, tides: {} }).status === "nodata"), "plans for a day: every one is a plan detail() knows and calls open");
}

// --- the gauge reader: NWPS lists stage and flow in either order -------------
{
  // Real NOAA answers, trimmed (tests/fixtures/nwps-stageflow.json): PUYW1
  // gives stage first (ft) and flow second (kcfs); AUBW1 gives flow first.
  const nw = JSON.parse(readFileSync(resolve(ROOT, "tests/fixtures/nwps-stageflow.json"), "utf8"));
  ok(nw.PUYW1.observed.primaryName === "Stage" && nw.PUYW1.observed.secondaryName === "Flow" && nw.AUBW1.observed.primaryName === "River Discharge",
    "the fixtures are the two shapes: PUYW1 stage first, AUBW1 flow first");
  const puy = T.shapeFlow(nw.PUYW1), aub = T.shapeFlow(nw.AUBW1);
  ok(puy.now && puy.now.cfs === 2330, "PUYW1, stage first: now is the flow (2,330 cfs), not the 11.73 ft stage read as 11,730", JSON.stringify(puy.now));
  ok(puy.days["2026-11-27"] && puy.days["2026-11-27"].max === 3390 && puy.days["2026-11-26"].min === 1850, "PUYW1: the forecast days carry the flow in cfs", JSON.stringify(puy.days));
  ok(Object.values(puy.days).every((d) => d.max < 5000 && d.min > 500), "PUYW1: no stage value is read as a flow", JSON.stringify(puy.days));
  ok(aub.now && aub.now.cfs === 514 && aub.days["2026-10-28"].max === 450, "AUBW1, flow first: read as River Discharge in cfs", JSON.stringify(aub));
  // The Green, Tokul and the Cowlitz read exactly as before: their answers
  // with the names taken off (the shape the old reader assumed) give the same days.
  const bare = (j) => ({ observed: { data: j.observed.data.map((x) => ({ validTime: x.validTime, primary: x.primary })) },
    forecast: { data: j.forecast.data.map((x) => ({ validTime: x.validTime, primary: x.primary })) } });
  ok(JSON.stringify(T.shapeFlow(bare(nw.AUBW1))) === JSON.stringify(aub), "AUBW1 reads the same with or without its series names");
  for (const g of ["SQUW1", "MAYW1"]) {
    const j = JSON.parse(JSON.stringify(nw.AUBW1));
    ok(JSON.stringify(T.shapeFlow(j)) === JSON.stringify(T.shapeFlow(bare(j))), g + " (River Discharge first, like AUBW1) reads as it always did");
  }
  ok(T.spots.filter((s) => s.river && s.river.gauge !== "PUYW1").map((s) => s.river.gauge).join() === "AUBW1,SQUW1,MAYW1", "the other river gauges are the Green, Tokul and the Cowlitz");
  // What a reading is: units first, then the name; a stage-only gauge has none.
  ok(T.flowField(nw.PUYW1.observed).k === "secondary" && T.flowField(nw.PUYW1.observed).x === 1000 && T.flowField(nw.AUBW1.forecast).k === "primary",
    "the flow series is picked by name and units", JSON.stringify(T.flowField(nw.PUYW1.observed)));
  ok(T.flowField({ primaryName: "Stage", primaryUnits: "ft", secondaryName: "Flow", secondaryUnits: "cfs" }).x === 1, "a flow given in cfs is not multiplied");
  const stageOnly = { observed: { primaryName: "Stage", primaryUnits: "ft", secondaryName: "Flow", secondaryUnits: "kcfs",
    data: [{ validTime: "2026-11-27T07:00:00Z", primary: 4.2, secondary: -999 }] } };
  ok(Object.keys(T.shapeFlow(stageOnly).days).length === 0 && T.shapeFlow(stageOnly).now === null, "a gauge with no flow (WSTW1 sends -999) gives no reading, not its stage");
  ok(T.flowField({ primaryName: "Stage", primaryUnits: "ft", secondaryName: "Stage", secondaryUnits: "ft" }) === null, "a gauge that only reports stage has no flow field");
}

// --- the Puyallup: spots, plans, closed days, the go call -------------------
{
  const P = (id) => T.plans.find((p) => p.id === id);
  const spot = (id) => T.spots.find((s) => s.id === id);
  const PUY = /^(king|coho|pink)-puyallup-/;
  ok(["puyallup-sumner", "puyallup-128th", "puyallup-orting"].every((id) => spot(id) && ctx.RIG.content.spots.some((s) => s.id === id)), "three Puyallup spots, the same ids as their paintings and the library");
  ok(spot("puyallup-sumner").lat === 47.1996 && spot("puyallup-sumner").lon === -122.2565 && spot("puyallup-128th").lat === 47.1402 && spot("puyallup-orting").lon === -122.211,
    "the stands are the cards' coordinates");
  ok(spot("puyallup-sumner").river.gauge === "PUYW1" && spot("puyallup-128th").river.gauge === "PUYW1" && spot("puyallup-sumner").river.usgs === "12101500" && !spot("puyallup-orting").river,
    "Sumner and the 128th read PUYW1; Orting has no gauge and no trip");
  ok(spot("puyallup-sumner").river.good === 1800 && spot("puyallup-sumner").river.high === 3500 && T.puyallupFlow.good === 1800 && T.puyallupFlow.high === 3500,
    "the Puyallup goes up to 1,800 cfs and is a no-go above 3,500, from one place in the code");
  ok(T.plans.filter((p) => /puyallup/.test(p.spot)).every((p) => p.spot !== "puyallup-orting"), "no plan at Orting: salmon is closed above the Carbon");
  ok(T.plans.filter((p) => PUY.test(p.id)).length === 6 && T.plans.filter((p) => PUY.test(p.id)).every((p) => p.how === "shore" && !p.dark && T.runs[p.id]),
    "kings, coho and pinks at Sumner and at the 128th, daylight bank trips, each with a run card");
  const u = T.urls("2026-09-02", "2026-09-09");
  ok(u.flow.filter((f) => /PUYW1/.test(f.url)).length === 1 && u.flow.find((f) => /PUYW1/.test(f.url)).spots.join() === "puyallup-sumner,puyallup-128th",
    "one PUYW1 call serves both Puyallup spots");

  // A week for September, sun as it is then.
  const sept = (today, sun) => { const w = week(today); for (const k of Object.keys(w)) for (const d of Object.keys(w[k].sun)) w[k].sun[d] = sun; return w; };
  const flowWeek = (today, cfs) => { const days = {}; for (let i = -1; i < 7; i++) { const iso = isoAdd(today, i); const v = typeof cfs === "function" ? cfs(iso) : cfs; days[iso] = { min: v, max: v }; }
    const f = { days, now: { cfs: typeof cfs === "function" ? cfs(today) : cfs, at: today + "T19:00:00Z" } };
    return { "puyallup-sumner": f, "puyallup-128th": f }; };
  // A Puyallup trip on a day: listed, or the backup the listed one names.
  const puyOn = (r, iso) => tripsOn(r, iso).filter((t) => PUY.test(t.planId) || (t.alts || []).some((a) => PUY.test(a)));
  const SEP_SUN = { rise: 6.6, set: 19.6 }, OCT_SUN = { rise: 7.3, set: 18.6 };

  // Kings: Mon Aug 31 to Sun Sep 6, 2026.
  const k0 = "2026-08-31";
  const kw = T.plan({ today: k0, wx: sept(k0, SEP_SUN), tides: tidesFor(k0), flow: flowWeek(k0, 1300) });
  const kDays = kw.days.map((d) => [d.iso, puyOn(kw, d.iso).length]);
  ok(kDays.map((x) => x[1] > 0).join() === "false,false,true,true,true,true,false", "kings week: Puyallup trips Wed to Sat only, none Sun, Mon or Tue before Oct 1", JSON.stringify(kDays));
  const kt = tripsOn(kw, "2026-09-05").find((t) => PUY.test(t.planId));
  ok(kt && kt.species === "king" && kt.heat === "Hot" && kt.why.some((w) => /Good flow, 1,300 cfs/.test(w)), "a Saturday king trip in the peak is Hot, with the go call", kt && kt.why.join(" | "));
  ok(kt && (kt.alts || []).some((a) => PUY.test(a)) && kt.why.some((w) => /^Also good: (Sumner|128th St E)$/.test(w)), "the other Puyallup spot is named as the backup", kt && kt.why.join(" | "));
  ok(kw.days.every((d) => puyOn(kw, d.iso).every((t) => t.from >= SEP_SUN.rise && t.to <= SEP_SUN.set)), "night closure: every Puyallup trip is between sunrise and sunset");
  ok(!kw.days.some((d) => d.trips.some((t) => t.spot === "puyallup-orting")), "nothing at Orting");
  ok(!kw.notListed.some((n) => /Puyallup/.test(n.name)), "2026 is the year the rules were read: nothing held back", JSON.stringify(kw.notListed));

  // The go call: up to 1,800 is good, over 3,500 is a no-go.
  const flowOn = (v) => flowWeek(k0, (iso) => (iso === "2026-09-03" ? v : 1300));
  const at = (v) => T.detail({ planId: "king-puyallup-sumner", iso: "2026-09-03", wx: sept(k0, SEP_SUN), tides: tidesFor(k0), flow: flowOn(v) });
  ok(at(1800).status === "ok" && at(1800).trip.flow.call === "go" && at(1800).trip.why.some((w) => /Good flow, 1,800 cfs/.test(w)), "1,800 cfs is still good", JSON.stringify(at(1800).trip && at(1800).trip.flow));
  ok(at(2600).status === "ok" && at(2600).trip.flow.call === "high" && at(2600).trip.why.some((w) => /High water, 2,600 cfs/.test(w)), "2,600 cfs is high and tough", JSON.stringify(at(2600).trip && at(2600).trip.why));
  ok(at(3500).status === "ok" && at(3500).trip.flow.call === "high", "3,500 cfs is high, not yet a no-go");
  ok(at(3600).status === "nogo" && at(3600).why === "river blown out, 3,600 cfs", "3,600 cfs is a no-go", JSON.stringify(at(3600)));
  const blown = T.plan({ today: k0, wx: sept(k0, SEP_SUN), tides: tidesFor(k0), flow: flowOn(3600) });
  ok(puyOn(blown, "2026-09-03").length === 0 && puyOn(blown, "2026-09-02").length > 0 && puyOn(blown, "2026-09-04").length > 0,
    "a no-go day above 3,500 cfs lists no Puyallup trip, and the days either side still do", JSON.stringify(blown.days.map((d) => [d.iso, d.trips.map((t) => t.planId)])));
  ok(at(1300).trip.flow.lead === true && at(1300).trip.flow.gauge === "Puyallup River at Puyallup", "the river card knows these are the app's own starting numbers");

  // The real gauge answer goes in stage first: read right, it is a good day; read as the
  // old reader did (stage 9.9 ft as 9,900 cfs) it would be a no-go.
  const stageFirst = { observed: { primaryName: "Stage", primaryUnits: "ft", secondaryName: "Flow", secondaryUnits: "kcfs", data: [{ validTime: "2026-08-31T19:00:00Z", primary: 9.9, secondary: 1.2 }] },
    forecast: { primaryName: "Stage", primaryUnits: "ft", secondaryName: "Flow", secondaryUnits: "kcfs",
      data: kw.days.map((d) => ({ validTime: d.iso + "T20:00:00Z", primary: 9.9, secondary: 1.2 })) } };
  const read = T.shapeFlow(stageFirst);
  const sf = T.plan({ today: k0, wx: sept(k0, SEP_SUN), tides: tidesFor(k0), flow: { "puyallup-sumner": read, "puyallup-128th": read } });
  const st = tripsOn(sf, "2026-09-05").find((t) => PUY.test(t.planId));
  ok(st && st.flow.cfs === 1200 && st.flow.call === "go", "a stage-first PUYW1 answer is read as 1,200 cfs and the day is a go", st && JSON.stringify(st.flow));

  // Coho: Mon Sep 14 to Sun Sep 20. Kings are done by mid September.
  const c0 = "2026-09-14";
  const cw = T.plan({ today: c0, wx: sept(c0, SEP_SUN), tides: tidesFor(c0), flow: flowWeek(c0, 900) });
  const cDays = cw.days.map((d) => [d.iso, puyOn(cw, d.iso).map((t) => t.planId).join("+")]);
  ok(cw.days.map((d) => puyOn(cw, d.iso).length > 0).join() === "false,false,true,true,true,true,false", "coho week: Wed to Sat only, before Oct 1", JSON.stringify(cDays));
  ok(cw.days.every((d) => puyOn(cw, d.iso).every((t) => t.species === "coho")), "from Sep 16 the Puyallup trip is coho, not kings", JSON.stringify(cDays));
  const after = tripsOn(cw, "2026-09-16").find((t) => PUY.test(t.planId));
  ok(after && after.slot === "After work" && after.drive <= 45, "a Wednesday in September is an after work trip", after && after.slot);

  // October: every day, Sundays to Tuesdays included.
  const o0 = "2026-10-05";
  const ow = T.plan({ today: o0, wx: sept(o0, OCT_SUN), tides: tidesFor(o0), flow: flowWeek(o0, 900) });
  ok(ow.days.length === 7 && ow.days.every((d) => puyOn(ow, d.iso).length > 0), "October: a Puyallup trip every day of the week", JSON.stringify(ow.days.map((d) => [d.iso, puyOn(ow, d.iso).length])));
  ok(ow.days.every((d) => puyOn(ow, d.iso).every((t) => t.species === "coho" && t.heat === "Hot")), "October coho are the peak", JSON.stringify(ow.days.map((d) => puyOn(ow, d.iso).map((t) => t.heat))));

  // The season ends Oct 31.
  const e0 = "2026-10-26";
  const ew = T.plan({ today: e0, wx: sept(e0, OCT_SUN), tides: tidesFor(e0), flow: flowWeek(e0, 900) });
  ok(puyOn(ew, "2026-10-31").length > 0 && puyOn(ew, "2026-11-01").length === 0, "the last day is Oct 31; none on Nov 1", JSON.stringify(ew.days.map((d) => [d.iso, puyOn(ew, d.iso).length])));
  const n0 = "2026-11-02";
  const nw2 = T.plan({ today: n0, wx: sept(n0, OCT_SUN), tides: tidesFor(n0), flow: flowWeek(n0, 900) });
  ok(nw2.days.every((d) => puyOn(nw2, d.iso).length === 0) && !nw2.notListed.some((n) => /Puyallup/.test(n.name)), "none after Oct 31, and nothing held back either: the river is closed");
  ok(T.detail({ planId: "coho-puyallup-sumner", iso: "2026-11-07", wx: sept(n0, OCT_SUN), tides: tidesFor(n0), flow: flowWeek(n0, 900) }).status === "closed", "a crew trip asked for in November: closed");
  ok(T.detail({ planId: "coho-puyallup-sumner", iso: "2026-09-20", wx: sept(c0, SEP_SUN), tides: tidesFor(c0), flow: flowWeek(c0, 900) }).status === "closed", "a crew trip asked for on a Sunday in September: closed");
  ok(!T.plansOn("2026-09-20").some((p) => PUY.test(p.id)) && T.plansOn("2026-09-19").some((p) => p.id === "coho-puyallup-sumner") && T.plansOn("2026-10-04").some((p) => p.id === "coho-puyallup-128th"),
    "the crew's picker offers the Puyallup on open days only (Sat Sep 19 and Sun Oct 4, not Sun Sep 20)");
  ok(!T.plansOn("2026-09-02").some((p) => p.spot === "puyallup-orting") && !T.plansOn("2026-10-10").some((p) => p.spot === "puyallup-orting"), "and never at Orting");

  // Pinks: odd years only, and 2027's dates are not read yet.
  ok(T.season(P("pink-puyallup-sumner"), { y: 2026, m: 9, d: 2, iso: "2026-09-02" }) === null, "no pinks in 2026, an even year");
  const y27 = { y: 2027, m: 9, d: 1, iso: "2027-09-01" }; // a Wednesday
  ok(T.season(P("pink-puyallup-sumner"), y27) === "ok" && /^2027 dates not read yet\. WDFW sets them in the 2027-28 pamphlet$/.test(T.ruleOn(P("pink-puyallup-sumner"), y27)),
    "2027 pinks wait for the 2027-28 pamphlet", T.ruleOn(P("pink-puyallup-sumner"), y27));
  const w27 = "2027-08-30";
  const r27 = T.plan({ today: w27, wx: sept(w27, SEP_SUN), tides: tidesFor(w27), flow: flowWeek(w27, 900) });
  const held = r27.notListed.filter((n) => /Puyallup/.test(n.name));
  ok(r27.days.every((d) => puyOn(r27, d.iso).length === 0) && held.length === 1 && held[0].name === "Salmon on the Puyallup" && /2027 dates not read yet/.test(held[0].why),
    "2027: no Puyallup trip on a guess, and one line says why", JSON.stringify(held));
  ok(T.detail({ planId: "king-puyallup-128th", iso: "2027-09-01", wx: sept(w27, SEP_SUN), tides: tidesFor(w27), flow: flowWeek(w27, 900) }).status === "closed" && !T.plansOn("2027-09-01").some((p) => PUY.test(p.id)),
    "a 2027 crew trip on the Puyallup is not offered until its dates are read");

  // Run cards: the White warning, parking, the rules as written.
  const sum = T.runs["coho-puyallup-sumner"], b128 = T.runs["king-puyallup-128th"];
  ok(sum.spot.lines.some((l) => /Stand on the point and cast into the Puyallup\. Never cast into the White behind you: it is closed to salmon\./.test(l)), "Sumner: stand on the point, cast into the Puyallup, never the White");
  ok(sum.spot.lines.some((l) => /State Street Trailhead, 13114 63rd St E/.test(l)) && b128.spot.lines.some((l) => /WDFW Weiss access at the end of 116th St E/.test(l)) &&
    b128.spot.lines.some((l) => /Discover Pass, or the Vehicle Access Pass that comes free with an annual fishing license/.test(l)), "parking: the State Street Trailhead for Sumner, WDFW Weiss with its pass for the 128th");
  const rl = b128.rules.join(" ");
  ok(/Aug 19 to Oct 31/.test(rl) && /Closed Sundays, Mondays and Tuesdays until Sept 30/.test(rl) && /6 salmon a day, no more than 2 adults/.test(rl) && /Release chum and wild Chinook/.test(rl) &&
    /Barbless/.test(rl) && /buoyant lure with no weight added to the line or lure/.test(rl) && /Night closure/.test(rl), "the rules: season, closed days, limit, releases, barbless, anti-snag with its buoyant-lure exception, night closure", rl);
  ok(sum.rules[0] === "The White River behind you is closed to salmon. Cast into the Puyallup only." && !b128.rules.some((l) => /White River behind/.test(l)), "the White warning leads Sumner's rules, and only Sumner's");
  ok(T.runs["king-puyallup-sumner"].expect.some((l) => /crowd/.test(l) && /Aug 22/.test(l) && /nobody hooked up/.test(l)) && T.runs["king-puyallup-sumner"].bait.note === "Corkies took the big king here on Aug 28." &&
    T.runs["coho-puyallup-128th"].expect.some((l) => /Oct 17 was low and slow here, 862 cfs/.test(l)), "Coach's own days: Aug 22 crowded, the Aug 28 king on corkies, Oct 17 low and slow");
  ok(Object.keys(T.runs).filter((k) => PUY.test(k)).every((k) => T.runs[k].checked === "2026-11-27"), "the cards were checked against WDFW on 11/27");

  // Reviewers' round (11/27). The closed water is on the face of the card:
  // the spot row and the rules row each name their own line.
  ok(sum.spot.head === "Cast into the Puyallup only, never into the White behind you." && /^The White is closed to salmon\. 6 salmon a day, no more than 2 adults\.$/.test(sum.ruleHead),
    "Sumner's spot row says cast into the Puyallup only, never the White, and its rules row that the White is closed to salmon", [sum.spot.head, sum.ruleHead].join(" | "));
  // The 128th: the Carbon closure about 3/4 mile upstream, in its rules, its spot, its steps and on its face.
  const CARB = /The Carbon River comes in about 3\/4 mile upstream\. Above it the Puyallup is closed to salmon all year\. The Carbon itself opens Sept 1, Wednesday to Saturday only in September\./;
  ok(["king-puyallup-128th", "coho-puyallup-128th", "pink-puyallup-128th"].every((k) => T.runs[k].rules.some((l) => CARB.test(l)) && T.runs[k].spot.lines.some((l) => CARB.test(l)) &&
    T.runs[k].during.some((l) => /Stay below the Carbon River mouth\. Above it is closed to salmon\./.test(l)) && T.runs[k].spot.head === "Stay below the Carbon River mouth, 3/4 mile upstream." && /^Salmon closed above the Carbon\. 6 salmon a day, no more than 2 adults\.$/.test(T.runs[k].ruleHead)),
    "the 128th: closed to salmon above the Carbon, 3/4 mile up, on every card and on its face", b128.rules.join(" | "));
  ok(!Object.keys(T.runs).filter((k) => /-puyallup-sumner$/.test(k)).some((k) => T.runs[k].rules.some((l) => CARB.test(l))), "and the Carbon line is the 128th's, not Sumner's");
  // The 2018 river bed report is said as one report, never as a fact.
  ok(!b128.spot.lines.some((l) => /Anglers fish the river bed/.test(l)) && b128.spot.lines.includes("One 2018 report saw two people fishing the river bed at the bridge."), "the river bed line is one 2018 report", b128.spot.lines.join(" | "));
  // Anti-snagging: the 12 inches is measured from the lure or bait, never the hook, and no unclear "it".
  ok(Object.keys(T.runs).filter((k) => PUY.test(k)).every((k) => T.runs[k].how.includes("Keep the weight 12 inches or more above the corky, jig or bait, never below it. That is the anti-snagging rule.") &&
    !T.runs[k].how.some((l) => /above the hook/.test(l))), "the how: weight 12 inches above the corky, jig or bait, never below it", b128.how.join(" | "));
  ok(/No weight below the lure or bait, and none less than 12 inches above it\./.test(rl) && !/below it, or less than/.test(rl), "the rules say what the weight is measured from", rl);
  // Sumner's walk: only what is proven (the point is west of the trailhead), and the route is not confirmed.
  ok(!sum.spot.lines.some((l) => /wastewater/.test(l)) && sum.spot.lines.some((l) => /The point is a few hundred feet west of the trailhead\./.test(l)) && sum.spot.unknown.includes("The walking route from the trailhead to the point"),
    "Sumner: a few hundred feet west of the trailhead, the route not confirmed", sum.spot.lines.join(" | "));

  // The library's Puyallup cards (rigs/content.js).
  const C = ctx.RIG.content, card = (id) => C.shared.find((c) => c.id === id) || C.spots.flatMap((x) => x.cards || []).find((c) => c.id === id);
  const prc = card("puyallup-rules").body;
  ok(/From 400 ft above Clark's Creek up to the Carbon River: Aug 19 to Oct 31, 2026\./.test(prc) && !/Below the Carbon River: Aug 19/.test(prc), "the rules card names its stretch, not all of the river below the Carbon", prc.slice(0, 300));
  ok(/The Puyallup from 400 ft below to 400 ft above Clark's Creek: closed to all fishing\./.test(prc) && /the Puyallup from the Carbon River mouth upstream, Orting included/.test(prc) && !/at Orting\./.test(prc),
    "its closed water: the White, the Puyallup from the Carbon mouth up, and Clark's Creek", prc);
  ok(/From the 11th St Bridge to 400 ft below Clark's Creek: the same dates and rules\. Below the 11th St Bridge is not in this listing\./.test(prc), "and the stretch below Clark's Creek, as the pamphlet lists it");
  ok(/Aug 19 to Oct 31\. Statewide size and daily limit\. Release cutthroat and wild rainbow trout\./.test(prc), "and the trout rule", prc);
  ok(/No weight below the lure or bait, and none less than 12 inches above it\./.test(prc), "and the weight rule, measured from the lure or bait");
  const c128 = card("puyallup-128th-spot").body;
  ok(CARB.test(c128) && /In 2018 one angler saw two people fishing the river bed at the bridge\./.test(c128) && !/Anglers fish the river bed/.test(c128), "the 128th's library card: the Carbon closure, and the river bed as one report", c128);
  ok(!/wastewater/.test(card("puyallup-sumner-spot").body) && /walking route from the trailhead to the point/.test(card("puyallup-sumner-spot").body), "the Sumner card: no unproven walking route");
  ok(/No bait\. Scented yarn or lures count as bait\./.test(card("orting-rules").body), "Orting's selective gear: scented yarn or lures count as bait");
  ok(C.spots.find((x) => x.id === "puyallup-128th").where === "128th St E bridge, Pierce County", "the 128th's place name is a checked one, not Alderton (the gauge 5 km down)");

  // The call: Sumner and the 128th tie, and Sumner's bank is proven. The
  // listed king trip is Sumner's, the 128th its backup, and the call is Sumner.
  ok(T.spots.find((x) => x.id === "puyallup-128th").bankUnproven === true && !T.spots.find((x) => x.id === "puyallup-sumner").bankUnproven, "the 128th's bank is marked unproven, Sumner's is not");
  const tie = kw.days.flatMap((d) => tripsOn(kw, d.iso).filter((t) => PUY.test(t.planId)));
  ok(tie.length > 0 && tie.every((t) => t.planId === "king-puyallup-sumner" && (t.alts || []).includes("king-puyallup-128th") && t.why.includes("Also good: 128th St E")),
    "on a tie the listed Puyallup trip is Sumner's, the 128th its backup, though the 128th is a minute closer", JSON.stringify(tie.map((t) => [t.planId, t.alts])));
  const only = T.plan({ today: k0, wx: sept(k0, SEP_SUN), tides: tidesFor(k0), flow: flowWeek(k0, 1300) });
  for (const d of only.days) d.trips = d.trips.filter((t) => PUY.test(t.planId));
  const call = T.theCall(only);
  ok(call.trip && call.trip.planId === "king-puyallup-sumner", "the call goes to Sumner, the proven bank", call.headline);
  // The 128th still leads when it is the better trip.
  const bwx = week(k0, (s) => (s === "puyallup-sumner" ? { wind: 12, gust: 16 } : {}));
  for (const k of Object.keys(bwx)) for (const d of Object.keys(bwx[k].sun)) bwx[k].sun[d] = SEP_SUN;
  const breezy = T.plan({ today: k0, wx: bwx, tides: tidesFor(k0), flow: flowWeek(k0, 1300) });
  const bk = breezy.days.flatMap((d) => tripsOn(breezy, d.iso).filter((t) => PUY.test(t.planId)));
  ok(bk.length > 0 && bk.every((t) => t.planId === "king-puyallup-128th"), "and a breeze at Sumner hands the day to the 128th", JSON.stringify(bk.map((t) => [t.planId, t.score])));
  // The tie-break for any other water is unchanged: the shorter drive.
  ok(!T.spots.filter((x) => !/^puyallup-/.test(x.id)).some((x) => x.bankUnproven), "no other spot is marked, so a tie elsewhere still goes to the shorter drive");

  // The closed-weekday rule, for any water: no dates means all season.
  const test = { id: "test-days", species: "perch", spot: "lake-fenwick", ok: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], closedDays: [{ dow: [5] }], rules: "confirmed" };
  ok(T.season(test, { y: 2026, m: 12, d: 4, iso: "2026-12-04" }) === null && T.season(test, { y: 2026, m: 12, d: 5, iso: "2026-12-05" }) === "ok", "a closed weekday with no dates is shut every week (Fridays here)");
  const wsat = { ...test, closedDays: [{ dow: [0, 1, 2], from: "09-01", to: "09-30" }] }; // the Carbon: Wednesdays to Saturdays only in September
  ok(T.season(wsat, { y: 2026, m: 9, d: 27, iso: "2026-09-27" }) === null && T.season(wsat, { y: 2026, m: 9, d: 26, iso: "2026-09-26" }) === "ok" && T.season(wsat, { y: 2026, m: 10, d: 4, iso: "2026-10-04" }) === "ok",
    "and with dates only between them (a Sunday in September shut, a Saturday and an October Sunday open)");
  const wrap = { ...test, closedDays: [{ dow: [3], from: "12-15", to: "01-15" }] };
  ok(T.season(wrap, { y: 2026, m: 12, d: 30, iso: "2026-12-30" }) === null && T.season(wrap, { y: 2027, m: 1, d: 6, iso: "2027-01-06" }) === null && T.season(wrap, { y: 2027, m: 1, d: 20, iso: "2027-01-20" }) === "ok",
    "a closed-weekday window can run over the new year");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
