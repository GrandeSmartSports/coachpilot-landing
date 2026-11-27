// The Puyallup in the real page. Run: node tests/rigs-puyallup.smoke.mjs
//
// A September 2026 week with the weather, the tides and the rivers faked,
// and NOAA's PUYW1 answering the way it really does: stage first (ft), flow
// second (kcfs). What this guards: the Puyallup is on Hot Trips only on the
// days it is open (Wednesday to Saturday until Sept 30), never at Orting;
// the flow is read from the flow series, not the stage; a Sumner run card
// stands under Sumner's own painting, says to cast into the Puyallup and
// never into the White, parks at the State Street Trailhead, and calls its
// river numbers starting numbers; the Go deeper links land on real cards;
// and Orting's own page says plainly that salmon is closed there, with its
// trout rules a tap away. Nothing here reaches a real server.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8824;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 500)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 120000);
watchdog.unref?.();

const pad = (n) => String(n).padStart(2, "0");
const NOW = new Date("2026-09-14T12:00:00-07:00"); // a Monday, noon
const DAYS = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"];
const CORS = { "access-control-allow-origin": "*" };
const json = (r, body) => r.fulfill({ status: 200, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
// Calm and dry all week, September's sun. The 128th St E bridge gets a breeze
// (12 mph), so Sumner is the Puyallup trip this week.
function wxPoint(lat) {
  const time = [], t = [], p = [], w = [], g = [], c = [], breezy = Math.abs(lat - 47.1402) < 0.001;
  for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); t.push(58); p.push(0); c.push(70); w.push(breezy ? 12 : 4); g.push(breezy ? 16 : 8); }
  return { hourly: { time, temperature_2m: t, precipitation: p, wind_speed_10m: w, wind_gusts_10m: g, cloud_cover: c },
    daily: { time: DAYS, sunrise: DAYS.map((d) => `${d}T06:48`), sunset: DAYS.map((d) => `${d}T19:20`) } };
}
const tides = { predictions: DAYS.flatMap((d) => [{ t: `${d} 04:30`, v: "11.0", type: "H" }, { t: `${d} 11:00`, v: "2.0", type: "L" },
  { t: `${d} 17:15`, v: "12.0", type: "H" }, { t: `${d} 21:00`, v: "-0.5", type: "L" }]) };
// PUYW1 as NOAA sends it: stage 9.9 ft first, flow 1.2 kcfs second. Read the
// old way, 9.9 would be 9,900 cfs and a no-go.
const STAGE_FIRST = { primaryName: "Stage", primaryUnits: "ft", secondaryName: "Flow", secondaryUnits: "kcfs" };
const puyw1 = { observed: Object.assign({ data: [{ validTime: "2026-09-14T18:00:00Z", primary: 9.9, secondary: 1.2 }] }, STAGE_FIRST),
  forecast: Object.assign({ data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 9.9, secondary: 1.2 })) }, STAGE_FIRST) };
const other = { observed: { primaryName: "River Discharge", primaryUnits: "kcfs", secondaryName: "Stage", secondaryUnits: "ft", data: [{ validTime: "2026-09-14T18:00:00Z", primary: 0.41, secondary: 50 }] },
  forecast: { primaryName: "River Discharge", primaryUnits: "kcfs", secondaryName: "Stage", secondaryUnits: "ft", data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4, secondary: 50 })) } };
