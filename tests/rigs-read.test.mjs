// The read: one trip on one day, said the way a guide would say it.
// Run: node tests/rigs-read.test.mjs
//
// Fixtures only. The tide on the night Coach asked about (11/27, squid at
// Les Davis or Redondo) is NOAA's own prediction for the two stations
// (CO-OPS 9446484 Tacoma and 9446248 Des Moines, read on 11/27): high 5:36
// PM, 11.3 ft, then -3.1 ft at 12:50 AM. Its rain and wind are made up,
// not a forecast: a shower that is about done by 7, almost no wind.
// Open-Meteo gives rain and its chance for the hour before the time it is
// given at, so the 6:00 reading is the rain from 5 to 6.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = { console };
ctx.globalThis = ctx;
vm.createContext(ctx);
ctx.window = ctx;
for (const f of ["content.js", "trips.js", "runs.js", "rules.js", "waters.js", "read.js"]) vm.runInContext(readFileSync(resolve(ROOT, "rigs", f), "utf8"), ctx);
const T = ctx.RIG.trips;
const CARDS = JSON.parse(readFileSync(resolve(ROOT, "tests/fixtures/spot-cards.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 500)); }
};
const pad = (n) => String(n).padStart(2, "0");
const line = (r, k) => ((r.lines || []).find((l) => l.k === k) || {}).text || "";
const brief = (r, k) => ((r.lines || []).find((l) => l.k === k) || {}).brief;
const words = (r) => [r.headline, r.reason, r.leave].concat((r.lines || []).map((l) => l.text)).filter(Boolean).join(" ");

// A forecast for two days at every spot. hour(spotId, iso, h) changes an hour.
function forecast(days, hour = () => ({}), sun = { rise: 7.55, set: 16.35 }) {
  const wx = {};
  for (const s of T.spots) {
    const hours = [], sunBy = {};
    for (const d of days) {
      sunBy[d] = typeof sun === "function" ? sun(d) : sun;
      for (let h = 0; h < 24; h++) hours.push({ t: `${d}T${pad(h)}:00`, temp: 45, rain: 0, pop: 0, wind: 4, gust: 8, clouds: 80, ...hour(s.id, d, h) });
    }
    wx[s.id] = { hours, sun: sunBy };
  }
  return wx;
}

// ---- tonight: two piers, same tide and weather, one with a roof ------------
const NIGHT = "2026-11-27"; // the day after Thanksgiving, a day off
// Keyed by the time Open-Meteo gives each reading at: 18 is 5 to 6 PM.
const POP = { 16: 55, 17: 45, 18: 35, 19: 13, 20: 4, 21: 2 };
const AMT = { 16: 0.02, 17: 0.01, 18: 0.01 };
const tonight = (pop = POP, amt = AMT) => forecast([NIGHT, "2026-11-28"], (id, d, h) => d !== NIGHT ? {} : {
  temp: h >= 17 && h <= 19 ? (h === 17 ? 49 : 48) : 46, rain: amt[h] || 0, pop: pop[h] ?? 0, wind: h >= 17 ? 1 + (h % 3) : 3, gust: 5 });
// NOAA's predictions for the two stations, as the app asks for them.
const TIDES = {
  "9446484": [["2026-11-27 00:00", "-3.77", "L"], ["2026-11-27 07:39", "13.025", "H"], ["2026-11-27 13:04", "8.086", "L"], ["2026-11-27 17:36", "11.307", "H"],
    ["2026-11-28 00:50", "-3.133", "L"], ["2026-11-28 08:32", "12.893", "H"], ["2026-11-28 14:09", "7.683", "L"], ["2026-11-28 18:37", "10.494", "H"]].map(([t, v, type]) => ({ t, v, type })),
  "9446248": [["2026-11-27 00:07", "-3.702", "L"], ["2026-11-27 07:44", "13.076", "H"], ["2026-11-27 13:07", "8.239", "L"], ["2026-11-27 17:33", "11.174", "H"],
    ["2026-11-28 00:57", "-3.044", "L"], ["2026-11-28 08:36", "12.972", "H"], ["2026-11-28 14:13", "7.864", "L"], ["2026-11-28 18:34", "10.363", "H"]].map(([t, v, type]) => ({ t, v, type }))
};

{
  const wx = tonight();
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: ["squid-redondo"] });
  ok(r.status === "ok" && r.call === "go", "tonight: a go", r.status + " " + r.call);
  ok(r.headline === "Go, best 5:00 to 8:00 PM", "the first line is the answer: go, and the best hours", r.headline);
  ok(r.reason === "High slack 5:36 PM, right at dark.", "then why those hours: NOAA's 5:36 PM high, after sunset", r.reason);
  ok(r.leave === "Leave by 3:57 PM", "and when to leave, the plan's own sum", r.leave);
  ok(r.lines.map((l) => l.label).join(",") === "Tide,Rain,Wind,Expect,Or", "five short labelled lines: Tide, Rain, Wind, Expect, Or", r.lines.map((l) => l.label).join(","));
  ok(line(r, "tide") === "High 5:36 PM, 11.3 ft, right at dark. Then a 14 ft drop by 12:50 AM, current strongest 8 to 10:30 PM.",
    "tide: NOAA's high with its time and height, the drop to the -3.1 ft low past midnight, and when the current runs hardest", line(r, "tide"));
  ok(brief(r, "tide") === "A 14 ft drop by 12:50 AM, current strongest 8 to 10:30 PM.", "its short form leaves out the high the reason already names", brief(r, "tide"));
  ok(line(r, "rain") === "35% at 5 PM, 13% at 6, done by 7.", "rain: the chance by the hour it falls in, and when it is done", line(r, "rain"));
  ok(line(r, "wind") === "Almost none, 1 to 3 mph. Air 46 to 49°F.", "wind, and the air named as the air", line(r, "wind"));
  ok(/^Day off: shoulder to shoulder squid crowds in November\./.test(line(r, "expect")), "expect: a day off evening in November on a pier its card says gets packed", line(r, "expect"));
  ok(/After 8 PM, add only enough weight to hang straight down\.$/.test(line(r, "expect")), "and the gear that matters once tonight's current runs (the squid rig card)", line(r, "expect"));
  ok(brief(r, "expect") === "Day off: shoulder to shoulder squid crowds in November.", "its short form is its first sentence", brief(r, "expect"));
  ok(line(r, "or") === "Redondo: same tide and weather, 10 min closer. Pick: Redondo.",
    "or: what is the same, what differs, and a pick counted from this pier (its reason said once): one wet hour is not worth a 10 min longer drive for a roof", line(r, "or"));
  ok(r.pick && r.pick.planId === "squid-redondo" && r.pick.why === "10 min closer" && !r.pick.self && r.pick.text === "Pick: Redondo.", "the pick, its reason, and that it is not this pier", r.pick);
  ok(r.fig && r.fig.best && Math.abs(r.fig.best[0] - 16.95) < 0.01 && r.fig.tide.some((x) => x.h > 24) && r.fig.rain.length === 5 && r.fig.rain[0].pop === 35 && r.fig.rain[0].h === 17 && r.fig.rain[0].t === 18,
    "the picture gets the hours, the turns past midnight and the chance of rain by the hour it falls in", r.fig && { best: r.fig.best, rain: r.fig.rain });

  const rr = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: ["squid-les-davis"] });
  ok(rr.headline === "Go, best 5:00 to 8:00 PM" && rr.reason === "High slack 5:33 PM, right at dark.", "Redondo's read, from its own station", rr.headline + " | " + rr.reason);
  ok(/^Day off: a crowded rail on good nights\./.test(line(rr, "expect")), "its crowd line is its own run card's", line(rr, "expect"));
  ok(line(rr, "or") === "Les Davis: same tide and weather, 10 min farther, a rain cover. Pick: Redondo, the closest.",
    "and it picks the same pier, said from where it stands: the closest", line(rr, "or"));
  ok(rr.pick && rr.pick.self, "a pick that is this pier says so");

  // All four squid piers: each read names two others at most, the pick among them, and every read picks the same one.
  const all = ["squid-les-davis", "squid-redondo", "squid-des-moines", "squid-point-defiance"].map((id) => T.read({ planId: id, iso: NIGHT, wx, tides: TIDES }));
  ok(all.every((x) => x.pick && x.pick.planId === "squid-redondo"), "with no list given, every squid pier's read picks the same one", all.map((x) => x.pick && x.pick.planId));
  ok(all.every((x) => (line(x, "or").match(/\. [A-Z][\w ]+: /g) || []).length <= 2), "and names two others at most", all.map((x) => line(x, "or")));
  ok(all[0].pick.why === "10 min closer" && all[2].pick.why === "5 min closer" && all[3].pick.why === "15 min closer" && all[1].pick.why === "the closest",
    "each read counts the drive from its own pier", all.map((x) => x.pick.why));
  ok(/Des Moines: same tide and weather, 5 min closer, outlets at the end for your light\./.test(line(all[0], "or")), "Des Moines: what only it has, outlets for your light, never whose light it is", line(all[0], "or"));
  ok(all.every((x) => !/own light|\bsame,/.test(line(x, "or"))), "and never a clipped \"same\"", all.map((x) => line(x, "or")));
  ok(/Point Defiance: [^.]*park hours at night not confirmed/.test(line(all[2], "or")) || !/Point Defiance/.test(line(all[2], "or")),
    "a pier whose night hours are not known says so, never guesses", line(all[2], "or"));
  ok(/^Park hours at night not confirmed\./.test(line(all[3], "expect")), "and says so in its own read too", line(all[3], "expect"));

  // A dry night: no roof needed, so the closer pier.
  const dry = tonight({}, {});
  const d = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: dry, tides: TIDES, others: ["squid-redondo"] });
  ok(line(d, "rain") === "Dry.", "a dry night says Dry", line(d, "rain"));
  ok(line(d, "or") === "Redondo: same tide and weather, 10 min closer. Pick: Redondo.", "and picks the closer pier", line(d, "or"));

  // Now raining lightly, before the trip: the reading for the hour that ends next.
  const now = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: tonight({ ...POP, 15: 70 }, { ...AMT, 15: 0.02 }), tides: TIDES, others: [], nowHour: 14.5 });
  ok(line(now, "rain") === "Light rain now. 35% at 5 PM, 13% at 6, done by 7.", "light rain now, then the evening", line(now, "rain"));
  ok(!line(now, "or"), "no others, no Or line");
  const nowDry = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: tonight({ ...POP, 14: 70 }, { ...AMT, 14: 0.02, 15: 0 }), tides: TIDES, others: [], nowHour: 14.5 });
  ok(!/now/.test(line(nowDry, "rain")), "rain that fell from 1 to 2 PM is not rain now at 2:30", line(nowDry, "rain"));
}

