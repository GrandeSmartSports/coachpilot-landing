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
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ checked: new Date().toISOString(), rules: [] }) }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => down ? r.abort() : r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ observed: { data: [{ validTime: "2026-11-23T19:00:00Z", primary: 0.41 }] },
      forecast: { data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }) }));
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
  const tue = await page.locator('[data-day="2026-11-24"]').innerText();
  ok(/No daylight after work/i.test(tue) && /Waiting for the weekend/i.test(tue),
    "a weeknight that still has a night trip says why the daylight trips are not on it", tue.replace(/\n+/g, " | ").slice(0, 200));
  ok(await page.locator('[data-day="2026-11-26"] [data-hot="clams-ocean-shores"]').count() === 1, "Thanksgiving: the razor clam dig");
  ok(/Lake Tapps/.test(await page.locator("[data-notlisted]").innerText()), "a held trip (Lake Tapps, ramp closed) is named, not hidden");
  ok(/Forecast from/.test(await page.locator("[data-asof]").innerText()), "the forecast says how old it is");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, "nothing runs off the side at phone width", wide);
  const firstScreen = await page.evaluate(() => [...document.querySelectorAll("[data-day] h2")].filter((h) => h.getBoundingClientRect().top < 844).length);
  ok(firstScreen >= 2, "screen one shows at least two days", firstScreen);

  await page.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').click();
  await page.waitForSelector('[data-view="hot"][data-run="squid-redondo"]');
  const head = await page.locator('[data-view="hot"] .shead').innerText();
  ok(/35 min drive/.test(head), "the run card says the drive", head);
  const secs = await page.locator("[data-sec-row]").evaluateAll((els) => els.map((e) => e.dataset.secRow));
  ok(secs.join(",") === "plan,what,gear,bait,how,wx,spot,expect,rules", "run card headlines: plan, what, gear, bait, how, weather, spot, expect, rules", secs.join(","));
  ok(/Leave by 4:10 PM/.test(await page.locator('[data-sec-row="plan"]').innerText()), "the plan headline says when to leave");
  const words = await page.evaluate(() => document.querySelector('[data-view="hot"]').innerText.split(/\s+/).length);
  ok(words < 340, "the run card overview is headlines, not an essay", words);

  await page.locator('[data-sec-row="plan"]').click();
  await page.waitForSelector('[data-view="card"][data-run="squid-redondo"]');
  const plan = await page.locator(".card").innerText();
  ok(/4:10 PM\s*Leave Bonney Lake/.test(plan) && /Full dark/.test(plan) && /Home/.test(plan), "the plan is a timeline from leaving home to getting back", plan.slice(0, 300));
  ok(/when you get there/i.test(plan) && /while you fish/i.test(plan), "the plan says what to do on arrival and while fishing");
  ok(await page.locator(".addtrip").count() === 0, "run card sections have no add-to-trip button");
  await page.locator(".pnb.next").click();
  await page.waitForSelector('[data-card="what"]');
  const whatTxt = await page.locator(".card").innerText();
  ok(/High slack 5:15 PM, right at dark/.test(whatTxt), "What it is says why this day", page.url() + " " + whatTxt.slice(0, 200));
  await page.locator(".pnb.next").click();
  await page.waitForSelector('[data-card="gear"]');
  const tags = await page.locator(".gear .tag").allInnerTexts();
  ok(tags.length >= 8 && tags.some((x) => /get/i.test(x)) && tags.some((x) => /have/i.test(x)), "gear is a checklist marked have, get, check", tags.join(","));
  for (const sec of ["bait", "how", "wx", "spot", "expect", "rules"]) {
    await page.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo") + "/" + sec, { waitUntil: "load" });
    await page.waitForSelector('[data-view="card"]');
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    ok(w <= 390, `run card ${sec} fits the phone`, w);
  }
  await page.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo") + "/wx", { waitUntil: "load" });
  ok(await page.locator(".hrs tr").count() >= 3, "weather is hour by hour for the window");
  await page.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"), { waitUntil: "load" });
  await page.locator("[data-more] a.row").first().click();
  await page.waitForSelector('[data-view="card"]');
  ok(/#\/squid\/redondo\/squid-watch-start$/.test(page.url()), "Go deeper opens the library cards", page.url());

  // River trips carry the river go or no-go.
  await page.goto(base + "#/trips/" + encodeURIComponent("2026-11-28~chum-green-river"), { waitUntil: "load" });
  await page.waitForSelector('[data-view="hot"][data-run="chum-green-river"]');
  const rsecs = await page.locator("[data-sec-row]").evaluateAll((els) => els.map((e) => e.dataset.secRow));
  ok(rsecs.includes("river") && rsecs.indexOf("river") === rsecs.indexOf("wx") + 1, "a river trip has a River flow section after the weather", rsecs.join(","));
  ok(/Go: 400 cfs/.test(await page.locator('[data-sec-row="river"]').innerText()), "the River headline says go and the flow");
  await page.locator('[data-sec-row="river"]').click();
  await page.waitForSelector('[data-card="river"]');
  const riv = await page.locator(".card").innerText();
  ok(/Right now: 410 cfs/.test(riv) && /Over 2,000 cfs: blown out/.test(riv), "the River card shows the live reading and the no-go line", riv.slice(0, 300));

  // Coming back uses the saved forecast, no new calls.
  const before = calls();
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector("[data-day]");
  ok(calls() === before, "a second open inside 3 hours reuses the saved forecast", `${before} -> ${calls()}`);
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // The screen is the sky: light in the day, dark at night, held when asked.
  {
    const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
    await fake(c4);
    const pg = await c4.newPage();
    await pg.clock.install({ time: new Date("2026-11-24T11:00:00-08:00") });
    await pg.goto(base, { waitUntil: "load" });
    await pg.waitForSelector("[data-day]");
    const bg = () => pg.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lum = (c) => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const day = await bg();
    ok(lum(day) > 150, "at 11 AM the screen is bright", day);
    ok(await pg.locator("[data-sky]").count() > 0 || await pg.evaluate(() => !!document.documentElement.dataset.sky), "the page says which sky it is using");
    await pg.locator("[data-skymode]").first().click();
    await pg.waitForTimeout(300);
    ok(/^light$/i.test((await pg.locator("[data-skylabel]").first().innerText()).trim()), "the first tap holds it light",
      await pg.locator("[data-skylabel]").first().innerText());
    await pg.locator("[data-skymode]").first().click();
    await pg.waitForTimeout(400);
    const held = await bg();
    ok(lum(held) < 60, "the next tap holds it dark for glare", held);
    await pg.reload({ waitUntil: "load" });
    await pg.waitForSelector("[data-day]");
    ok(lum(await bg()) < 60, "the choice sticks across opens", await bg());
    // The rig drawings stay on their own dark card whatever the sky is.
    await pg.goto(base + "#/squid/redondo/squid-rig", { waitUntil: "load" });
    await pg.waitForSelector(".dia");
    const diaDark = await pg.evaluate(() => { const [r, g, b] = getComputedStyle(document.querySelector(".dia")).backgroundColor.match(/\d+/g).map(Number); return 0.2126 * r + 0.7152 * g + 0.0722 * b; });
    ok(diaDark < 70, "the rig drawings keep their dark card", diaDark);
    await c4.close();
  }

  // Coming back to the app the next day must not show yesterday's screen.
  // The installed app is suspended, not reloaded, so it has to notice.
  {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
    await fake(c2);
    const pg = await c2.newPage();
    await pg.clock.install({ time: new Date("2026-11-23T20:00:00-08:00") });
    await pg.goto(base + "#/trips", { waitUntil: "load" });
    await pg.waitForSelector("[data-day]");
    const first = () => pg.locator("[data-day]").first().getAttribute("data-day");
    ok(await first() === "2026-11-23", "opens on today", await first());
    await pg.clock.setFixedTime(new Date("2026-11-24T07:00:00-08:00"));
    await pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await pg.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
    await pg.waitForFunction(() => document.querySelector("[data-day]")?.dataset.day === "2026-11-24", null, { timeout: 8000 }).catch(() => {});
    ok(await first() === "2026-11-24", "coming back the next day redraws on today, not yesterday", await first());
    await c2.close();
  }

  // One flaky weather call must not wipe the week. It gets one retry.
  {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
    await fake(c3);
    let wx = 0;
    await c3.route(/api\.open-meteo\.com\/v1\/forecast/, async (route) => {
      wx++;
      if (wx === 1) return route.fulfill({ status: 503, contentType: "text/plain", headers: { "access-control-allow-origin": "*" }, body: "busy" });
      return route.fallback();
    }, { times: 10 });
    const pg = await c3.newPage();
    await pg.clock.setFixedTime(new Date("2026-11-23T12:00:00-08:00"));
    await pg.goto(base + "#/trips", { waitUntil: "load" });
    await pg.waitForSelector("[data-day]", { timeout: 12000 }).catch(() => {});
    ok(await pg.locator("[data-day]").count() === 7, "a weather server hiccup retries instead of losing the week",
      (await pg.locator("[data-week]").innerText()).slice(0, 90));
    await c3.close();
  }

  // A forecast server that never answers: give up, say so, offer a retry.
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx3.addInitScript(() => { window.RIG = { fetchTimeout: 1500 }; });
  await ctx3.route(/castai-rules|api\.water\.noaa\.gov|marine-api|tidesandcurrents/, (r) => r.abort());
  await ctx3.route(/api\.open-meteo\.com/, () => { /* never answers */ });
  const p3 = await ctx3.newPage();
  await p3.goto(base + "#/trips", { waitUntil: "load" });
  const t0 = Date.now();
  await p3.waitForSelector("[data-quiet]", { timeout: 8000 }).catch(() => {});
  const hung = await p3.locator("[data-week]").innerText();
  ok(/No forecast yet/.test(hung) && Date.now() - t0 < 8000, "a server that never answers times out instead of loading forever", hung.slice(0, 120));
  ok(await p3.locator("[data-week] [data-refresh]").count() === 1, "the stuck screen has a Try again button");
  await ctx3.close();

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
