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
  ok(/Squid at Redondo/.test(head) && /Tue Nov 24/.test(head) && /After work/.test(head) && /hot/i.test(head), "the run card's head says the trip, the day, the slot and how good", head);
  const planCard = await page.locator('[data-view="hot"] [data-sec-row="plan"]').innerText();
  ok(/35 min drive/.test(planCard), "the run card says the drive", planCard);
  const secs = await page.locator("[data-sec-row]").evaluateAll((els) => els.map((e) => e.dataset.secRow));
  ok(secs.join(",") === "plan,gear,wx,what,bait,how,spot,expect,rules", "run card headlines: the plan, gear and weather as pictures, then what, bait, how, spot, expect, and rules last", secs.join(","));
  ok(await page.locator('[data-sec-row="gear"] .pips i').count() >= 8 && /to get/.test(await page.locator('[data-sec-row="gear"]').innerText()), "the gear tile counts what to get, a pip a thing");
  ok(await page.locator('[data-sec-row="wx"] svg.tide path').count() >= 2 && /High slack 5:15 PM/.test(await page.locator('[data-sec-row="wx"]').innerText()), "the weather tile draws the tide and names the slack",
    await page.locator('[data-sec-row="wx"]').innerText());
  ok(/10 pounds or 5 quarts/.test(await page.locator('[data-sec-row="rules"]').innerText()), "the rules row leads with the limit", await page.locator('[data-sec-row="rules"]').innerText());
  ok(/Leave by 4:10 PM/.test(await page.locator('[data-sec-row="plan"]').innerText()), "the plan headline says when to leave");
  // The read is the first card: the answer, why, a picture of the hours and
  // a few labelled lines, built from this trip's own tide and weather.
  const read = await page.evaluate(() => {
    const r = document.querySelector('[data-view="hot"] [data-read]'), hero = document.querySelector('[data-view="hot"] > .hero');
    let first = hero.nextElementSibling; while (first && !first.offsetHeight) first = first.nextElementSibling;
    return r ? { first: first === r, plan: r.nextElementSibling === document.querySelector('[data-sec-row="plan"]'), head: r.querySelector("[data-read-headline]").textContent,
      why: (r.querySelector("[data-read-reason]") || {}).textContent || "", fig: r.querySelectorAll("[data-read-fig] svg path").length,
      lines: [...r.querySelectorAll("[data-read-line]")].map((l) => l.querySelector("dt").textContent + ": " + l.querySelector("dd").textContent) } : null;
  });
  ok(read && read.first && read.plan, "the run card opens with the read, the plan right under it", read);
  ok(read && read.head === "Go, best 5:00 to 6:30 PM" && read.why === "High slack 5:15 PM, right at dark. Leave by 4:10 PM, 35 min drive.",
    "the read's first line is the answer, then why, and when to leave", read && read.head + " | " + read.why);
  ok(read && read.fig >= 2 && read.lines.length === 2 && read.lines[0] === "Rain: Dry." &&
    /^Or: Des Moines: same tide and weather, 5\smin farther, outlets at the end for your light\.\s*Pick: Redondo, the closest\.$/.test(read.lines[1]),
    "then the tide curve, the rain and the other squid piers with a pick; the tide and the wind are the tile's, what to expect is its row's", read && read.lines.join(" | "));
  const leaveSeen = await page.evaluate(() => { const b = document.querySelector('[data-sec-row="plan"] .planhead').getBoundingClientRect(); return { bottom: Math.round(b.bottom), h: innerHeight }; });
  ok(leaveSeen.bottom <= leaveSeen.h, "THE PLAN's Leave by is still on the first screen, under the read", leaveSeen);
  const words = await page.evaluate(() => { const v = document.querySelector('[data-view="hot"]'), r = v.querySelector("[data-read]"), n = (e) => e.innerText.split(/\s+/).length;
    return { rest: n(v) - (r ? n(r) : 0), read: r ? n(r) : 0 }; });
  ok(words.rest < 340 && words.read < 140, "the run card overview is headlines, not an essay, and so is its read", words);
  // Each headline row says one thing on one line, in whole words.
  const rowLines = await page.locator('[data-view="hot"] > .list [data-sec-row] .tx > span').allInnerTexts();
  ok(rowLines.join(" | ") === "Market squid under the pier lights after dark | Two squid jigs, 2.0 to 2.5, early in the season | Stand where you can drop straight down | Redondo Pier, Des Moines | A crowded rail on good nights",
    "the rows are one short line each: what, bait, how, the spot, what to expect", rowLines.join(" | "));
  ok((await page.locator('[data-sec-row="rules"] .tx > span').innerText()).trim() === "10 pounds or 5 quarts a day", "and the rules row is the limit, said short",
    await page.locator('[data-sec-row="rules"] .tx > span').innerText());
  // Signed out, the card's one gold button closes the card: in the page, after
  // the rules and before Go deeper, never pinned over the rows.
  const walk = await page.evaluate(() => {
    const g = document.querySelector('[data-view="hot"] [data-walk]'), rules = document.querySelector('[data-sec-row="rules"]'), more = document.querySelector("[data-more]");
    const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    let pinned = false;
    for (let e = g; e && e.id !== "app"; e = e.parentElement) if (/sticky|fixed/.test(getComputedStyle(e).position)) pinned = true;
    return { n: document.querySelectorAll('[data-view="hot"] .gold').length, href: g.getAttribute("href"), order: after(rules, g) && after(g, more), pinned };
  });
  ok(walk.n === 1 && /\/plan$/.test(walk.href) && walk.order && !walk.pinned, "one gold button, after the rules and before Go deeper, in the page and not pinned", JSON.stringify(walk));

  // "I can go": two time boxes on the read, the trip's own hours until
  // someone picks theirs. Picked, the read judges those hours, the plan under
  // it follows them, and they are saved on this phone for the next time.
  const winOf = () => page.evaluate(() => {
    const r = document.querySelector('[data-view="hot"] [data-read]'), w = r && r.querySelector("[data-read-win]");
    return w && { kind: w.dataset.readWin, from: w.querySelector("[data-win-from]").value, to: w.querySelector("[data-win-to]").value, best: !!w.querySelector("[data-win-reset]"),
      head: r.querySelector("[data-read-headline]").textContent, why: (r.querySelector("[data-read-reason]") || {}).textContent || "", grade: r.dataset.grade || "",
      leave: document.querySelector('[data-sec-row="plan"] .planhead b').textContent, saved: localStorage.getItem("rig.win.v1") };
  });
  const w0 = await winOf();
  // The card's head and its tide tile, before a window: the trip's own.
  const headOf = () => page.evaluate(() => ({ head: [...document.querySelector('[data-view="hot"] .shead .chips').children].filter((c) => !c.classList.contains("back")).map((c) => c.innerText).join(" ").replace(/\s+/g, " "),
    wx: document.querySelector('[data-sec-row="wx"]').innerText.replace(/\s+/g, " "), d: document.querySelector('[data-sec-row="wx"] svg.tide .t-line')?.getAttribute("d") || "" }));
  const h0 = await headOf();
  ok(/After work/.test(h0.head) && /hot/i.test(h0.head) && /High slack 5:15 PM/.test(h0.wx), "before a window: the head says the trip's slot and Hot, the tide tile its slack", h0);
  ok(w0 && w0.kind === "dark" && w0.from === "17:00" && w0.to === "20:30" && !w0.best && w0.head === read.head && !w0.saved,
    "the read has two I can go boxes, set to the trip's own hours, and no Best hours until a window is picked", w0);
  await page.locator('[data-view="hot"] [data-read] [data-win-from]').fill("20:00");
  await page.waitForFunction(() => /^8 to /.test(document.querySelector('[data-view="hot"] [data-read-headline]')?.textContent || ""));
  await page.locator('[data-view="hot"] [data-read] [data-win-to]').fill("00:00");
  await page.waitForFunction(() => /^8 to 12: /.test(document.querySelector('[data-view="hot"] [data-read-headline]')?.textContent || ""));
  const w1 = await winOf();
  ok(w1 && /^8 to 12: (good|fair, not great|tough)$/.test(w1.head) && /^(good|fair|tough)$/.test(w1.grade) && w1.from === "20:00" && w1.to === "00:00",
    "the boxes change the headline: it judges 8 PM to 12 AM", w1);
  ok(w1 && /Leave by 7:10 PM, 35\smin drive\.$/.test(w1.why) && w1.leave === "Leave by 7:10 PM", "and when to leave follows the window, in the read and in the plan", w1);
  ok(w1 && w1.best && JSON.parse(w1.saved || "{}").dark?.from === "20:00", "the window is saved on this phone, with a Best hours way back", w1 && w1.saved);
  // The head above the read says the window and its grade, never the trip's
  // slot and a Hot over "8 to 12: fair". The tide tile draws and names the
  // water in those hours: the 9 PM low, not the 5:15 PM slack before them.
  const h1 = await headOf();
  ok(/Tue Nov 24/.test(h1.head) && /8 PM to 12 AM/.test(h1.head) && !/After work/.test(h1.head) && !/hot/i.test(h1.head) && new RegExp("\\b" + w1.grade + "\\b", "i").test(h1.head),
    "the head follows the window: its hours and its grade", h1.head + " | " + (w1 && w1.grade));
  ok(!/5:15 PM/.test(h1.wx) && /Low tide 9:00 PM/.test(h1.wx) && h1.d && h1.d !== h0.d, "the tide tile draws and names the window's hours", h1.wx);
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector('[data-view="hot"][data-run="squid-redondo"] [data-read-win]');
  const w2 = await winOf();
  ok(w2 && w2.from === "20:00" && w2.to === "00:00" && w2.head === w1.head, "opened again, the saved window comes back, and the read with it", w2);
  await page.locator('[data-view="hot"] [data-win-reset]').click();
  await page.waitForFunction(() => /^Go, /.test(document.querySelector('[data-view="hot"] [data-read-headline]')?.textContent || ""));
  const w3 = await winOf();
  ok(w3 && w3.head === read.head && w3.from === "17:00" && !w3.best && !w3.saved && w3.leave === "Leave by 4:10 PM", "Best hours goes back to the trip's own hours and forgets the window", w3);
  const h3 = await headOf();
  ok(h3.head === h0.head && h3.wx === h0.wx, "and the head and the tide tile go back with it", h3);

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
  ok(rsecs.join(",") === "plan,gear,river,what,bait,how,wx,spot,expect,rules", "a river trip puts the river in the picture tile and keeps the weather as a row", rsecs.join(","));
  ok(await page.locator('[data-sec-row="river"] svg.flow path').count() >= 2, "the river tile draws the flow");
  ok(/Go: 400 cfs/.test(await page.locator('[data-sec-row="river"]').innerText()), "the River headline says go and the flow");
  await page.locator('[data-sec-row="river"]').click();
  await page.waitForSelector('[data-card="river"]');
  ok(await page.locator('.pnb.prev[data-step="wx"]').count() === 1, "walking the card, River flow comes after the weather");
  const riv = await page.locator(".card").innerText();
  ok(/Right now: 410 cfs/.test(riv) && /Over 2,000 cfs: blown out/.test(riv), "the River card shows the live reading and the no-go line", riv.slice(0, 300));

  // The gear tile only says "the rest you own" when there is a rest. The
  // razor clam dig has two things to get, four to check and nothing owned.
  await page.goto(base + "#/trips/" + encodeURIComponent("2026-11-26~clams-ocean-shores"), { waitUntil: "load" });
  await page.waitForSelector('[data-view="hot"][data-run="clams-ocean-shores"]');
  const clamGear = (await page.locator('[data-sec-row="gear"]').innerText()).replace(/\s+/g, " ");
  ok(/2 to get/.test(clamGear) && /4 to check/.test(clamGear) && !/you own/i.test(clamGear), "a trip with nothing owned does not say the rest is owned", clamGear);
  await page.locator('[data-sec-row="gear"]').click();
  await page.waitForSelector('[data-card="gear"]');
  // The gear card opens the way its tile does: the big count, then what else.
  const clamCard = (await page.locator(".card [data-gear-sum]").innerText()).replace(/\s+/g, " ").trim();
  ok(/^2 to get 4 to check\.$/.test(clamCard), "and neither does its gear card", clamCard);

  // With a card in the trip, the trip bar is the only thing pinned over a
  // run card: the gold button scrolls with the page.
  await page.goto(base + "#/squid/redondo/squid-rig", { waitUntil: "load" });
  await page.locator("[data-addtrip]").first().click();
  await page.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"), { waitUntil: "load" });
  await page.waitForSelector('[data-view="hot"][data-run="squid-redondo"]');
  await page.waitForSelector(".tripbar");
  const at = async (y) => {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(120);
    return page.evaluate(() => ({ gold: Math.round(document.querySelector("[data-walk]").getBoundingClientRect().top), bar: Math.round(document.querySelector(".tripbar").getBoundingClientRect().bottom), h: innerHeight }));
  };
  const y1 = await at(100), y2 = await at(300);
  ok(y1.gold - y2.gold === 200 && y1.bar === y2.bar && y2.bar <= y2.h && y2.bar > y2.h - 40, "the trip bar stays pinned and the gold button scrolls with the page, never pinned on top of it", JSON.stringify([y1, y2]));
  await page.locator("[data-mode-field]").click();
  await page.waitForSelector('[data-view="field"]');
  ok(await page.evaluate(() => document.getElementById("scene").getAttribute("data-scene")) === "pier", "field mode stands under the water its cards are for: a squid card, the pier",
    await page.evaluate(() => document.getElementById("scene").getAttribute("data-scene")));
  await page.locator("[data-mode-library]").click();
  await page.goto(base + "#/squid/redondo/squid-rig", { waitUntil: "load" });
  await page.locator("[data-addtrip]").first().click();
  ok(await page.locator(".tripbar").count() === 0, "the card comes back out of the trip");

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
    const bg = () => pg.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
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
    // The chip under the title says it is held, so the words match the night picture.
    const heldWords = (await pg.locator("[data-skychip]").innerText()).replace(/\s+/g, " ").trim();
    ok(/^Held dark/.test(heldWords) && /sunset 4:24 PM/.test(heldWords) && !/Overcast|Blue sky/.test(heldWords), "held dark at midday, the sky chip says Held dark and keeps the sunset", heldWords);
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

  // From now, the fishing starts when you get there. At 7:45 PM with an 8 to
  // 12 window, 35 min from Redondo: leave now, fish from 8:35, never "Leave
  // now" over "Fish 8:00 PM".
  {
    const c6 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
    await fake(c6);
    await c6.addInitScript(() => { try { localStorage.setItem("rig.win.v1", JSON.stringify({ dark: { from: "20:00", to: "00:00" } })); } catch (e) {} });
    const pg = await c6.newPage();
    await pg.clock.setFixedTime(new Date("2026-11-24T19:45:00-08:00"));
    const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
    await pg.goto(base + "#/trips", { waitUntil: "load" });
    await pg.waitForSelector('[data-view="trips"] [data-day]');
    await pg.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"), { waitUntil: "load" });
    await pg.waitForSelector('[data-view="hot"][data-run="squid-redondo"] [data-read-headline]', { timeout: 8000 }).catch(() => {});
    const at = await pg.evaluate(() => ({ head: document.querySelector('[data-view="hot"] [data-read-headline]')?.textContent || "",
      why: document.querySelector('[data-view="hot"] [data-read-reason]')?.textContent || "",
      plan: [...document.querySelectorAll('[data-sec-row="plan"] .planhead b, [data-sec-row="plan"] .tl-lab > span')].map((e) => e.querySelector("small") ? e.firstChild.textContent + " " + e.querySelector("small").textContent : e.textContent) }));
    ok(/^8:35 to 12: /.test(at.head) && /^Leave now, 35\smin drive\.$/.test(at.why.replace(/^.*?\. (?=Leave)/, "")), "7:45 PM, 35 min away: the read is 8:35 to 12, leave now", at);
    ok(at.plan.join(" | ") === "Leave now | Now Leave | 8:35 PM Fish | 12:00 AM Done", "and THE PLAN: leave now, fish from 8:35 PM, not 8:00", at.plan.join(" | "));
    // 8:15 PM: from 9:05. Without the window, the trip's own hours end at
    // 8:30, before you could get there: done for today, and THE PLAN says so.
    const again = async () => { await pg.evaluate(() => { location.hash = "#/trips"; }); await pg.waitForSelector('[data-view="trips"]');
      await pg.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"); }); await pg.waitForSelector('[data-view="hot"] [data-read-headline]'); };
    await pg.clock.setFixedTime(new Date("2026-11-24T20:15:00-08:00"));
    await again();
    const at2 = await pg.evaluate(() => ({ head: document.querySelector('[data-view="hot"] [data-read-headline]').textContent,
      fish: document.querySelectorAll('[data-sec-row="plan"] .tl-lab > span')[1]?.firstChild.textContent }));
    ok(/^9:05 to 12: /.test(at2.head) && at2.fish === "9:05 PM", "8:15 PM: 9:05 to 12, fish from 9:05 PM", at2);
    await pg.locator('[data-view="hot"] [data-win-reset]').click();
    await pg.waitForFunction(() => /^Done for today$/.test(document.querySelector('[data-view="hot"] [data-read-headline]')?.textContent || ""));
    const over = await pg.evaluate(() => document.querySelector('[data-sec-row="plan"]').innerText.replace(/\s+/g, " "));
    ok(/^The plan Done for today\b/i.test(over) && !/Leave now/.test(over), "the trip's own hours are over by the time you get there: done for today, in the read and THE PLAN", over);
    ok(errs.length === 0, "no page errors from now", errs.join(" | "));
    await c6.close();
  }

  // A run card opened cold, by its link, before any forecast is on the phone:
  // it waits under the trip's own name, then draws. It does not fall back to
  // the week.
  {
    const c5 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
    await fake(c5);
    let hold = null;
    const held = new Promise((r) => { hold = r; });
    await c5.route(/api\.open-meteo\.com\/v1\/forecast/, async (route) => { await held; return route.fallback(); });
    const pg = await c5.newPage();
    await pg.clock.setFixedTime(new Date("2026-11-23T12:00:00-08:00"));
    const errs = []; pg.on("pageerror", (e) => errs.push(e.message));
    const link = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo");
    await pg.goto(base + link, { waitUntil: "load" });
    await pg.waitForSelector("[data-hot-wait]");
    const waiting = await pg.evaluate(() => ({ hash: location.hash, title: document.querySelector(".hero h1").textContent, scene: document.getElementById("scene").getAttribute("data-scene"),
      back: document.querySelector(".hero [data-up]").getAttribute("href") }));
    ok(decodeURIComponent(waiting.hash) === decodeURIComponent(link) && waiting.title === "Squid at Redondo" && waiting.scene === "pier" && waiting.back === "#/trips",
      "a cold run card link waits for the forecast under the trip's own name and scene", JSON.stringify(waiting));
    hold();
    await pg.waitForSelector('[data-view="hot"][data-run="squid-redondo"] [data-sec-row="plan"]', { timeout: 8000 }).catch(() => {});
    ok(await pg.locator('[data-view="hot"][data-run="squid-redondo"] [data-sec-row]').count() === 9 && /Leave by 4:10 PM/.test(await pg.locator('[data-sec-row="plan"]').innerText()),
      "then the run card draws, at the same address", await pg.evaluate(() => location.hash));
    // A link to a day that is not in the forecast any more goes to the week.
    await pg.goto(base + "#/trips/" + encodeURIComponent("2026-11-01~squid-redondo"), { waitUntil: "load" });
    await pg.waitForSelector('[data-view="trips"] [data-day]');
    ok(/^#\/trips$/.test(await pg.evaluate(() => location.hash)), "a link to a day that has passed lands on the week", await pg.evaluate(() => location.hash));
    ok(errs.length === 0, "no page errors on a cold link", errs.join(" | "));
    await c5.close();
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