// ---- rain by the hour it falls in (Open-Meteo: the hour before) --------------
{
  // The 10:00 PM reading is the rain from 9 to 10, inside a trip to 10 PM.
  const late = forecast([NIGHT, "2026-11-28"], (id, d, h) => d === NIGHT && h === 22 ? { pop: 80, rain: 0.06 } : {});
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: late, tides: TIDES, others: [] });
  ok(line(r, "rain") === "Dry until 9 PM, then up to 80%.", "rain from 9 to 10 PM is inside the trip, and starts at 9", line(r, "rain"));
  ok(r.fig.rain.some((x) => x.h === 21 && x.t === 22 && x.pop === 80), "and the picture draws it from 9 to 10", r.fig.rain);
  // The 5:00 PM reading is 4 to 5, before full dark at 4:57: not the trip's rain.
  const early = forecast([NIGHT, "2026-11-28"], (id, d, h) => d === NIGHT && h === 17 ? { pop: 60, rain: 0.04 } : {});
  const e = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: early, tides: TIDES, others: ["squid-redondo"] });
  ok(line(e, "rain") === "Dry." && /10 min closer\. Pick: Redondo\.$/.test(line(e, "or")), "rain that is over before the trip starts is not said, and buys no rain cover", line(e, "rain") + " | " + line(e, "or"));
  // Dry, wet, dry, wet: both spells, never only the first.
  const P = { 18: 5, 19: 45, 20: 5, 21: 50, 22: 5 }, A = { 19: 0.02, 21: 0.03 };
  const two = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: forecast([NIGHT, "2026-11-28"], (id, d, h) => d === NIGHT ? { pop: P[h] ?? 5, rain: A[h] || 0 } : {}), tides: TIDES, others: [] });
  ok(line(two, "rain") === "On and off, up to 50% at 8 PM.", "rain that comes back is on and off, with its worst hour", line(two, "rain"));
  // The planner reads the same hours: a 30% chance or more is not Dry.
  const det = T.detail({ planId: "squid-les-davis", iso: NIGHT, wx: tonight(), tides: TIDES });
  ok(det.status === "ok" && !det.trip.why.includes("Dry") && det.trip.rainHours[0].h === 18 && det.trip.rainHours.length === 5,
    "the planner: the 35% hour from 5 to 6 is not Dry, and its rain hours are the trip's", det.trip && { why: det.trip.why, rain: det.trip.rainHours });
  const det2 = T.detail({ planId: "squid-les-davis", iso: NIGHT, wx: early, tides: TIDES });
  ok(det2.status === "ok" && det2.trip.why.includes("Dry"), "and rain over before the trip leaves it Dry", det2.trip && det2.trip.why);
}

