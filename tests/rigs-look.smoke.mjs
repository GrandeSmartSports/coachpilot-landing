// The look: the "On the water" kit in the real page at phone width.
// Run: node tests/rigs-look.smoke.mjs
//
// What this guards: a painted scene on top of the Trips screen and the run
// card, the first card crossing the waterline, a painted thumbnail on every
// trip row, a ribbon of light on every day with a bead that can be counted
// for every trip, the dock (and the sky it keeps behind it once the page
// moves), one line a row on the run card, a river that is lit at night, a
// week that still draws when the sky engine or the painter does not load,
// and text that can be read under every sky the engine has. Contrast is measured from the pixels
// the browser paints, so glass, gradients and the scene behind a title all
// count. Text inside the rig drawings (.dia) and on map tiles is left out.
// Nothing here reaches a real server.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SKIES, fake, unreadable } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8807;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 600)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 240000);
watchdog.unref?.();

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  await fake(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector("[data-day] [data-hot]");

  // One sky at a time, the way the brief says: the engine answers with the
  // sky we name, and a change of address redraws under it.
  const sky = async (id, hash) => {
    await page.evaluate(([i, h]) => {
      const p = RIG.sky.palettes[i];
      RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name });
      location.hash = "#/learn"; location.hash = h;
    }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForTimeout(80);
  };
  const PIER = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo");
  const RIVER = "#/trips/" + encodeURIComponent("2026-11-28~chum-green-river");
  const painted = () => page.evaluate(() => {
    const s = document.getElementById("scene"), svg = s && s.querySelector("svg");
    return { kind: s && s.getAttribute("data-scene"), svgs: s ? s.querySelectorAll("svg").length : 0, kids: svg ? svg.querySelectorAll("*").length : 0, h: s ? s.getBoundingClientRect().height : 0 };
  });
  // The first card starts on the picture and ends below it.
  const crosses = (sel) => page.evaluate((q) => {
    const s = document.getElementById("scene").getBoundingClientRect(), c = document.querySelector(q), b = c && c.getBoundingClientRect();
    return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), scene: Math.round(s.bottom), ok: b.top < s.bottom - 24 && b.bottom > s.bottom && b.top > s.top } : null;
  }, sel);

  for (const id of ["overcast", "night", "golden"]) {
    await sky(id, "#/trips");
    await page.waitForSelector("[data-call] [data-call-go]");
    const s = await painted();
    ok(s.kind === "sound" && s.svgs >= 1 && s.kids > 50 && s.h > 300, id + ": Hot Trips stands under a painted scene, the Sound", s);
    const c = await crosses("[data-call]");
    ok(c && c.ok, id + ": the call is the first card and it crosses the waterline", c);
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-hot]")].map((r) => {
      const t = r.querySelector(".tile"), svg = t && t.querySelector("svg"), b = t && t.getBoundingClientRect();
      return { id: r.dataset.hot, kids: svg ? svg.querySelectorAll("*").length : 0, w: b ? b.width : 0, kind: t && t.dataset.mini, under: t && t.dataset.under };
    }));
    ok(rows.length >= 10 && rows.every((r) => r.kids > 5 && r.w >= 44 && r.kind && r.under), id + ": every trip row carries its own small painting", rows.filter((r) => !(r.kids > 5 && r.w >= 44)));
    ok(await page.locator("[data-call] .tile svg").count() === 1, id + ": and so does the call");
    const days = await page.evaluate(() => [...document.querySelectorAll("[data-day]")].map((d) => {
      const r = d.querySelector("h2 .ribbon");
      // A bead stands for one trip, or carries the count of the trips it stands for.
      return { iso: d.dataset.day, ribbon: !!r && /gradient/.test(r.style.background), beads: r ? [...r.querySelectorAll("b")].reduce((a, b) => a + (+b.dataset.n || 0), 0) : -1, trips: d.querySelectorAll("[data-hot]").length, w: r ? r.getBoundingClientRect().width : 0 };
    }));
    ok(days.length === 7 && days.every((d) => d.ribbon && d.w > 60 && d.beads === d.trips), id + ": every day has its ribbon of light, with every trip counted on it", days.filter((d) => !(d.ribbon && d.beads === d.trips)));
    // Trips that start close together do not pile into a chain: they share
    // one bead that says how many. No two beads touch, and none leaves the ribbon.
    const stacked = await page.evaluate(() => [...document.querySelectorAll("[data-day] h2 .ribbon")].map((r) => {
      const bs = [...r.querySelectorAll("b")].map((b) => ({ r: b.getBoundingClientRect(), n: +b.dataset.n, t: b.textContent.trim() })).sort((a, b) => a.r.left - b.r.left), box = r.getBoundingClientRect();
      const gaps = bs.slice(1).map((b, i) => b.r.left - bs[i].r.right);
      return { n: bs.length, most: Math.max(0, ...bs.map((b) => b.n)), min: gaps.length ? Math.min(...gaps) : 99, inside: bs.every((b) => b.r.left >= box.left - 1 && b.r.right <= box.right + 1),
        said: bs.every((b) => (b.n > 1 ? b.t === String(b.n) && b.r.width >= 13 : b.t === "")) };
    }));
    ok(stacked.some((r) => r.most >= 3) && stacked.every((r) => r.min >= 2 && r.inside && r.said), id + ": trips that share an hour share one bead with their count, no two beads touch, and none leaves the ribbon", stacked);
    ok(await page.locator(".dock [data-tab]").count() === 4 && await page.locator(".dock [data-skymode] .skytok").count() === 1, id + ": the dock is there: four tabs and the sky button");
    ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, id + ": Hot Trips fits the phone");

    for (const [hash, kind, name] of [[PIER, "pier", "a pier run card"], [RIVER, "river", "a river run card"]]) {
      await sky(id, hash);
      await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
      const r = await painted();
      ok(r.kind === kind && r.svgs >= 1 && r.kids > 50, id + ": " + name + " stands under its own scene, the " + kind, r);
      const pc = await crosses('[data-sec-row="plan"]');
      ok(pc && pc.ok, id + ": the plan is the first card on " + name + " and it crosses the waterline", pc);
      ok(await page.locator(".duo .tcard").count() === 2 && await page.locator(".duo .tcard svg").count() >= 1 && await page.locator('[data-view="hot"] .tl-sky').evaluate((e) => /gradient/.test(e.style.background)),
        id + ": " + name + " has its two picture tiles and the plan's strip of sky");
      ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, id + ": " + name + " fits the phone");
      // Headlines: each row in the grouped card says one thing on one line,
      // whole, and the rules row is never cut.
      const lines = await page.evaluate(() => [...document.querySelectorAll('[data-view="hot"] > .list .row .tx > span')].map((e) => ({
        t: e.textContent, h: Math.round(e.getBoundingClientRect().height), cut: e.scrollWidth > e.clientWidth + 1 })));
      ok(lines.length >= 5 && lines.every((l) => l.t.length > 3 && l.h <= 22 && !l.cut), id + ": every row on " + name + " is one whole line", lines.filter((l) => !(l.h <= 22 && !l.cut)));
      const rule = await page.evaluate(() => { const e = document.querySelector('[data-sec-row="rules"] .tx > span'); return { t: e.textContent, cut: e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 }; });
      ok(rule.t.length > 8 && !rule.cut && !/…|\.\.\.$/.test(rule.t), id + ": the rules row on " + name + " shows its rule whole", rule);
    }
  }
  // Night is lit: the engine's dark flag is on and the pier's lamps are burning.
  await sky("night", PIER);
  const lit = await page.evaluate(() => ({ dark: document.documentElement.getAttribute("data-dark"), lamps: getComputedStyle(document.documentElement).getPropertyValue("--lamps").trim(),
    pools: document.querySelectorAll("#scene .w-lampson *").length }));
  ok(lit.dark === "1" && lit.lamps === "1" && lit.pools > 3, "at night the pier's lamps are on", lit);
  // And so is the river: a lit window on the far bank with its light on the
  // water, and the sky's light lying on the bend.
  await sky("night", RIVER);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  const rlit = await page.evaluate(() => {
    const s = document.getElementById("scene"), cs = getComputedStyle(s), w = s.querySelector(".w-window");
    return { scene: s.getAttribute("data-scene"), window: w ? w.querySelectorAll("rect").length : 0, on: w ? getComputedStyle(w).opacity : "", road: parseFloat(cs.getPropertyValue("--road")), glow: parseFloat(cs.getPropertyValue("--glow")) };
  });
  ok(rlit.scene === "river" && rlit.window > 8 && rlit.on === "1" && rlit.road >= 0.4 && rlit.glow >= 0.3, "at night the river is lit: a window on the far bank and light on the water", rlit);
  await sky("overcast", RIVER);
  const rday = await page.evaluate(() => { const w = document.querySelector("#scene .w-window"); return w ? getComputedStyle(w).opacity : ""; });
  ok(rday === "0", "by day that window is dark", rday);

  // The dock switches tabs, from any screen.
  await sky("overcast", "#/trips");
  for (const [tab, view] of [["water", "home"], ["fish", "fish"], ["learn", "learn"], ["trips", "trips"]]) {
    await page.locator('.dock [data-tab="' + tab + '"]').click();
    await page.waitForSelector('[data-view="' + view + '"]');
    ok(await page.locator('.dock [data-tab="' + tab + '"]').getAttribute("aria-selected") === "true" && (await painted()).kids > 50, "the dock opens " + tab + ", lit, with the scene still painted");
  }
  const one = await page.evaluate(() => document.querySelectorAll("#scene, .scene").length);
  ok(one === 1, "one scene on the page, however many screens were drawn", one);
  // One motion: the glints on the water shimmer and nothing else moves.
  const moving = await page.evaluate(() => document.getAnimations().map((a) => a.animationName || "other"));
  ok(moving.length >= 1 && moving.every((n) => n === "shim"), "the only thing that moves on the scene is the shimmer on the water", moving.join(","));

  // Once the page moves, the dock keeps a band of sky behind it, so cards
  // and titles pass behind the tabs and never show between them.
  const band = () => page.evaluate(() => ({ on: document.documentElement.hasAttribute("data-scrolled"), o: getComputedStyle(document.querySelector(".dock"), "::before").opacity }));
  const b0 = await band();
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-scrolled") && getComputedStyle(document.querySelector(".dock"), "::before").opacity === "1");
  const b1 = await band();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => !document.documentElement.hasAttribute("data-scrolled"));
  ok(!b0.on && b0.o === "0" && b1.on && b1.o === "1", "at the top the dock floats on the picture; once the page moves it has sky behind it", [b0, b1]);
  // The filters under the tabs ride on one strip, and the picked one is lit.
  await sky("overcast", "#/coho");
  await page.waitForSelector(".dock .jump [aria-current='true']");
  const strip = await page.evaluate(() => {
    const j = document.querySelector(".dock .jump"), cs = getComputedStyle(j), cur = j.querySelector("[aria-current='true']"), other = j.querySelector("[aria-current='false']");
    const jb = j.getBoundingClientRect(), cb = cur.getBoundingClientRect();
    return { glass: cs.backgroundColor !== "rgba(0, 0, 0, 0)", mask: cs.maskImage || cs.webkitMaskImage, bare: getComputedStyle(other).backgroundColor === "rgba(0, 0, 0, 0)", lit: getComputedStyle(cur).backgroundImage !== "none",
      seen: cb.left >= jb.left - 1 && cb.right <= jb.right + 1 };
  });
  ok(strip.glass && strip.bare && strip.lit && strip.seen && (!strip.mask || strip.mask === "none"), "the filter row is one glass strip, the open filter lit and in view, no name faded out", strip);

  // Readable under every sky the engine has.
  for (const id of SKIES) {
    await sky(id, "#/trips");
    await page.waitForSelector("[data-call] [data-call-go]");
    const a = await unreadable(page);
    ok(a.n > 150 && a.bad.length === 0, id + ": every word on Hot Trips can be read (" + a.n + " checked)", a.bad.slice(0, 8).join(" | "));
    await sky(id, PIER);
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    const b = await unreadable(page);
    ok(b.n > 50 && b.bad.length === 0, id + ": every word on the run card can be read (" + b.n + " checked)", b.bad.slice(0, 8).join(" | "));
  }
  // A narrow phone: ten pips still share one line and the tile titles do not wrap.
  await page.setViewportSize({ width: 360, height: 780 });
  await sky("overcast", PIER);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="gear"] .pips i');
  const narrow = await page.evaluate(() => {
    const tops = [...document.querySelectorAll('[data-sec-row="gear"] .pips i')].map((i) => Math.round(i.getBoundingClientRect().top));
    const heads = [...document.querySelectorAll(".duo .tcard > b")].map((b) => Math.round(b.getBoundingClientRect().height));
    return { pips: tops.length, rows: new Set(tops).size, heads, wide: document.documentElement.scrollWidth };
  });
  ok(narrow.pips === 10 && narrow.rows === 1 && narrow.heads.every((h) => h <= 24) && narrow.wide <= 360, "at 360 px the gear pips share one line and the tile titles stay on one line", narrow);
  await sky("overcast", "#/trips");
  await page.waitForSelector("[data-day] h2 .ribbon");
  const heads360 = await page.evaluate(() => [...document.querySelectorAll("[data-day] > h2")].map((h) => Math.round(h.getBoundingClientRect().height)));
  ok(heads360.length === 7 && heads360.every((h) => h <= 28) && await page.evaluate(() => document.documentElement.scrollWidth) <= 360, "and every day heading stays on one line", heads360);
  // A wide screen: the painting melts into a band of its own sky, not a cut out picture.
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.waitForTimeout(80);
  const wideLook = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById("scene")), h = getComputedStyle(document.documentElement);
    return { mask: (cs.maskImage || cs.webkitMaskImage || "none") !== "none", band: /gradient/.test(h.backgroundImage) }; });
  ok(wideLook.mask && wideLook.band, "on a wide screen the scene fades at its sides into a band of the same sky", wideLook);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(80);
  const phoneLook = await page.evaluate(() => { const cs = getComputedStyle(document.getElementById("scene")); return (cs.maskImage || cs.webkitMaskImage || "none") === "none" && getComputedStyle(document.documentElement).backgroundImage === "none"; });
  ok(phoneLook, "and on a phone it is edge to edge, untouched");

  // A screen with a filter row under its tabs stands its picture lower, so
  // the title keeps its place in the sky. It and the dock can be read under
  // every sky (the whole of those screens is in rigs-look-library.smoke.mjs).
  for (const id of SKIES) {
    const bad = [];
    for (const hash of ["#/water", "#/fish", "#/learn", "#/coho"]) {
      await sky(id, hash);
      const r = await unreadable(page, ".hero, .dock");
      if (r.n < 6 || r.bad.length) bad.push(hash + ": " + (r.bad.join(" | ") || "only " + r.n + " checked"));
    }
    ok(bad.length === 0, id + ": the title and the dock can be read on Water, Fish, Learn and a fish's page", bad.join(" || "));
  }
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // The look is two files on top of the app. If either does not load, the
  // week still draws: it is plainer, never empty.
  for (const [file, what] of [["sky.js", "the sky engine"], ["scene.js", "the painter"]]) {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c2);
    await c2.route(new RegExp("/rigs/" + file.replace(".", "\\.")), (r) => r.abort());
    const p2 = await c2.newPage();
    await p2.clock.setFixedTime(NOW);
    const errs2 = []; p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.goto(base + "#/trips", { waitUntil: "load" });
    await p2.waitForSelector("[data-day] [data-hot]", { timeout: 8000 }).catch(() => {});
    const got = await p2.evaluate(() => ({ rows: document.querySelectorAll("[data-hot]").length, call: !!document.querySelector("[data-call] [data-call-go]"),
      tiles: [...document.querySelectorAll("[data-hot] .tile")].filter((t) => t.getBoundingClientRect().width >= 44 && getComputedStyle(t).backgroundImage !== "none").length,
      chip: [...document.querySelectorAll("[data-skychip]")].filter((c) => !c.querySelector("[data-skyname]").textContent.trim()).length,
      sky: !!window.RIG.sky, btn: document.querySelectorAll("[data-skymode]").length, wide: document.documentElement.scrollWidth }));
    ok(got.rows >= 10 && got.call && errs2.length === 0, "without " + what + " the week and the call still draw", [got, errs2.join(" | ")]);
    ok(got.tiles === got.rows && got.chip === 0 && got.wide <= 390, "and each row keeps a plain swatch where its painting goes, with no empty chip", got);
    ok(got.sky ? got.btn === 1 : got.btn === 0, "the sky button is there only when it can change the screen", got);
    await p2.locator("[data-hot]").first().click();
    await p2.waitForSelector('[data-view="hot"] [data-sec-row="plan"]', { timeout: 5000 }).catch(() => {});
    ok(await p2.locator('[data-view="hot"] [data-sec-row]').count() >= 8 && errs2.length === 0, "and a run card opens", errs2.join(" | "));
    await c2.close();
  }
} catch (e) {
  fail++; console.log("FAIL threw", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
