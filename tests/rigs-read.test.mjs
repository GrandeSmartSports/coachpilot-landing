// The read: one trip on one day, said the way a guide would say it.
// Run: node tests/rigs-read.test.mjs
//
// Fixtures only. Tonight's case is the night Coach asked about (11/27, squid
// at Les Davis or Redondo): high slack at 5:35 PM, a 14 ft drop by 1 AM,
// rain about done by 7, almost no wind.
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
const words = (r) => [r.headline, r.reason, r.leave].concat((r.lines || []).map((l) => l.text)).filter(Boolean).join(" ");

// A forecast for two days at every spot. hour(spotId, iso, h) changes an hour.
function forecast(days, hour = () => ({})) {
  const wx = {};
  for (const s of T.spots) {
    const hours = [], sun = {};
    for (const d of days) {
      sun[d] = { rise: 7.55, set: 16.35 };
      for (let h = 0; h < 24; h++) hours.push({ t: `${d}T${pad(h)}:00`, temp: 45, rain: 0, pop: 0, wind: 4, gust: 8, clouds: 80, ...hour(s.id, d, h) });
    }
    wx[s.id] = { hours, sun };
  }
  return wx;
}

// ---- tonight: two piers, same tide and weather, one with a roof ------------
const NIGHT = "2026-11-27"; // the day after Thanksgiving, a day off
const POP = { 15: 55, 16: 45, 17: 35, 18: 13, 19: 4, 20: 2 };
const AMT = { 15: 0.02, 16: 0.01, 17: 0.01 };
const tonight = (pop = POP, amt = AMT) => forecast([NIGHT, "2026-11-28"], (id, d, h) => d !== NIGHT ? {} : {
  temp: h >= 17 && h <= 19 ? (h === 17 ? 49 : 48) : 46, rain: amt[h] || 0, pop: pop[h] ?? 0, wind: h >= 17 ? 1 + (h % 3) : 3, gust: 5 });
// The two stations, a few minutes apart, as NOAA gives them.
const TURNS = [["2026-11-27 05:58", "11.4", "H"], ["2026-11-27 11:20", "6.9", "L"], ["2026-11-27 17:35", "13.2", "H"],
  ["2026-11-28 01:05", "-0.9", "L"], ["2026-11-28 06:40", "11.2", "H"]];
const station = (shift = "17:35") => TURNS.map(([t, v, type]) => ({ t: t.replace("17:35", shift), v, type }));
const TIDES = { "9446484": station(), "9446248": station("17:31") };