// ---- rain all evening -------------------------------------------------------
{
  const pop = {}, amt = {};
  for (let h = 14; h < 24; h++) { pop[h] = h % 2 ? 90 : 80; amt[h] = 0.05; }
  const wx = tonight(pop, amt);
  const r = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: ["squid-les-davis"] });
  ok(r.call === "go" || r.call === "slow", "steady light rain is not a no-go on a pier", r.call);
  ok(line(r, "rain") === "Rain all evening, 80 to 90%.", "rain all evening, with its chance", line(r, "rain"));
  ok(/Pick: Les Davis, for the rain cover\.$/.test(line(r, "or")), "and the pick is the pier with a roof", line(r, "or"));
}

// ---- a no-go ----------------------------------------------------------------
{
  const wx = forecast([NIGHT, "2026-11-28"], (id, d) => d === NIGHT ? { wind: 28, gust: 42 } : {});
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES });
  ok(r.status === "nogo" && r.call === "no" && r.headline === "No, gusts to 42 mph", "a no-go leads with No and the reason", r.headline);
  ok(line(r, "wind") === "Strong, 28 mph, gusts 42. Air 45°F.", "the wind line shows it", line(r, "wind"));
  // The no-go names whichever broke its limit: a 22 mph wind, gusts under 30.
  const wind = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: forecast([NIGHT, "2026-11-28"], (id, d) => d === NIGHT ? { wind: 22, gust: 27 } : {}), tides: TIDES });
  ok(wind.headline === "No, wind to 22 mph", "a wind over its limit is named as the wind, not its gusts", wind.headline);
  ok(!line(r, "expect") && !line(r, "or") && !r.pick, "no expect, no comparison, no pick on a no-go day", r.lines);
  const dark = T.read({ planId: "squid-les-davis", iso: NIGHT, from: 9, to: 13, wx: tonight(), tides: TIDES });
  ok(dark.call === "no" && /^No, this one fishes after dark/.test(dark.headline), "squid in the morning is a no, said plainly", dark.headline);
  const shut = T.read({ planId: "coho-dash-point", iso: NIGHT, wx: tonight(), tides: TIDES });
  ok(shut.call === "no" && shut.headline === "No, out of season that day" && !shut.lines.length, "closed water: no, and no weather to read", shut);
}

// ---- no tide station, no hourly chance, no data -----------------------------
{
  const wx = tonight();
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: {}, others: [] });
  ok(r.status === "ok" && !line(r, "tide") && !/slack|tide|current/i.test(words(r)), "a tide that did not load is not guessed at: no tide line, no slack, no current", words(r));
  ok(/^(Go|Slow), 4:57 to 10:00 PM$/.test(r.headline) && !r.reason, "and with no slack to time it, the whole window, no reason made up", r.headline + " | " + r.reason);
  ok(!/After 8 PM/.test(line(r, "expect")), "nor the current gear");
  const old = tonight();
  Object.values(old).forEach((w) => w.hours.forEach((h) => { delete h.pop; }));
  const o = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: old, tides: TIDES, others: [] });
  ok(line(o, "rain") === "Rain at 5 PM, done by 6.", "a saved forecast with no hourly chance reads the rain itself", line(o, "rain"));
  const none = T.read({ planId: "squid-les-davis", iso: "2026-12-20", wx, tides: TIDES });
  ok(none.status === "nodata" && none.call === "" && none.headline === "No forecast for that day yet" && !none.lines.length, "past the forecast: says so, and nothing else", none);
  ok(T.read({ planId: "nope", iso: NIGHT, wx, tides: TIDES }).status === "unknown", "a plan the app does not have: unknown, not a crash");
}

// ---- a river trip ------------------------------------------------------------
{
  const SAT = "2026-11-28";
  const wx = forecast([SAT], (id, d, h) => ({ pop: h >= 13 ? 60 : 5, rain: h >= 13 ? 0.03 : 0, wind: 6, gust: 10, temp: 44 + (h > 11 ? 3 : 0) }));
  const flow = { "green-river": { days: { "2026-11-27": { min: 1300, max: 1500 }, [SAT]: { min: 900, max: 950 } }, now: null, ends: SAT } };
  const r = T.read({ planId: "chum-green-river", iso: SAT, wx, tides: {}, flow });
  ok(r.status === "ok" && r.call === "go", "a river trip: a go", r);
  ok(r.reason === "Good flow, 950 cfs, dropping after a rise.", "the flow and its trend are the reason", r.reason);
  ok(/^Go, 7:33 AM to 4:21 PM$/.test(r.headline), "a daylight trip runs first light to sunset", r.headline);
  ok(line(r, "river") === "Fishable to 1,200 cfs, blown out over 2,000.", "a River line in place of the tide: the numbers the flow is held to", line(r, "river"));
  ok(!line(r, "tide"), "and no tide on a river");
  ok(line(r, "rain") === "Dry until 12 PM, then up to 60%.", "rain: when it starts (the 1 PM reading is the rain from noon)", line(r, "rain"));
  ok(line(r, "wind") === "Light, 6 mph. Air 44 to 47°F.", "wind and the air", line(r, "wind"));
  ok(/Metzler has about 20 spaces\./.test(line(r, "expect")), "expect: from the run card", line(r, "expect"));
  ok(!line(r, "or"), "nothing else has chum that day, so no comparison");
  const up = { "green-river": { days: { "2026-11-27": { min: 900, max: 900 }, [SAT]: { min: 800, max: 1800 } } } };
  const hi = T.read({ planId: "chum-green-river", iso: SAT, wx, tides: {}, flow: up });
  ok(/^High water, 1,800 cfs, rising\.$/.test(hi.reason), "a rising, high river says so", hi.reason);
  const now = T.read({ planId: "chum-green-river", iso: SAT, wx, tides: {}, flow: { "green-river": Object.assign({}, flow["green-river"], { now: { cfs: 1010, at: "2026-11-28T17:00:00Z" } }) } });
  ok(line(now, "river") === "Fishable to 1,200 cfs, blown out over 2,000. Now 1,010.", "and today, the reading now", line(now, "river"));
}

