// CastAI's library on the Learn tab, in a browser.
// Run: node tests/rigs-library.smoke.mjs
//
// What this guards: Learn opens on its four parts (Knots, Casting, Guides,
// Gear) as picture tiles across the waterline, with what to tie first; the
// knot list leads with the four for this week and groups the rest by what
// they join; every knot card and every cast card renders its steps (or the
// app's own drawing), the mistake that makes it fail and its checked video;
// the casting list leads with the pendulum cast, the pier swing, under the
// pier; the guides are tiles, a guide's sections are headlines and one opens
// at a time; the salmon guide's rules open on a link to the checked rules; a
// fish's page shows what the fish is; a knot named in a rig's steps opens its
// card; a library knot goes into a trip and shows in Field mode; and a knot
// card, a cast card and a guide section read under all eight skies.
// Nothing here reaches a real server.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SKIES, fake, unreadable } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8857;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 420000);
watchdog.unref?.();
const FIX = JSON.parse(readFileSync(resolve(ROOT, "tests/fixtures/castai-videos.json"), "utf8")).videos;

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  await fake(ctx);
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/rigs/#/trips`, { waitUntil: "load" });
  await page.waitForSelector("[data-day] [data-hot]");
  const sky = async (id, hash) => {
    await page.evaluate(([i, h]) => {
      const p = RIG.sky.palettes[i];
      RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name });
      location.hash = "#/crew"; location.hash = h;
    }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForTimeout(60);
  };
  const go = async (hash, sel) => { await page.evaluate((h) => { location.hash = "#/crew"; location.hash = h; }, hash); await page.waitForSelector(sel); };
  const crosses = (sel) => page.evaluate((q) => {
    const s = document.getElementById("scene").getBoundingClientRect(), c = document.querySelector(q), b = c && c.getBoundingClientRect();
    return b ? b.top < s.bottom - 24 && b.bottom > s.bottom : false;
  }, sel);
  const sceneKind = () => page.evaluate(() => document.getElementById("scene").getAttribute("data-scene"));

  // ---- Learn: the four parts ---------------------------------------------
  await sky("overcast", "#/learn");
  await page.waitForFunction(() => /34 knots/.test(document.querySelector('[data-sec-tile="knots"] .meta')?.textContent || ""));
  const tiles = await page.evaluate(() => [...document.querySelectorAll("[data-learn-tiles] [data-sec-tile]")].map((t) => ({ id: t.dataset.secTile, nm: t.querySelector(".nm").textContent, meta: t.querySelector(".meta").textContent, shapes: t.querySelectorAll(".pic svg *").length })));
  ok(tiles.map((t) => t.id).join() === "knots,casting,guides,gear" && tiles.every((t) => t.shapes >= 8 && /\d/.test(t.meta)),
    "the Learn tab shows the four groups, Knots, Casting, Guides and Gear, each a picture tile with its count", tiles);
  ok(await crosses("[data-learn-tiles] .ptile"), "and they cross the waterline");
  const first = await page.evaluate(() => [...document.querySelectorAll("[data-learn-first] .row")].map((r) => r.dataset.knot || r.dataset.cast));
  ok(first.join() === "arbor-knot,double-uni,palomar,dropper-loop,pendulum-cast", "Tie these first: arbor, double uni, Palomar, dropper loop, and the pier swing", first);
  ok(await page.locator("[data-course-tile]").count() === 3, "the app's own courses (Rods, Kayak, Fly) are still there");
  const jump = await page.evaluate(() => [...document.querySelectorAll(".dock .jump [data-sec]")].map((c) => c.dataset.sec));
  ok(jump.slice(0, 4).join() === "knots,casting,guides,gear" && jump.includes("rods") && !jump.includes("knots", 1), "the filter row under the dock leads with the four parts", jump);

  // ---- the knots -------------------------------------------------------------
  await go("#/learn/knots", '[data-lib="knots"] [data-knot-first] .row');
  const kl = await page.evaluate(() => ({
    first: [...document.querySelectorAll("[data-knot-first] .row")].map((r) => r.dataset.knot),
    groups: [...document.querySelectorAll("[data-knot-group]")].map((g) => g.dataset.knotGroup),
    rows: document.querySelectorAll("[data-knot-group] .row").length,
    heads: [...document.querySelectorAll("[data-knot-group] .sect")].map((h) => h.textContent.replace(/\d+/, "").trim())
  }));
  ok(kl.first.join() === "arbor-knot,double-uni,palomar,dropper-loop", "the knot list leads with the four for this week", kl.first);
  ok(kl.groups.join() === "reel,line,hook,loop,rope" && kl.rows === 34, "then every knot, grouped by what it joins", kl);
  ok(await crosses("[data-knot-first]") && await sceneKind() === "lake", "the four cross the waterline under the lake");
  const ids = await page.evaluate(() => RIG.library.knots.map((k) => k.id));
  const bad = [];
  for (const id of ids) {
    await go("#/learn/knots/" + id, '[data-view="card"] .card');
    const c = await page.evaluate(() => {
      const card = document.querySelector('[data-view="card"] .card');
      return { title: document.querySelector(".hero h1").textContent, strip: card.querySelectorAll(".kstrip li").length, tyer: card.querySelectorAll(".tyer .kstep").length,
        fails: (card.querySelector("[data-fails]") || {}).textContent || "", vid: (card.querySelector(".vid") || {}).dataset?.video || "", add: !!card.querySelector("[data-addtrip]"),
        href: (card.querySelector(".vid") || {}).href || "" };
    });
    if (!((c.strip >= 3 || c.tyer >= 3) && c.fails.length > 20 && FIX[c.vid] && c.href.includes(c.vid) && c.add && c.title)) bad.push(id + " " + JSON.stringify(c));
  }
  ok(bad.length === 0, "each of the " + ids.length + " knot cards renders: steps as a numbered strip (or the app's own drawing), where it fails, its checked video, Add to trip", bad.slice(0, 3));
  await go("#/learn/knots/improved-clinch", '[data-view="card"] .card .tyer .rail button');
  ok(await page.locator('[data-card="knot-improved-clinch"] .tyer .rail button').count() === 5 && await page.locator('[data-card="knot-improved-clinch"] [data-fails]').count() === 1,
    "a knot the app draws by hand keeps its drawing and its step player, and gains CastAI's tips");
  await go("#/learn/knots/double-uni", '[data-card="lib-knot-double-uni"]');
  const du = await page.evaluate(() => ({ h: document.querySelector(".hero h1").textContent, chips: document.querySelector(".hero .chips").textContent, next: document.querySelector(".pn .next b")?.textContent }));
  ok(du.h === "Double uni" && /Line to line/.test(du.chips) && du.next === "Palomar", "the double uni card: its name, what it joins, and Next walks the list", du);

  // ---- the casts -------------------------------------------------------------
  await go("#/learn/casting", '[data-lib="casting"] .row');
  const cl = await page.evaluate(() => ({ first: document.querySelector("[data-cast-group] .row").dataset.cast, line: document.querySelector("[data-cast-group] .row").textContent,
    n: document.querySelectorAll("[data-cast-group] .row").length, groups: [...document.querySelectorAll("[data-cast-group]")].map((g) => g.dataset.castGroup) }));
  ok(cl.first === "pendulum-cast" && /pier swing/i.test(cl.line) && cl.n === 14 && cl.groups.join() === "spin,fly", "Casting: all 14, the pendulum cast first, called the pier swing", cl);
  ok(await sceneKind() === "pier" && await crosses("[data-cast-group]"), "under the pier, the first list crossing the waterline");
  const cids = await page.evaluate(() => RIG.library.casts.map((c) => c.id));
  const cbad = [];
  for (const id of cids) {
    await go("#/learn/casting/" + id, '[data-view="card"] .card');
    const c = await page.evaluate(() => { const card = document.querySelector('[data-view="card"] .card');
      return { strip: card.querySelectorAll(".kstrip li").length, fails: !!card.querySelector("[data-fails]"), vid: (card.querySelector(".vid") || {}).dataset?.video || "" }; });
    if (!(c.strip >= 4 && c.fails && FIX[c.vid])) cbad.push(id + " " + JSON.stringify(c));
  }
  ok(cbad.length === 0, "each of the 14 cast cards renders its steps, where it fails and its checked video", cbad.slice(0, 3));

  // ---- guides and gear -------------------------------------------------------
  await go("#/learn/guides", "[data-guide-tiles] [data-guide-tile]");
  const gt = await page.evaluate(() => [...document.querySelectorAll("[data-guide-tile]")].map((t) => ({ id: t.dataset.guideTile, shapes: t.querySelectorAll(".pic svg *").length })));
  ok(gt.length === 6 && gt.every((t) => t.shapes >= 8), "Guides: six tiles, each with its picture", gt);
  await go("#/learn/guides/salmon", '[data-guide="salmon"] [data-gsec]');
  const gs = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-guide] .row[data-gsec]').length, rule: document.querySelectorAll('[data-guide] .rule[data-gsec="regulations"]').length }));
  ok(gs.rows === 9 && gs.rule === 1, "a guide's sections are headlines; its rules are a rule row with the red edge", gs);
  await go("#/learn/guides/salmon/regulations", "[data-rules-pointer]");
  const rp = await page.evaluate(() => ({ links: [...document.querySelectorAll("[data-rules-pointer] a")].map((a) => a.getAttribute("href")), text: document.querySelector('[data-view="card"] .card').textContent }));
  ok(rp.links.includes("#/trips") && rp.links.some((h) => /wdfw\.wa\.gov/.test(h)) && !/\$\d|daily limit|catch record/i.test(rp.text),
    "the salmon guide's rules open on a link to the checked rules, never CastAI's rules", rp);
  await go("#/learn/guides/salmon/salmon-species", '[data-view="card"] .gitem');
  const sec = await page.evaluate(() => ({ items: document.querySelectorAll(".gitem").length, open: document.querySelectorAll(".gitem[open]").length }));
  ok(sec.items === 6 && sec.open === 1, "one section per tap: its parts as headlines, the first open", sec);
  await page.click(".gitem:nth-child(2) summary");
  ok(await page.locator(".gitem[open]").count() === 2, "a tap opens the next part in place");
  await go("#/learn/gear", '[data-lib="gear"] [data-gsec]');
  const gr = await page.evaluate(() => ({ parts: [...document.querySelectorAll("[data-gear]")].map((g) => g.dataset.gear), rows: document.querySelectorAll("[data-gear] [data-gsec]").length }));
  ok(gr.parts.join() === "tackle,budget" && gr.rows === 16, "Gear: tackle and gear on a budget, as headlines", gr);
  await go("#/learn/gear/budget/budget-50", '[data-view="card"] .gitem');
  ok(/starter kit/i.test(await page.textContent(".hero h1")), "a gear section opens");

  // ---- a fish's page, a rig's knot, a trip -------------------------------------
  await go("#/coho/green-river", '[data-about="coho-salmon"]');
  const ab = await page.evaluate(() => { const a = document.querySelector("[data-about]"); return { text: a.textContent, lures: a.querySelectorAll(".lures .tag").length }; });
  ok(/silver salmon/i.test(ab.text) && ab.lures >= 3 && /Did you know/.test(ab.text), "a fish's page gains what CastAI knows about it: what it is, where it lives, lures, a fact", ab);
  await go("#/coho/green-river/salmon-float-eggs-build", '[data-view="card"] .card a.k[data-knot-link]');
  const kk = await page.evaluate(() => [...document.querySelectorAll("a.k[data-knot-link]")].map((a) => a.dataset.knotLink));
  ok(kk.includes("improved-clinch") && kk.includes("egg-loop-knot"), "a knot named in a rig's steps opens its card", kk);
  await go("#/learn/knots/double-uni", '[data-card="lib-knot-double-uni"] [data-addtrip]');
  await page.click('[data-card="lib-knot-double-uni"] [data-addtrip]');
  await page.waitForSelector("[data-mode-field]");
  await page.click("[data-mode-field]");
  await page.waitForSelector('[data-view="field"] [data-card="lib-knot-double-uni"] .kstrip li');
  ok(true, "a library knot goes into a trip and shows in Field mode");
  await page.click("[data-mode-library]");
  await page.waitForSelector('[data-view]:not([data-view="field"])');

  // ---- every word can be read --------------------------------------------------
  const SCREENS = [["a knot card", "#/learn/knots/double-uni", '[data-card="lib-knot-double-uni"]'], ["a cast card", "#/learn/casting/pendulum-cast", '[data-card="lib-cast-pendulum-cast"]'],
    ["a guide section", "#/learn/guides/salmon/salmon-species", '[data-view="card"] .gitem'], ["the Learn tab", "#/learn", "[data-learn-first] .row"]];
  for (const [name, hash, sel] of SCREENS) {
    const worst = [];
    for (const id of SKIES) {
      await sky(id, hash);
      await page.waitForSelector(sel);
      const r = await unreadable(page);
      if (r.bad.length || r.n < 10) worst.push(id + ": " + (r.n < 10 ? "only " + r.n + " texts" : r.bad.slice(0, 3).join(" | ")));
    }
    ok(worst.length === 0, name + ": every word reads under all eight skies", worst);
  }
  ok(errors.length === 0, "no page errors", errors);
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