{
  const wx = tonight();
  const r = T.read({ planId: "squid-les-davis", iso: NIGHT, wx, tides: TIDES, others: ["squid-redondo"] });
  ok(r.status === "ok" && r.call === "go", "tonight: a go", r.status + " " + r.call);
  ok(r.headline === "Go, best 5:00 to 8:00 PM", "the first line is the answer: go, and the best hours", r.headline);
  ok(r.reason === "High slack 5:35 PM, right at dark.", "then why those hours", r.reason);
  ok(r.leave === "Leave by 3:57 PM", "and when to leave, the plan's own sum", r.leave);
  ok(r.lines.map((l) => l.label).join(",") === "Tide,Rain,Wind,Expect,Or", "five short labelled lines: Tide, Rain, Wind, Expect, Or", r.lines.map((l) => l.label).join(","));
  ok(line(r, "tide") === "High 5:35 PM, 13.2 ft, right at dark. Then a 14 ft drop by 1:05 AM, current strongest 8 to 10:30 PM.",
    "tide: the high in the window with its time and height, the drop after it past midnight, and when the current runs hardest", line(r, "tide"));
  ok(line(r, "rain") === "35% at 5 PM, 13% at 6, done by 7.", "rain: the chance by the hour, and when it is done", line(r, "rain"));
  ok(line(r, "wind") === "Almost none, 1 to 3 mph. 46 to 49°F.", "wind and the temperature range", line(r, "wind"));
  ok(/^Day off: shoulder to shoulder squid crowds in November\./.test(line(r, "expect")), "expect: a day off evening on a pier its card says gets packed", line(r, "expect"));
  ok(/After 8 PM, add only enough weight to hang straight down\.$/.test(line(r, "expect")), "and the gear that matters once tonight's current runs (the squid rig card)", line(r, "expect"));
  ok(line(r, "or") === "Redondo: same tide and weather, 10 min closer. Pick: Les Davis, for the rain cover.",
    "or: what is the same, what differs, and a pick with its reason", line(r, "or"));
  ok(r.pick && r.pick.planId === "squid-les-davis" && r.pick.why === "for the rain cover", "the pick is the pier with a roof while it drizzles", r.pick);
  ok(r.fig && r.fig.best && Math.abs(r.fig.best[0] - 16.95) < 0.01 && r.fig.tide.some((x) => x.h > 24) && r.fig.rain.length === 5 && r.fig.rain[0].pop === 35,
    "the picture gets the hours, the turns past midnight and the chance of rain by the hour", r.fig && { best: r.fig.best, rain: r.fig.rain.length });

  const rr = T.read({ planId: "squid-redondo", iso: NIGHT, wx, tides: TIDES, others: ["squid-les-davis"] });
  ok(rr.headline === "Go, best 5:00 to 8:00 PM" && rr.reason === "High slack 5:31 PM, right at dark.", "Redondo's read, from its own station", rr.headline + " | " + rr.reason);
  ok(/^Day off: a crowded rail on good nights\./.test(line(rr, "expect")), "its crowd line is its own run card's", line(rr, "expect"));
  ok(line(rr, "or") === "Les Davis: same tide and weather, 10 min farther, a rain cover. Pick: Les Davis, for the rain cover.",
    "and it picks the same pier, for the same reason", line(rr, "or"));

  // All four squid piers: each read names two others at most, the pick among them, and every read picks the same one.
  const all = ["squid-les-davis", "squid-redondo", "squid-des-moines", "squid-point-defiance"].map((id) => T.read({ planId: id, iso: NIGHT, wx, tides: TIDES }));
  ok(all.every((x) => x.pick && x.pick.planId === "squid-les-davis"), "with no list given, every squid pier's read picks the same one", all.map((x) => x.pick && x.pick.planId));
  ok(all.every((x) => (line(x, "or").match(/\. [A-Z][\w ]+: /g) || []).length <= 2), "and names two others at most", all.map((x) => line(x, "or")));
  ok(/Des Moines: same, 5 min closer, bring your own light\./.test(line(all[0], "or")), "a pier where you bring your own light says so", line(all[0], "or"));
  ok(/Point Defiance: [^.]*park hours at night not confirmed/.test(line(all[2], "or")) || !/Point Defiance/.test(line(all[2], "or")),
    "a pier whose night hours are not known says so, never guesses", line(all[2], "or"));

  // A dry night: no roof needed, so the closer pier.
  const dry = tonight({}, {});
  const d = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: dry, tides: TIDES, others: ["squid-redondo"] });
  ok(line(d, "rain") === "Dry.", "a dry night says Dry", line(d, "rain"));
  ok(line(d, "or") === "Redondo: same tide and weather, 10 min closer. Pick: Redondo, 10 min closer.", "and picks the closer pier", line(d, "or"));

  // Now raining lightly, before the trip.
  const now = T.read({ planId: "squid-les-davis", iso: NIGHT, wx: tonight({ ...POP, 14: 70 }, { ...AMT, 14: 0.02 }), tides: TIDES, others: [], nowHour: 14.5 });
  ok(line(now, "rain") === "Light rain now. 35% at 5 PM, 13% at 6, done by 7.", "light rain now, then the evening", line(now, "rain"));
  ok(!line(now, "or"), "no others, no Or line");
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
  ok(line(r, "wind") === "Strong, 28 mph, gusts 42. 45°F.", "the wind line shows it", line(r, "wind"));
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
  ok(r.headline === "Go, 4:57 to 10:00 PM" && !r.reason, "and with no slack to time it, the whole window, no reason made up", r.headline + " | " + r.reason);
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
  ok(line(r, "rain") === "Dry until 1 PM, then up to 60%.", "rain: when it starts", line(r, "rain"));
  ok(line(r, "wind") === "Light, 6 mph. 44 to 47°F.", "wind and temperature", line(r, "wind"));
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
  ok(line(r, "expect") === "Crowds near the hatchery on weekends.", "a Saturday at the hatchery: its run card's crowd line", line(r, "expect"));
  ok(line(r, "or") === "Cowlitz River: same weather, good flow, 9,100 cfs, steady, 30 min farther. Pick: Tokul Creek, 30 min closer.",
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
  ok(line(r, "rain") === "Dry." && line(r, "wind") === "Almost none, 3 mph. 41°F.", "rain and wind", line(r, "rain") + " | " + line(r, "wind"));
  const f = T.read({ planId: "trout-fenwick", iso: SAT, wx, tides: {} });
  ok(f.status === "ok" && /Testing Lake: [^.]*\./.test(line(f, "or")), "Fenwick's read names the stocked lake nearby", line(f, "or"));
  ok(/Pick: Testing Lake/.test(line(f, "or")), "and picks it: the plant beats a lake with none", line(f, "or"));
  T.addWaters({ at: 2, waters: [] });
}

// ---- every fact the read compares by is on its spot card ------------------------
{
  const F = T.readFacts;
  const card = (id) => JSON.stringify(CARDS[id] || {});
  ok(/Rain cover/.test(card("les-davis")) && F["les-davis"].cover, "Les Davis's rain cover is on its card (WDFW)");
  ok(/shoulder-to-shoulder squid crowds in November/.test(card("les-davis")), "and its November crowd");
  ok(/Tall single-arm lamp posts along the pier/.test(card("redondo")) && F.redondo.lamps === "pier" && !F.redondo.cover, "Redondo: lamp posts on its card, and no roof claimed");
  ok(/Busy night squid pier, October to December/.test(card("redondo")), "and its busy season");
  ok(/anglers bring their own lights/.test(card("des-moines-pier")) && F["des-moines-pier"].lamps === "own", "Des Moines: bring your own light, from its card");
  ok(Object.keys(F).every((id) => T.spots.some((s) => s.id === id)), "every fact belongs to a spot the app has");
}

// ---- words ----------------------------------------------------------------------
{
  const wx = tonight();
  const texts = [];
  for (const p of T.plans) for (const iso of [NIGHT, "2026-11-28"]) {
    const r = T.read({ planId: p.id, iso, wx, tides: TIDES, flow: {} });
    texts.push(words(r));
  }
  const bad = texts.filter((x) => /—|undefined|NaN|null|\[object/.test(x));
  ok(bad.length === 0, "no em dashes, no undefined, NaN or null in any read", bad.slice(0, 3));
  ok(texts.every((x) => !/  /.test(x)), "no double spaces", texts.filter((x) => /  /.test(x)).slice(0, 2));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