// ---- two rivers with the same fish: each one's flow, and the pick -------------
{
  const SAT = "2026-12-12";
  const wx = forecast([SAT], () => ({ temp: 40, pop: 10, wind: 4, gust: 8 }));
  const flow = { tokul: { days: { "2026-12-11": { min: 3000, max: 3200 }, [SAT]: { min: 2600, max: 2800 } } },
    cowlitz: { days: { "2026-12-11": { min: 9000, max: 9000 }, [SAT]: { min: 9000, max: 9100 } } } };
  const r = T.read({ planId: "steelhead-tokul", iso: SAT, wx, tides: {}, flow });
  ok(r.reason === "Good flow, 2,800 cfs, steady." && line(r, "river") === "Fishable to 3,500 cfs, blown out over 7,000.", "Tokul: its own gauge and its own numbers", r.reason + " | " + line(r, "river"));
  ok(!/crowd/i.test(line(r, "expect")) && line(r, "expect") === "Cold, wet hands. Bring dry gloves for the drive home.",
    "a Saturday at the hatchery: no crowd line, because the spot lists its weekend crowd as unknown; the run card's first word instead", line(r, "expect"));
  ok(line(r, "or") === "Cowlitz River: same weather, good flow, 9,100 cfs, steady, 30 min farther. Pick: Tokul Creek, the closest.",
    "the other steelhead river: its flow and trend, the drive, and a pick", line(r, "or"));
}

// ---- a lake trip, with another lake in reach ------------------------------------
{
  const SAT = "2026-11-28";
  T.addWaters({ at: 1, waters: [{ geo: "L999", name: "Testing Lake", county: "King", lat: 47.35, lon: -122.27, km: 20, rule: { status: "ok" },
    plants: [{ d: "2026-11-20", sp: "Rainbow", n: 2000, fpp: 2 }] }] });
  const wx = forecast([SAT], () => ({ wind: 3, gust: 6, temp: 41 }));
  const r = T.read({ planId: "trout-w-l999", iso: SAT, wx, tides: {} });
  ok(r.status === "ok" && /^Go, 7:33 AM to 3:00 PM$|^Go, 7:33 AM to 4:21 PM$/.test(r.headline), "a lake: a daylight go", r.headline);
  ok(/^Stocked Nov 20: 2000 rainbow, catchable size\.$/.test(r.reason), "the plant is the reason", r.reason);
  ok(!line(r, "tide") && !line(r, "river"), "no tide station and no gauge: neither line");
  ok(line(r, "rain") === "Dry." && line(r, "wind") === "Almost none, 3 mph. Air 41°F.", "rain and wind", line(r, "rain") + " | " + line(r, "wind"));
  const f = T.read({ planId: "trout-fenwick", iso: SAT, wx, tides: {} });
  ok(f.status === "ok" && /Testing Lake: [^.]*\./.test(line(f, "or")), "Fenwick's read names the stocked lake nearby", line(f, "or"));
  ok(/Pick: Testing Lake, for the Nov 20 plant\.$/.test(line(f, "or")), "and picks it, said plainly: the plant beats a lake with none", line(f, "or"));
  ok(/Testing Lake: [^.]*better/.test(line(f, "or")) && !/not slow|slow, not/.test(line(f, "or")), "a better day is \"better\", never \"good, not slow\"", line(f, "or"));
  T.addWaters({ at: 2, waters: [] });
}

// ---- December nights, NOAA's own tides ------------------------------------------
{
  const noaa = (rows) => rows.map(([t, v, type]) => ({ t, v, type }));
  const DEC = { "9446484": noaa([["2026-12-05 03:19", "10.308", "H"], ["2026-12-05 08:13", "6.821", "L"], ["2026-12-05 13:38", "11.811", "H"], ["2026-12-05 20:50", "-0.692", "L"],
    ["2026-12-06 04:17", "11.278", "H"], ["2026-12-06 09:16", "7.536", "L"], ["2026-12-12 00:13", "-1.31", "L"], ["2026-12-12 07:53", "12.357", "H"], ["2026-12-12 13:41", "7.733", "L"],
    ["2026-12-12 17:50", "9.499", "H"], ["2026-12-13 00:52", "-0.853", "L"], ["2026-12-13 08:26", "12.287", "H"]]) };
  DEC["9446248"] = DEC["9446484"];
  const sun = (d) => ({ rise: 7.75, set: d === "2026-12-05" ? 16.28 : 16.27 });
  const days = ["2026-12-05", "2026-12-06", "2026-12-12", "2026-12-13"];
  // Dec 5 (a Saturday): high 1:38 PM before sunset, then a 12.5 ft ebb to the 8:50 PM low.
  const wx = forecast(days, () => ({ pop: 10, wind: 4, gust: 9, temp: 41 }), sun);
  const r = T.read({ planId: "squid-les-davis", iso: "2026-12-05", wx, tides: DEC, others: [] });
  ok(r.call === "go" && !/slack/i.test(r.headline + r.reason) && /^Go, 4:5\d to 10:00 PM$/.test(r.headline) && !r.reason,
    "a squid night with no high near dark: the whole window, no slack, no reason made up (never timed on a low)", r.headline + " | " + r.reason);
  ok(line(r, "tide") === "Falling from the 1:38 PM high, 11.8 ft, to the 8:50 PM low, -0.7 ft, current strongest 4 to 6:30 PM.",
    "a trip that starts mid-swing says the swing: the evening is one long ebb", line(r, "tide"));
  ok(!/November/.test(words(r)) && !/crowds in/.test(line(r, "expect")), "a November crowd is not said in December", line(r, "expect"));
  ok(/^Until 6:30 PM, add only enough weight/.test(line(r, "expect")), "the current gear, for the hours the current is strong", line(r, "expect"));
  // Dec 12: high 5:50 PM, full dark 4:53: the best hours start at or after full dark.
  const d12 = T.read({ planId: "squid-les-davis", iso: "2026-12-12", wx, tides: DEC, others: [] });
  ok(d12.headline === "Go, best 5:00 to 8:00 PM", "the best start rounds up and the end down, never outside the hours worked out", d12.headline);
  // A made-up high at 4:05 PM, sunset 4:16: in daylight, so never "right at dark".
  const t2 = { "9446484": noaa([["2026-12-05 09:50", "5", "L"], ["2026-12-05 16:05", "11.0", "H"], ["2026-12-05 23:20", "-1.5", "L"]]) };
  const day = T.read({ planId: "squid-les-davis", iso: "2026-12-05", wx: forecast(days, () => ({ pop: 10 }), () => ({ rise: 7.75, set: 16.27 })), tides: t2, others: [] });
  ok(!/right at dark/.test(words(day)) && !/slack/i.test(day.reason), "a high before sunset is never \"right at dark\", nor a slack the night is timed on", words(day));
}

