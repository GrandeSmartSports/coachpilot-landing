// Hot Trips in the real page, with the weather and tide APIs faked so the
// week is known. Run: node tests/rigs-hot.smoke.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8793;
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
  const calls = await fake(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-23T12:00:00-08:00"));
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;

  await page.goto(base, { waitUntil: "load" });
  const tabs = await page.locator(".top .tabs [data-tab]").allInnerTexts();
  ok(tabs[0].trim().toLowerCase() === "trips", "Trips is the first tab", tabs.join(","));
  await page.locator('.top [data-tab="trips"]').click();
  await page.waitForSelector('[data-view="trips"] [data-day]');
  ok(await page.locator("[data-day]").count() === 7, "seven days listed");
  ok(await page.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').count() === 1, "Tuesday after work: squid at Redondo");
  ok(/No fishing: gusts to 42 mph/.test(await page.locator('[data-day="2026-11-25"]').innerText()), "the 42 mph day says no fishing and why");
  ok(await page.locator('[data-day="2026-11-26"] [data-hot="clams-ocean-shores"]').count() === 1, "Thanksgiving: the razor clam dig");
  ok(/Green River/.test(await page.locator("[data-notlisted]").innerText()), "unconfirmed Green River rules are named, not hidden");
  ok(/Forecast from/.test(await page.locator("[data-asof]").innerText()), "the forecast says how old it is");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, "nothing runs off the side at phone width", wide);
  const firstScreen = await page.evaluate(() => [...document.querySelectorAll("[data-day] h2")].filter((h) => h.getBoundingClientRect().top < 844).length);
  ok(firstScreen >= 2, "screen one shows at least two days", firstScreen);

  await page.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').click();
  await page.waitForSelector('[data-view="hot"]');
  const detail = await page.locator('[data-view="hot"]').innerText();
  ok(/High slack 5:15 PM, right at dark/.test(detail), "the trip says why it is hot", detail.slice(0, 200));
  ok(/35 min drive/.test(detail), "the trip says the drive");
  await page.locator("[data-open-cards]").click();
  await page.waitForSelector('[data-view="species"]');
  ok(/#\/squid\/redondo$/.test(page.url()), "one tap opens the squid cards for that spot", page.url());

  // Coming back uses the saved forecast, no new calls.
  const before = calls();
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector("[data-day]");
  ok(calls() === before, "a second open inside 3 hours reuses the saved forecast", `${before} -> ${calls()}`);
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // No signal and nothing saved: say so plainly.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fake(ctx2, { down: true });
  const p2 = await ctx2.newPage();
  await p2.goto(base + "#/trips", { waitUntil: "load" });
  await p2.waitForSelector("[data-quiet]");
  await p2.waitForFunction(() => /No forecast yet/.test(document.querySelector("[data-week]").innerText));
  ok(true, "no signal and no saved forecast says so, no blank page");
} catch (e) {
  fail++; console.log("FAIL threw", e.message);
} finally {
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
