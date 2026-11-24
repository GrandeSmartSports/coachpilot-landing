// Hot Trips map: pins from the same plan as the list. APIs faked, tiles
// blocked, so nothing here touches the network. Run: node tests/rigs-map.smoke.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8794;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 60000);
watchdog.unref?.();

const pad = (n) => String(n).padStart(2, "0");
const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
function wxPoint(windy) {
  const time = [], t = [], p = [], w = [], g = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) {
    time.push(`${d}T${pad(h)}:00`); t.push(45); p.push(0);
    const bad = windy && d === "2026-11-25";
    w.push(bad ? 28 : 4); g.push(bad ? 42 : 8);
  }
  return { hourly: { time, temperature_2m: t, precipitation: p, wind_speed_10m: w, wind_gusts_10m: g },
    daily: { time: DAYS, sunrise: DAYS.map((d) => `${d}T07:31`), sunset: DAYS.map((d) => `${d}T16:24`) } };
}
function marine() {
  const time = [], wave = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); wave.push(4); }
  return { hourly: { time, wave_height: wave } };
}
const tides = { predictions: DAYS.flatMap((d) => [
  { t: `${d} 04:30`, v: "11.0", type: "H" }, { t: `${d} 11:00`, v: "2.0", type: "L" },
  { t: `${d} 17:15`, v: "12.0", type: "H" }, { t: `${d} 21:00`, v: "-0.5", type: "L" }]) };

async function fake(ctx, { down = false } = {}) {
  let calls = 0;
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ checked: new Date().toISOString(), rules: [] }) }));
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    calls++;
    if (down) return route.abort();
    const u = route.request().url();
    const n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
    const body = /marine-api/.test(u) ? Array.from({ length: n }, marine)
      : /open-meteo/.test(u) ? Array.from({ length: n }, () => wxPoint(true)) : tides;
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  return () => calls;
}

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
  await fake(ctx);
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-23T12:00:00-08:00"));
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;

  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector("[data-day]");
  const modes = await page.locator(".top .jump [data-tmode]").evaluateAll((els) => els.map((e) => e.dataset.tmode + ":" + e.getAttribute("aria-current")));
  ok(modes.join(",") === "list:true,map:false", "Trips has List and Map, List lit", modes.join(","));
  await page.locator('.top [data-tmode="map"]').click();
  await page.waitForSelector(".leaflet-marker-icon.mk");
  ok(/#\/trips\/map$/.test(page.url()), "Map has its own address", page.url());
  const covered = await page.locator("[data-pin]").evaluateAll((els) => els.flatMap((e) => e.dataset.pin.split(" ")));
  const nSpots = await page.evaluate(() => window.RIG.trips.spots.length);
  ok(covered.length === nSpots && new Set(covered).size === nSpots, "every spot is on the map, alone or in a group", covered.join(","));
  ok(await page.locator('[data-pin~="redondo"].hot').count() === 1, "Redondo is Hot this week");
  const overlap = await page.evaluate(() => {
    const r = [...document.querySelectorAll("[data-pin] i")].map((e) => e.getBoundingClientRect());
    for (let i = 0; i < r.length; i++) for (let j = i + 1; j < r.length; j++)
      if (r[i].left < r[j].right && r[j].left < r[i].right && r[i].top < r[j].bottom && r[j].top < r[i].bottom) return true;
    return false;
  });
  ok(!overlap, "no two pins sit on top of each other");
  ok(await page.locator(".leaflet-marker-icon.mk.home").count() === 1, "home is on the map");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, "the map fits the phone", wide);
  const h = await page.evaluate(() => document.getElementById("tripmap").getBoundingClientRect().height);
  ok(h >= 380, "the map is big enough to use", h);

  await page.locator('[data-mapday="2026-11-24"]').click();
  await page.waitForFunction(() => document.querySelector('[data-mapday="2026-11-24"]')?.getAttribute("aria-current") === "true");
  await page.waitForSelector('[data-pin~="ocean-shores"]');
  ok(await page.locator('[data-pin~="ocean-shores"].dim').count() === 1, "a Tuesday night has no coast trip, so the coast is dimmed");
  await page.locator('[data-mapday="2026-11-26"]').click();
  await page.waitForFunction(() => document.querySelector('[data-mapday="2026-11-26"]')?.getAttribute("aria-current") === "true");
  await page.waitForSelector('[data-pin~="ocean-shores"]');
  ok(await page.locator('[data-pin~="ocean-shores"]:not(.dim)').count() === 1, "Thanksgiving lights up the razor clam dig");

  // Redondo may sit inside a group (Des Moines pier is 3 miles away). Each
  // tap on a group zooms in to its spots; a few taps always split it.
  let taps = 0;
  while (await page.locator('[data-pin="redondo"]').count() === 0 && taps < 5) {
    await page.locator('[data-pin~="redondo"] i').click(); taps++;
    await page.waitForTimeout(700);
  }
  ok(await page.locator('[data-pin="redondo"]').count() === 1, "tapping groups zooms in until Redondo stands alone", taps);
  await page.locator('[data-pin="redondo"] i').click();
  await page.waitForSelector('.leaflet-popup [data-pin-trip="squid-redondo"]');
  ok(/35 min drive/.test(await page.locator(".leaflet-popup").innerText()), "the pin says the drive");
  await page.locator('.leaflet-popup [data-pin-trip="squid-redondo"]').click();
  await page.waitForSelector('[data-view="hot"][data-run="squid-redondo"]');
  ok(true, "a pin opens the run card");
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // No map library (no signal, never cached): say so, do not go blank.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fake(ctx2);
  await ctx2.route(/vendor\/leaflet\.js/, (r) => r.abort());
  const p2 = await ctx2.newPage();
  await p2.goto(base + "#/trips/map", { waitUntil: "load" });
  await p2.waitForFunction(() => /needs a signal/.test(document.getElementById("tripmap")?.innerText || ""));
  ok(true, "with no map library the map says it needs a signal");
} catch (e) {
  fail++; console.log("FAIL threw", e.message);
} finally {
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