// ---- rivers and lakes with nothing to call, and closed water -----------------------
{
  const SAT = "2026-11-28";
  const wx = forecast([SAT], () => ({ pop: 15, wind: 8, gust: 18, temp: 47 }));
  const none = T.read({ planId: "chum-green-river", iso: SAT, wx, tides: {}, flow: {} });
  ok(none.status === "ok" && none.call === "none" && /^No river reading yet, 7:33 AM to 4:21 PM$/.test(none.headline) && !none.leave && !/^Go|^Slow/.test(none.headline),
    "a river with no reading: no Go and no Slow, and no time to leave", none.headline + " | " + none.leave);
  ok(line(none, "river") === "Fishable to 1,200 cfs, blown out over 2,000.", "with the numbers to check it against", line(none, "river"));
  // The Puyallup's numbers are the lead's starting numbers, and say so.
  const SEP = "2026-10-10"; // a Saturday, coho season
  const pw = forecast([SEP], () => ({ pop: 5, wind: 5, gust: 9, temp: 60 }), { rise: 7.3, set: 18.6 });
  const puy = T.read({ planId: "coho-puyallup-sumner", iso: SEP, wx: pw, tides: {}, flow: { "puyallup-sumner": { days: { "2026-10-09": { min: 900, max: 950 }, [SEP]: { min: 900, max: 950 } } } } });
  ok(puy.status !== "ok" || line(puy, "river") === "Starting numbers: fishable to 1,800 cfs, blown out over 3,500.", "the Puyallup's flow numbers are called starting numbers", puy.status + " " + line(puy, "river"));
  ok(puy.status === "ok", "(the Puyallup case ran)", puy.status);
  // Closed: the reason as written, names and months kept.
  const shut = forecast(["2026-12-12"], () => ({}));
  const ramp = T.read({ planId: "trout-tapps", iso: "2026-12-12", wx: shut, tides: {} });
  const dec = T.read({ planId: "steelhead-green-river", iso: "2026-12-12", wx: shut, tides: {} });
  ok(ramp.headline === "No, off the list for now" && ramp.reason === "Allan Yorke ramp closed since Jul 27, no reopen date." && dec.reason === "December steelhead limit not confirmed. Closed Jan to May.",
    "closed water: the reason as written, never \"allan Yorke\" or \"december\"", [ramp.headline, ramp.reason, dec.reason]);
  // Pier salmon: the run card's "Slow." is not said under a Go.
  const fall = forecast(["2026-11-28"], () => ({ pop: 10, wind: 5, gust: 10, temp: 46 }));
  const sal = T.read({ planId: "salmon-les-davis", iso: "2026-11-28", wx: fall, tides: TIDES, others: [] });
  ok(/^Go/.test(sal.headline) && !/^Slow/.test(line(sal, "expect")) && /no-fish days/.test(line(sal, "expect")), "a Go is never followed by an Expect that starts \"Slow\"", sal.headline + " | " + line(sal, "expect"));
  ok(/Low 2:09 PM, 7\.7 ft\. Current strongest 10:30 AM to 12:15 PM, on the drop to it\./.test(line(sal, "tide")),
    "the current is said right after the turn it runs to, never after a later swing", line(sal, "tide"));
  // Moving water on a day with almost no swing: no best hours cut from the turns, and the light as the reason.
  const tiny = { "9446484": [{ t: "2026-11-26 05:00", v: 9, type: "H" }, { t: "2026-11-26 11:00", v: 7, type: "L" }, { t: "2026-11-26 17:00", v: 9.5, type: "H" }] };
  const sm = T.read({ planId: "salmon-les-davis", iso: "2026-11-26", wx: forecast(["2026-11-26"], () => ({})), tides: tiny, others: [] });
  ok(!sm.best.own && /^(Go|Slow), 7:33 AM to 4:21 PM$/.test(sm.headline) && sm.reason === "First light to sunset." && /little current/.test(line(sm, "tide")),
    "a small-swing day: the whole daylight window, the light as its reason, and little current", sm.headline + " | " + sm.reason + " | " + line(sm, "tide"));
}

// ---- a dig: WDFW's low, and the clam card's best hours to the minute -----------------
{
  const wx = forecast(["2026-11-28"], () => ({ pop: 10, wind: 12, gust: 22, temp: 49, wave: 7 }));
  const r = T.read({ planId: "clams-ocean-shores", iso: "2026-11-28", wx, tides: {} });
  const dig = T.plans.find((p) => p.id === "clams-ocean-shores").digs["2026-11-28"];
  const at = (h) => T.clock(h);
  ok(r.call === "go" && r.headline === "Go, best " + at(dig.low - 2).replace(/ PM$/, "") + " to " + at(dig.low - 1), "the best hours are 1 to 2 hours before WDFW's low, to the minute", r.headline + " | low " + at(dig.low));
  ok(line(r, "tide") === "Low " + at(dig.low) + ", " + dig.ft.toFixed(1) + " ft (WDFW). Best from 1 to 2 hours before it.", "the clam card's own words", line(r, "tide"));
}