async function fake(ctx) {
  const asked = [];
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => json(r, { checked: NOW.toISOString(), rules: [] }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => { const u = r.request().url(); asked.push(u); return json(r, /PUYW1/.test(u) ? puyw1 : other); });
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    const u = route.request().url(), lats = (new URL(u).searchParams.get("latitude") || "").split(",").map(Number);
    if (/marine-api/.test(u)) return json(route, lats.map(() => ({ hourly: { time: DAYS.flatMap((d) => Array.from({ length: 24 }, (_, h) => `${d}T${pad(h)}:00`)), wave_height: DAYS.flatMap(() => Array(24).fill(4)) } })));
    return json(route, /open-meteo/.test(u) ? lats.map(wxPoint) : tides);
  });
  return asked;
}

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
const T = (iso, plan, sec) => "#/trips/" + encodeURIComponent(iso + "~" + plan) + (sec ? "/" + sec : "");
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  const asked = await fake(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = "#/learn"; location.hash = h; }, hash); await page.waitForSelector(sel); await page.waitForTimeout(60); };
  const wide = () => page.evaluate(() => document.documentElement.scrollWidth);

  // ---- Hot Trips: open days only ----------------------------------------------------------
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector("[data-day] [data-hot] .tile svg");
  ok(asked.filter((u) => /PUYW1/.test(u)).length === 1, "one PUYW1 call for both Puyallup spots", asked.join(" | "));
  const byDay = await page.evaluate(() => [...document.querySelectorAll("[data-day]")].map((d) => [d.dataset.day, [...d.querySelectorAll("[data-hot]")].map((r) => r.dataset.hot).filter((id) => /puyallup/.test(id))]));
  ok(byDay.map(([, ids]) => ids.length > 0).join() === "false,false,true,true,true,true,false", "Puyallup rows Wednesday to Saturday, none on Sunday, Monday or Tuesday", byDay);
  ok(byDay.every(([, ids]) => ids.every((id) => id === "coho-puyallup-sumner")), "mid September is coho, and this week Sumner's", byDay);
  ok(!(await page.evaluate(() => [...document.querySelectorAll("[data-hot]")].some((r) => /orting/.test(r.dataset.hot)))), "no trip at Orting");
  const row = await page.evaluate(() => { const r = document.querySelector('[data-day="2026-09-16"] [data-hot="coho-puyallup-sumner"]'), t = r && r.querySelector(".tile");
    return r ? { kind: t.dataset.mini, kids: t.querySelectorAll("svg *").length, text: r.innerText.replace(/\s+/g, " ") } : null; });
  ok(row && row.kind === "river" && row.kids > 20 && /Coho on the Puyallup at Sumner/.test(row.text) && /After work/.test(row.text), "the Wednesday row: Sumner's river thumbnail, the name, after work", row);
  ok(await wide() <= 390, "Hot Trips fits the phone");

  // ---- the Sumner run card ----------------------------------------------------------------
  await go(T("2026-09-16", "coho-puyallup-sumner"), '[data-view="hot"][data-run="coho-puyallup-sumner"] [data-sec-row="plan"]');
  const sc = await page.evaluate(() => { const s = document.getElementById("scene"); return { kind: s.getAttribute("data-scene"), spot: s.dataset.spot || "", kids: s.querySelectorAll("svg *").length, glacial: /var\(--hz\) 68%/.test(s.innerHTML) }; });
  ok(sc.kind === "river" && sc.spot === "puyallup-sumner" && sc.kids > 100 && sc.glacial, "the run card stands under Sumner's own painting, its glacial water", sc);
  const secs = await page.locator("[data-sec-row]").evaluateAll((els) => els.map((e) => e.dataset.secRow));
  ok(secs.join(",") === "plan,gear,river,what,bait,how,wx,spot,expect,rules", "the Green's sections: the plan, gear and river as pictures, then what, bait, how, weather, the spot, what to expect, rules", secs.join(","));
  const riverTile = (await page.locator('[data-sec-row="river"]').innerText()).replace(/\s+/g, " ");
  ok(/Go: 1,200 cfs/.test(riverTile) && /fishable to 1,800/.test(riverTile), "the river tile reads the flow, not the stage: go at 1,200 cfs, fishable to 1,800", riverTile);
  ok((await page.locator('[data-sec-row="rules"] .tx > span').innerText()).trim() === "6 salmon a day, no more than 2 adults", "the rules row leads with the limit", await page.locator('[data-sec-row="rules"] .tx > span').innerText());
  ok(/Leave by/.test(await page.locator('[data-sec-row="plan"]').innerText()) && /14 min drive/.test(await page.locator('[data-sec-row="plan"]').innerText()), "the plan says when to leave and the drive");
  ok(await wide() <= 390, "the run card fits the phone");
  // Each row says one thing, whole, on a line or two, at 390 and 360 px.
  for (const w of [390, 360]) {
    await page.setViewportSize({ width: w, height: 844 });
    await go(T("2026-09-16", "coho-puyallup-sumner"), '[data-view="hot"] [data-sec-row="plan"]');
    const cut = await page.evaluate(() => [...document.querySelectorAll('[data-view="hot"] .row .tx > span, [data-view="hot"] .rule .tx > span')]
      .filter((e) => /…$|\.\.\.$/.test(e.textContent) || e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().height > 44).map((e) => e.textContent));
    const lines = await page.locator('[data-view="hot"] > .list [data-sec-row] .tx > span').allInnerTexts();
    ok(!cut.length && lines.length === 6 && lines.every((x) => x.trim().length > 8), "at " + w + " px the run card's rows are whole lines, none cut", cut.length ? cut : lines);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  await go(T("2026-09-16", "coho-puyallup-sumner", "spot"), '[data-view="card"] [data-card="spot"]');
  const spot = await page.locator(".card").innerText();
  ok(/Stand on the point and cast into the Puyallup\. Never cast into the White behind you: it is closed to salmon\./.test(spot), "the spot: stand on the point, cast into the Puyallup, never into the White behind you", spot.slice(0, 400));
  ok(/State Street Trailhead, 13114 63rd St E/.test(spot), "and park at the State Street Trailhead", spot.slice(0, 600));
  await go(T("2026-09-16", "coho-puyallup-sumner", "river"), '[data-view="card"] [data-card="river"]');
  const riv = await page.locator(".card").innerText();
  ok(/Up to 1,800 cfs: fishable/.test(riv) && /Over 3,500 cfs: blown out, no trip/.test(riv) && /Right now: 1,200 cfs/.test(riv), "the river card: fishable to 1,800, no trip over 3,500, the live flow", riv.slice(0, 500));
  ok(/Starting numbers for Puyallup River at Puyallup\. They get tuned after real trips\./.test(riv) && !/Guide numbers/.test(riv) && !/percentile|years of/i.test(riv),
    "and calls them starting numbers, without saying where they came from", riv.slice(0, 600));
  await go(T("2026-09-16", "coho-puyallup-sumner", "rules"), '[data-view="card"] [data-card="rules"]');
  const rules = await page.locator(".card").innerText();
  ok(/The White River behind you is closed to salmon/.test(rules) && /Closed Sundays, Mondays and Tuesdays until Sept 30/.test(rules) && /buoyant lure with no weight added to the line or lure/.test(rules) &&
    /Release chum and wild Chinook/.test(rules) && /Night closure/.test(rules), "the rules card: the White, the closed days, the limit and releases, anti-snagging with its exception, night closure", rules.slice(0, 900));

  // Go deeper lands on the Puyallup's own cards.
  await go(T("2026-09-16", "coho-puyallup-sumner"), '[data-view="hot"] [data-more]');
  const more = await page.locator("[data-more] a.row").evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  ok(more.length === 6 && more.every((h) => /^#\/coho\/puyallup-sumner\//.test(h)), "Go deeper: six rows, all on the Puyallup at Sumner", more);
  await page.locator('[data-more] a.row[href$="/puyallup-rules"]').click();
  await page.waitForSelector('[data-view="card"] [data-card="puyallup-rules"]');
  const pr = await page.locator(".card").innerText();
  ok(/Aug 19 to Oct 31, 2026/.test(pr) && /closed to salmon/i.test(pr), "the Puyallup rules card opens", pr.slice(0, 300));

  // A Sunday in September is not a trip, even asked for by its address.
  await page.evaluate(() => { location.hash = "#/learn"; location.hash = "#/trips/" + encodeURIComponent("2026-09-20~coho-puyallup-sumner"); });
  await page.waitForFunction(() => /^#\/trips\/?$/.test(location.hash));
  ok(true, "a Sunday's Puyallup address goes back to the week");

  // ---- the Water tab and Orting -----------------------------------------------------------
  await go("#/water/river", '[data-view="water"] [data-spot="puyallup-orting"]');
  const list = await page.evaluate(() => [...document.querySelectorAll('[data-view="water"] [data-spot]')].map((r) => [r.dataset.spot, r.innerText.replace(/\s+/g, " ")]));
  ok(list.map((x) => x[0]).join() === "green-river,puyallup-sumner,puyallup-128th,puyallup-orting", "River lists the Green and the three Puyallup spots", list);
  ok(/Trout and game fish\. No salmon/.test(list[3][1]) && /King, Coho, Pink/.test(list[1][1]), "Orting's row says trout and no salmon; Sumner's names its salmon", list);
  await go("#/spot/puyallup-orting", '[data-view="spot"] [data-spot-closed]');
  const ort = await page.evaluate(() => { const s = document.getElementById("scene"), c = document.querySelector("[data-spot-closed]");
    return { spot: s.dataset.spot || "", kids: s.querySelectorAll("svg *").length, closed: c.innerText.replace(/\s+/g, " "), red: getComputedStyle(c, "::before").backgroundColor,
      rows: [...document.querySelectorAll('[data-view="spot"] [data-row]')].map((r) => r.dataset.row), title: document.querySelector(".hero h1").textContent }; });
  ok(ort.spot === "puyallup-orting" && ort.kids > 100 && ort.title === "Puyallup at Orting", "Orting's page stands under Orting's own painting", ort);
  ok(/No salmon here/.test(ort.closed) && /Salmon is closed above the Carbon River, all year\./.test(ort.closed), "and says plainly: no salmon here, closed above the Carbon, all year", ort.closed);
  ok(ort.rows.join() === "orting-rules,orting-spot", "its rows: what is open, and the park", ort.rows);
  await page.locator('[data-view="spot"] [data-row="orting-rules"]').click();
  await page.waitForSelector('[data-view="card"] [data-card="orting-rules"]');
  const orules = await page.locator(".card").innerText();
  ok(/Saturday before Memorial Day to Jan 15/.test(orules) && /selective gear rules/i.test(orules) && /Release cutthroat and wild rainbow trout/.test(orules) && /no salmon/i.test(orules) && /No bait/.test(orules),
    "Orting's rules: trout and game fish from the Saturday before Memorial Day to Jan 15, selective gear, release cutthroat and wild rainbow, no salmon", orules.slice(0, 700));
  ok(/#\/spot\/puyallup-orting\/orting-rules$/.test(page.url()) && await page.locator('.pnb.next[data-step="orting-spot"]').count() === 1, "its card has its own address and walks on to the park");
  ok(await wide() <= 390, "Orting's card fits the phone");
  // It goes in a trip like any card, and Field mode shows it with no signal.
  await page.locator('[data-addtrip="orting-rules"]').click();
  await page.locator("[data-mode-field]").first().click();
  await page.waitForSelector('.fieldmode [data-card="orting-rules"]');
  ok(/Saturday before Memorial Day to Jan 15/.test(await page.locator('.fieldmode [data-card="orting-rules"]').innerText()), "Orting's rules go in a trip and show in Field mode");
  await page.locator("[data-mode-library]").click();
  await go("#/spot/puyallup-orting/orting-rules", '[data-view="card"] [data-card="orting-rules"]');
  await page.locator('[data-addtrip="orting-rules"]').click();
  ok(await page.locator(".tripbar").count() === 0, "and comes back out of it");
  await go("#/coho/puyallup-sumner", '[data-view="species"] [data-row="puyallup-rules"]');
  ok(await page.locator('[data-view="species"] [data-row="puyallup-sumner-spot"]').count() === 1 && await page.locator('[data-view="species"] [data-row="green-river-rules"]').count() === 0,
    "coho at Sumner: the Puyallup's rules and the point, not the Green's rules");

  ok(errors.length === 0, "no page errors", errors.join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  await server.close?.();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
