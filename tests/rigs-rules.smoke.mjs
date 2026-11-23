// WDFW rule flags on load: a new Area 11 squid rule must flag the trip, the
// run card and the library card, and "Got it" must clear it. No signal must
// say the rules are not updated. Run: node tests/rigs-rules.smoke.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8795;
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

const RULE = { link: "https://wdfw.wa.gov/fishing/regulations/emergency-rules/test-squid", title: "Squid limit cut in Marine Area 11",
  published: "2026-11-24T18:00:00Z", effective: "Nov. 25, 2026, until further notice", body: "Marine Area 11: squid daily limit 5 quarts." };
async function rules(ctx, mode) {
  await ctx.route(/castai-rules/, (r) => mode === "down" ? r.abort()
    : r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ checked: "2026-11-23T20:00:00Z", rules: mode === "new" ? [RULE] : [] }) }));
}

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const base = `http://127.0.0.1:${PORT}/rigs/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
  await fake(ctx); await rules(ctx, "new");
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date("2026-11-23T12:00:00-08:00"));
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(base, { waitUntil: "load" });
  await page.waitForSelector('[data-day="2026-11-24"] [data-hot="squid-redondo"]');
  await page.waitForSelector('[data-hot="squid-redondo"] [data-rule-badge]:not([hidden])');
  ok(true, "the squid trip shows New rule after the background check");
  ok(await page.locator('[data-hot="trout-fenwick"] [data-rule-badge]:not([hidden])').count() === 0, "trips the rule does not touch stay clean");
  ok(await page.locator('[data-rules-state="fresh"]').count() === 1, "the list says when the rules were checked");

  await page.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').click();
  await page.waitForSelector('[data-view="hot"] [data-newrule]');
  const box = await page.locator("[data-newrule]").first().innerText();
  ok(/Squid limit cut in Marine Area 11/.test(box) && /Read it on WDFW/.test(box), "the run card shows the rule with a link", box.slice(0, 200));

  await page.goto(base + "#/squid/redondo/squid-regs", { waitUntil: "load" });
  await page.waitForSelector('[data-view="card"] [data-newrule]');
  ok(true, "the library rules card carries the banner too");
  await page.locator("[data-ack]").first().click();
  await page.waitForFunction(() => !document.querySelector("[data-newrule]"));
  ok(true, "Got it clears the banner");
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector('[data-hot="squid-redondo"]');
  await page.waitForTimeout(300);
  ok(await page.locator('[data-rule-badge]:not([hidden])').count() === 0, "and the New rule badge with it");
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // A day old, then no signal: say the rules are not updated.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fake(ctx2); await rules(ctx2, "down");
  await ctx2.addInitScript(() => localStorage.setItem("rig.rules.v1", JSON.stringify({ at: Date.now() - 30 * 3600e3, checked: null, rules: [] })));
  const p2 = await ctx2.newPage();
  await p2.goto(base + "#/trips", { waitUntil: "load" });
  await p2.waitForSelector('[data-rules-state="stale"]');
  ok(/Last checked/.test(await p2.locator('[data-rules-state="stale"]').innerText()), "an old check with no signal says when it last checked");

  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await fake(ctx3); await rules(ctx3, "down");
  const p3 = await ctx3.newPage();
  await p3.goto(base + "#/trips", { waitUntil: "load" });
  await p3.waitForSelector('[data-rules-state="never"]');
  ok(true, "never checked says so");
} catch (e) {
  fail++; console.log("FAIL threw", e.message);
} finally {
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