// ---- the pick: what truly differs ---------------------------------------------------
{
  const wx = forecast([NIGHT, "2026-11-28"], (id, d) => d !== NIGHT ? {} : { wind: id === "redondo" ? 13 : 6, gust: id === "redondo" ? 19 : 11, pop: 5 });
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: ["squid-redondo"] });
  ok(line(r, "or") === "Redondo: same tide, windier, to 13 mph, 10 min closer. Pick: Les Davis, calmer, to 6 mph.",
    "the same high slack at both piers is never the reason: the wind is", line(r, "or"));
  const rr = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: ["squid-les-davis"] });
  ok(/Pick: Les Davis, calmer, to 6 mph\.$/.test(line(rr, "or")), "and from the windy pier, the same pick and the same reason", line(rr, "or"));
  // Rain all evening, two wet hours or more on the best ones: the roof.
  const pop = {}, amt = {};
  for (let h = 14; h < 24; h++) { pop[h] = 80; amt[h] = 0.05; }
  const wet = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: tonight(pop, amt), tides: TIDES, others: ["squid-redondo"] });
  ok(/Pick: Les Davis, for the rain cover\.$/.test(line(wet, "or")) && wet.pick.self, "a wet evening at the pier with the roof: this one, for the rain cover", line(wet, "or"));
}

// ---- today, and the trip's hours are over ---------------------------------------------
{
  const wx = forecast(["2026-11-28", "2026-11-29"], () => ({ pop: 5, wind: 5, gust: 9, temp: 46 }));
  const flow = { "green-river": { days: { "2026-11-27": { min: 900, max: 950 }, "2026-11-28": { min: 900, max: 950 }, "2026-11-29": { min: 900, max: 950 } } } };
  const r = T.read({ planId: "chum-green-river", iso: "2026-11-28", from: 7.6, to: 11, wx, tides: {}, flow, nowHour: 15 });
  ok(r.call === "done" && r.headline === "Done for today" && !r.leave && !r.lines.length && /^Next good day: tomorrow, 7:3\d AM to 4:2\d PM\.$/.test(r.reason),
    "at 3 PM a morning trip is done: no Go, no time to leave, and the next good day", [r.headline, r.reason, r.leave]);
  const still = T.read({ planId: "chum-green-river", iso: "2026-11-28", from: 7.6, to: 11, wx, tides: {}, flow, nowHour: 9 });
  ok(still.call === "go", "while it is on, it is still a go", still.headline);
}

