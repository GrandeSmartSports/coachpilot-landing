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
vm.runInContext(readFileSync(resolve(ROOT, "rigs/trips.js"), "utf8"), ctx);
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
  ok(!r.days.some((d) => d.trips.some((t) => t.spot === "green-river")), "Green River is not listed while its rules are unconfirmed");
  ok(r.notListed.some((n) => /Green/.test(n.name) && /not confirmed/.test(n.why)), "the not-listed note names the Green River and why",
    JSON.stringify(r.notListed));
  ok(!r.days.some((d) => d.trips.some((t) => t.planId === "bass-fenwick")), "no bass in November");
  ok(!tripsOn(r, "2026-11-24").some((t) => t.spot === "westport" || t.spot === "ocean-shores"), "no 2 hour drives on a weeknight");
  // Thanksgiving plans like a weekend, so the clam dig can show.
  ok(ids(r, "2026-11-26").includes("clams-ocean-shores"), "Thanksgiving gets an adventure day: razor clams", ids(r, "2026-11-26").join(","));
  const cl = tripsOn(r, "2026-11-26").find((t) => t.planId === "clams-ocean-shores");
  ok(cl && /9:00 PM low/.test(cl.why.join(" ")), "the dig is built around the low tide", cl && cl.why.join(" | "));
  ok(cl && cl.gear, "the clam trip says the gear is missing");
  ok(!ids(r, "2026-11-29").includes("clams-ocean-shores"), "no clam trip on a day with no dig");
  ok(r.days.every((d) => d.trips.length <= 4), "a day lists four trips at most");
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
  ok(c && /6\.7 ft swing/.test(c.why.join(" ")), "a 7:30 AM trip reads the 6.7 ft ebb, not the 18 ft overnight flood", c && c.why.join(" | "));
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
  ok(sat.includes("trout-fenwick"), "the same wind still fishes from the bank at Fenwick", sat.join(","));
  const calm = T.plan({ today, wx: week(today), tides: tidesFor(today) });
  ok(ids(calm, today).includes("trout-tapps"), "a calm Saturday puts the kayak on Lake Tapps", ids(calm, today).join(","));
}

// --- surf cancels the ocean ----------------------------------------------
{
  const today = "2026-11-28";
  const r = T.plan({ today, wx: week(today, (s) => (s === "ocean-shores" || s === "westport" ? { wave: 12 } : {})), tides: tidesFor(today) });
  ok(!ids(r, today).includes("clams-ocean-shores"), "12 ft surf cancels the clam dig");
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