// ---- my window: the hours someone can go, judged ------------------------------------
// Coach, 11/27: "I can probably head out around 8 PM to 12 AM ... I'm trying
// to figure out if it's worth it or not." NOAA's predictions (read 11/27) for
// Des Moines (Redondo) run on to Nov 29; Tacoma's here stop at Nov 28.
{
  const noaa = (rows) => rows.map(([t, v, type]) => ({ t, v, type }));
  const WEEK = { "9446484": TIDES["9446484"], "9446248": TIDES["9446248"].concat(noaa([["2026-11-29 01:49", "-1.967", "L"], ["2026-11-29 09:27", "12.824", "H"],
    ["2026-11-29 15:28", "7.141", "L"], ["2026-11-29 19:46", "9.383", "H"], ["2026-11-30 02:44", "-0.553", "L"]])) };
  const days = [NIGHT, "2026-11-28", "2026-11-29"];
  const wx = forecast(days, (id, d, h) => d !== NIGHT ? {} : { temp: 46, rain: AMT[h] || 0, pop: POP[h] ?? 0, wind: h >= 17 ? 1 + (h % 3) : 3, gust: 5 });
  const W = { winFrom: 20, winTo: 0 };
  // A big ebb: high 5:36 PM, 11.3 ft, to -3.1 ft at 12:50 AM.
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: WEEK, others: [], ...W });
  ok(r.status === "ok" && r.grade === "fair" && r.headline === "8 to 12: fair, not great", "8 to 12 on a big ebb: fair, not great", r.headline);
  ok(r.reason === "The tide drops 10 ft by 12 AM, current strongest until 10:30 PM. Easiest after 10:30 PM. Dry, light wind.",
    "why: the drop in those hours, the hard current, the easiest part, and the weather in it (the rain is done before 8)", r.reason);
  ok(r.best.own && r.best.say[0] === 22.5 && r.best.say[1] === 24 && r.fig.best && r.fig.a === 20 && r.fig.b === 24, "the easiest part is the gold band in the picture of those hours", { best: r.best, fig: r.fig && [r.fig.a, r.fig.b, r.fig.best] });
  ok(line(r, "tide") === "Falling from the 5:36 PM high, 11.3 ft, to the 12:50 AM low, -3.1 ft, current strongest 8 to 10:30 PM.", "the tide line reads those hours, not the trip's", line(r, "tide"));
  ok(line(r, "rain") === "Dry." && r.leave === "Leave by 7:00 PM" && r.hours.join() === "20,24", "dry from 8, and when to leave for 8", [line(r, "rain"), r.leave, r.hours]);
  ok(!r.better, "Tacoma's tides in the app stop at Nov 28, a fair night too: no better day is named", r.better);
  // The same at Redondo, whose station runs on to Nov 29: a high at 7:46 PM.
  const rr = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: WEEK, others: [], ...W });
  ok(rr.headline === "8 to 12: fair, not great" && rr.better && rr.better.iso === "2026-11-29" && rr.better.text === "Better for 8 to 12: Sun Nov 29.",
    "a day in the forecast that suits the same window better gets one line", rr.better);
  const sun29 = T.read({ planId: "squid-redondo", iso: "2026-11-29", wx, tides: WEEK, others: [], ...W });
  ok(sun29.grade === "good" && /^The tide drops 7 ft by 12 AM, current strongest after 10 PM\. Best until 10 PM\./.test(sun29.reason),
    "and that day reads good: soft water from its 7:46 PM high until 10, the current after", sun29.headline + " | " + sun29.reason);
  ok(!sun29.better, "a good window names no better day");
  // With others: each one reads the same window.
  const both = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: WEEK, others: ["squid-redondo"], ...W });
  // No high in those hours to time either pier on: the tide is the same when
  // it stands at the same height at both ends of them (7.7 and 7.7 ft at 8 PM, -2.7 and -2.5 at 12).
  ok(line(both, "or") === "Redondo: same tide and weather, 10 min closer. Pick: Redondo.", "the other pier is read for the same window, and its tide is the same", line(both, "or"));
  // Redondo and Des Moines go by the same NOAA station: the same tide, always.
  const dm = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: WEEK, others: ["squid-des-moines"], ...W });
  ok(/^Des Moines: same tide and weather, 5\u00a0?\s?min farther/.test(line(dm, "or").replace(/\u00a0/g, " ")), "two piers on one tide station: same tide", line(dm, "or"));

  // Near slack (Nov 17, NOAA Tacoma): a 1.6 ft rise to a 10:37 PM high.
  const N17 = "2026-11-17";
  const T17 = { "9446484": noaa([["2026-11-17 03:43", "1.683", "L"], ["2026-11-17 11:20", "11.46", "H"], ["2026-11-17 18:16", "5.819", "L"], ["2026-11-17 22:37", "7.464", "H"],
    ["2026-11-18 04:41", "2.622", "L"], ["2026-11-18 11:59", "11.559", "H"], ["2026-11-18 18:54", "4.619", "L"]]) };
  const s17 = T.read({ planId: "squid-les-davis", iso: N17, wx: forecast([N17, "2026-11-18"]), tides: T17, others: [], ...W });
  ok(s17.grade === "good" && s17.headline === "8 to 12: good", "8 to 12 on a near-slack night: good", s17.headline);
  ok(s17.reason === "A 1.6 ft rise to the 10:37 PM high, little current. Best around the high. Dry, light wind.", "why: the small rise, the slack, the weather", s17.reason);
  ok(/little current\.$/.test(line(s17, "tide")) && s17.best.own && s17.best.from > 21 && s17.best.to === 24, "its tide line, and the best part around the high", line(s17, "tide") + " | " + JSON.stringify(s17.best));
  ok(!s17.better, "a good window names no better day", s17.better);

  // Rain and wind take a window down a step, and say so.
  const wet = {};
  for (let h = 20; h <= 24; h++) wet[h] = 80;
  const rainy = T.read({ planId: "squid-les-davis", iso: N17, wx: forecast([N17, "2026-11-18"], (id, d, h) => d === N17 && wet[h] ? { pop: 80, rain: 0.04 } : {}), tides: T17, others: [], ...W });
  ok(rainy.grade === "fair" && /Rain most of it, light wind\.$/.test(rainy.reason), "a slack night in the rain: fair, and the rain is why", rainy.headline + " | " + rainy.reason);
  const windy = T.read({ planId: "squid-les-davis", iso: N17, wx: forecast([N17, "2026-11-18"], () => ({ wind: 14, gust: 22 })), tides: T17, others: [], ...W });
  ok(windy.grade === "fair" && /Dry, windy, to 14 mph\.$/.test(windy.reason), "and in a 14 mph wind", windy.headline + " | " + windy.reason);
  const blown = T.read({ planId: "squid-les-davis", iso: N17, wx: forecast([N17, "2026-11-18"], (id, d) => d === N17 ? { wind: 26, gust: 40 } : {}), tides: T17, others: [], ...W });
  ok(blown.call === "no" && blown.headline === "No, gusts to 40 mph", "a window over the wind limit is a no", blown.headline);

  // A daylight trip in an evening window: no, and why.
  const SAT = "2026-11-28";
  const flow = { "green-river": { days: { "2026-11-27": { min: 900, max: 950 }, [SAT]: { min: 900, max: 950 } } } };
  const river = T.read({ planId: "chum-green-river", iso: SAT, wx: forecast([SAT]), tides: {}, flow, ...W });
  ok(river.call === "no" && river.headline === "No, dark by then", "a river at 8 PM: dark by then", river.headline);
  const riv = T.read({ planId: "chum-green-river", iso: SAT, wx: forecast([SAT]), tides: {}, flow, winFrom: 13, winTo: 18 });
  ok(riv.headline === "1 to 6: good" && /^Sunset at 4:21 PM\. Good flow, 950 cfs, steady\./.test(riv.reason) && riv.hours[1] === 16.35,
    "1 to 6 on the river: good on its flow, and cut at sunset, said first", riv.headline + " | " + riv.reason);
}

// ---- the window is saved on this phone, and comes back --------------------------
{
  const store = {};
  const storage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const load = () => {
    const c = { console, localStorage: storage }; c.globalThis = c; vm.createContext(c); c.window = c;
    for (const f of ["content.js", "trips.js", "runs.js", "rules.js", "waters.js", "read.js"]) vm.runInContext(readFileSync(resolve(ROOT, "rigs", f), "utf8"), c);
    return c.RIG.trips.myWin;
  };
  const M = load();
  ok(M.kindOf("squid-les-davis") === "dark" && M.kindOf("chum-green-river") === "day", "a night trip and a daylight trip each keep their own window");
  ok(M.get("dark") === null, "nothing saved: no window, the trip's own hours");
  ok(M.set("dark", "20:00", "00:00") === true && JSON.parse(store[M.key]).dark.to === "00:00", "8 PM to 12 AM is saved, under one key", store[M.key]);
  ok(M.set("dark", "20:00", "20:10") === false && M.get("dark").to === "00:00", "ten minutes is not a window, and the saved one stays");
  const again = load();
  const back = again.get("dark"), hrs = again.hours(back);
  ok(back && back.from === "20:00" && back.to === "00:00" && hrs.winFrom === 20 && hrs.winTo === 0 && again.get("day") === null,
    "opened again, the window comes back, as hours the read takes", { back, hrs });
  again.clear("dark");
  ok(again.get("dark") === null && !(M.key in store), "Best hours forgets it", store);
}

// ---- a leave time that has gone by is never said ------------------------------------
{
  const wx = tonight();
  const clock = (x) => { const m = /(\d+):(\d\d) (AM|PM)/.exec(x); return m ? (+m[1] % 12) + (m[3] === "PM" ? 12 : 0) + m[2] / 60 : null; };
  // From now, the fishing starts when you get there: now, the drive (45 min
  // to Les Davis) and a quarter hour, to the next 5 minutes.
  // 4:30 PM: the 3:57 PM leave has gone by. Leaving now, on the pier at 5:30.
  const late = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 16.5 });
  ok(late.leave === "Leave now" && late.headline === "Go, best until 8:00 PM" && late.hours[0] === 17.5, "a leave time that has gone by: leave now, and the trip from 5:30, when you get there", [late.leave, late.headline, late.hours]);
  // 6:12 PM: the trip has started. On the pier at 7:15.
  const on = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 18.2 });
  ok(on.leave === "Leave now" && on.headline === "Go, until 10:00 PM" && on.fig.a === 19.25 && on.hours[0] === 19.25, "once it has started, from when you get there: until 10 PM, leave now", [on.headline, on.leave, on.fig.a]);
  ok(line(on, "rain") === "Dry." && !/5 PM|35%|13%/.test(words(on)), "and no rain hour that is over before you get there", line(on, "rain"));
  // 9:30 PM inside an 8 to 12 window: on the pier at 10:30.
  const mid = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 21.5, winFrom: 20, winTo: 0 });
  ok(/^10:30 to 12: /.test(mid.headline) && mid.leave === "Leave now" && mid.hours[0] === 22.5, "a window under way: from 10:30, when you get there, to 12, leave now", [mid.headline, mid.leave, mid.hours]);
  // 9 PM at Redondo, 35 min away (the check of 11/27): never "Leave now" and fish at 9.
  const nine = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 21, winFrom: 20, winTo: 0 });
  ok(/^9:50 to 12: /.test(nine.headline) && nine.leave === "Leave now" && Math.abs(nine.hours[0] - (21 + 50 / 60)) < 1e-6 && nine.fig.a === nine.hours[0],
    "9 PM, 35 min away: 9:50 to 12, leave now", [nine.headline, nine.leave, nine.hours]);
  // The others are read over THIS read's hours, never their own later
  // arrival: a pier with the same tide and weather is not "better" because
  // you would get there later (the check of 11/27: from 9:21 to 9:31 PM the
  // Redondo card picked Point Defiance, Les Davis, then Des Moines).
  for (const m of [21.35, 21.43, 21.52]) {
    const rr = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: ["squid-les-davis", "squid-des-moines"], nowHour: m, winFrom: 20, winTo: 0 });
    ok(!rr.pick || rr.pick.self || rr.pick.planId === "squid-redondo", "at " + m + " h the Redondo card does not send you to a farther pier with the same tide and weather", [rr.pick, line(rr, "or")]);
  }
  // 7:45 PM, before the window, but 8 PM can not be made: from 8:45.
  const soon = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 19.75, winFrom: 20, winTo: 0 });
  ok(/^8:45 to 12: /.test(soon.headline) && soon.leave === "Leave now" && soon.hours[0] === 20.75, "a window you can not be there for at its start: from when you can", [soon.headline, soon.leave, soon.hours]);
  // 7 PM: the 7:00 PM leave is now, and 8 PM is made.
  const just = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 19, winFrom: 20, winTo: 0 });
  ok(/^8 to 12: /.test(just.headline) && just.hours[0] === 20, "leaving on time, the window is its own", [just.headline, just.leave]);
  // 11:20 PM: on the pier past 12, under half an hour: done for today.
  const gone = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 23.35, winFrom: 20, winTo: 0 });
  ok(gone.call === "done" && !gone.leave, "too late to get half an hour in: done for today", [gone.headline, gone.leave]);
  // From now, the other piers are read from now too: no high that has gone by.
  const tn = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: ["squid-des-moines"], nowHour: 20 });
  ok(/^Des Moines: same tide and weather, 5\smin farther/.test(line(tn, "or")) && !/5:33|5:36/.test(line(tn, "or")), "from now, the other pier is read from now: same tide, no passed high", line(tn, "or"));
  ok([late, on, mid].every((x) => clock(x.leave) == null || clock(x.leave) > 16.5), "no read here says a leave time before now");
  const done = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: [], nowHour: 23.9, winFrom: 19, winTo: 23 });
  ok(done.call === "done" && !done.leave && /for 7 to 11/.test(done.reason), "a window that is over is done for today", done.headline + " | " + done.reason);
}

// ---- every fact the read compares by is on its spot card ------------------------
{
  const F = T.readFacts;
  const card = (id) => JSON.stringify(CARDS[id] || {});
  ok(/Rain cover/.test(card("les-davis")) && F["les-davis"].cover, "Les Davis's rain cover is on its card (WDFW)");
  ok(/shoulder-to-shoulder squid crowds in November/.test(card("les-davis")), "and its November crowd");
  ok(/Tall single-arm lamp posts along the pier/.test(card("redondo")) && F.redondo.lamps === "pier" && !F.redondo.cover, "Redondo: lamp posts on its card, and no roof claimed");
  ok(/Busy night squid pier, October to December/.test(card("redondo")), "and its busy season");
  ok(/Electrical outlets at the very end of the pier/.test(card("des-moines-pier")) && F["des-moines-pier"].outlets && !F["des-moines-pier"].lamps, "Des Moines: outlets for your light, from its card, and nothing about whose light");
  ok(F["les-davis"].crowd.squid.months.join() === "11" && F.redondo.crowd.squid.months.join() === "10,11,12", "each crowd fact carries the months it is true in");
  ok(Object.keys(F).every((id) => T.spots.some((s) => s.id === id)), "every fact belongs to a spot the app has");
}

// ---- words ----------------------------------------------------------------------
{
  const wx = tonight();
  const texts = [];
  for (const p of T.plans) for (const iso of [NIGHT, "2026-11-28"]) {
    const r = T.read({ planId: p.id, iso, wx, tides: TIDES, flow: {} });
    texts.push(words(r));
    const m = T.read({ planId: p.id, iso, wx, tides: TIDES, flow: {}, winFrom: 20, winTo: 0 }), d = T.read({ planId: p.id, iso, wx, tides: TIDES, flow: {}, winFrom: 9, winTo: 13 });
    texts.push(words(m) + (m.better ? " " + m.better.text : ""), words(d) + (d.better ? " " + d.better.text : ""));
  }
  const bad = texts.filter((x) => /—|undefined|NaN|null|\[object/.test(x));
  ok(bad.length === 0, "no em dashes, no undefined, NaN or null in any read", bad.slice(0, 3));
  ok(texts.every((x) => !/  /.test(x)), "no double spaces", texts.filter((x) => /  /.test(x)).slice(0, 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
