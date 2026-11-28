// CastAI's library on the Learn tab, in a browser.
// Run: node tests/rigs-library.smoke.mjs
//
// What this guards: Learn opens on the parts the switch has on (LIB_READY
// in rigs/index.html: Knots and Casting) as picture tiles across the
// waterline that fill their row, with what to learn first; the guides, the
// gear and a fish's About are held for a Washington rewrite, so they have no
// tile, no chip and no page, and a link to one (opened in the app or from
// cold) lands on Learn; switched on, they still render as below; the
// knot list leads with the four for this week and groups the rest by what
// they join; every knot card and every cast card renders its steps (or the
// app's own drawing), the mistake that makes it fail and its checked video;
// the casting list leads with the pendulum cast, the pier swing, under the
// pier; the guides are tiles, each its own picture; a guide's sections are
// headlines, every part closed, a part opening on its points with CastAI's
// paragraph behind More; the salmon guide's rules open on two chips to the
// checked rules, and no other section repeats a rules note; rows carry their
// level, not "1 video", and a video is labelled by its card, not YouTube; a
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

  // ---- Learn: the parts the switch has on ----------------------------------
  await sky("overcast", "#/learn");
  await page.waitForFunction(() => /33 knots/.test(document.querySelector('[data-sec-tile="knots"] .meta')?.textContent || ""));
  const READY = await page.evaluate(() => ({ ...RIG.libReady })), ALL = { knots: true, casting: true, guides: true, gear: true, about: true };
  const setReady = (r) => page.evaluate((x) => { Object.assign(RIG.libReady, x); }, r);
  const ON = ["knots", "casting", "guides", "gear"].filter((x) => READY[x]), OFF = ["guides", "gear"].filter((x) => !READY[x]);
  ok(READY.knots && READY.casting && !READY.guides && !READY.gear && !READY.about, "the switch: knots and casts on; the guides, the gear and a fish's About held for a Washington rewrite", READY);
  const tiles = await page.evaluate(() => [...document.querySelectorAll("[data-learn-tiles] [data-sec-tile]")].map((t) => ({ id: t.dataset.secTile, nm: t.querySelector(".nm").textContent, meta: t.querySelector(".meta").textContent, shapes: t.querySelectorAll(".pic svg *").length })));
  ok(tiles.map((t) => t.id).join() === ON.join() && tiles.every((t) => t.shapes >= 8 && /\d/.test(t.meta)),
    "the Learn tab shows " + ON.join(" and ") + ", each a picture tile with its count, and no tile for " + OFF.join(" or "), tiles);
  const fill = await page.evaluate(() => {
    const box = document.querySelector("[data-learn-tiles]").getBoundingClientRect(), t = [...document.querySelectorAll("[data-learn-tiles] .ptile")].map((e) => e.getBoundingClientRect());
    const last = t.filter((r) => Math.round(r.top) === Math.round(t[t.length - 1].top));
    return { rows: new Set(t.map((r) => Math.round(r.top))).size, left: Math.round(Math.min(...last.map((r) => r.left)) - box.left), right: Math.round(box.right - Math.max(...last.map((r) => r.right))), tall: t.every((r) => r.height > 60) };
  });
  ok(fill.rows === Math.ceil(ON.length / 2) && Math.abs(fill.left) <= 1 && Math.abs(fill.right) <= 1 && fill.tall, "and they fill their row: no empty space where Guides and Gear were", fill);
  ok(await crosses("[data-learn-tiles] .ptile"), "and they cross the waterline");
  ok(await page.textContent(".hero h1") === "Knots and casts", "the Learn title names what is there, not guides", await page.textContent(".hero h1"));
  const first = await page.evaluate(() => [...document.querySelectorAll("[data-learn-first] .row")].map((r) => r.dataset.knot || r.dataset.cast));
  ok(first.join() === "arbor-knot,double-uni,palomar,dropper-loop,pendulum-cast", "Learn these first: arbor, double uni, Palomar, dropper loop, and the pier swing", first);
  ok(/^Learn these first/.test(await page.textContent("[data-learn-first] .sect")), "and the heading says learn, since the pier swing is not tied");
  const lv = await page.evaluate(() => [...document.querySelectorAll("[data-learn-first] .row")].map((r) => ({ lv: (r.querySelector(".badge.lv") || {}).textContent || "", any: [...r.querySelectorAll(".badge")].map((b) => b.textContent).join() })));
  ok(lv.every((r) => /^(Easy|Medium|Tricky|Hard)$/.test(r.lv) && !/video/i.test(r.any)), "each row carries its level as a tinted badge, and no \"1 video\" pill", lv);
  ok(await page.locator("[data-course-tile]").count() === 3, "the app's own courses (Rods, Kayak, Fly) are still there");
  const jump = await page.evaluate(() => [...document.querySelectorAll(".dock .jump [data-sec]")].map((c) => c.dataset.sec));
  ok(jump.slice(0, ON.length).join() === ON.join() && !OFF.some((x) => jump.includes(x)) && jump.includes("rods") && !jump.includes("knots", 1), "the filter row under the dock leads with " + ON.join(" and ") + ", no chip for " + OFF.join(" or "), jump);

  // ---- held back: no page, and a link lands on Learn -------------------------
  const HELD = ["#/learn/guides", "#/learn/guides/salmon", "#/learn/guides/salmon/salmon-species", "#/learn/guides/salmon/regulations", "#/learn/gear", "#/learn/gear/budget/budget-50"];
  const GONE = '[data-lib="guides"],[data-lib="guide"],[data-lib="gear"],[data-guide-tile],.gitem,[data-rules-pointer],[data-sec-tile="guides"],[data-sec-tile="gear"],.jump [data-sec="guides"],.jump [data-sec="gear"],[data-about]';
  const leaked = [];
  for (const h of HELD) {
    await page.evaluate((x) => { location.hash = "#/crew"; location.hash = x; }, h);
    await page.waitForFunction(() => location.hash === "#/learn" && document.querySelector("[data-learn-tiles] [data-sec-tile]"));
    await page.waitForTimeout(60);
    const n = await page.evaluate((q) => document.querySelectorAll(q).length, GONE);
    if (n || await page.evaluate(() => location.hash) !== "#/learn") leaked.push(h + " " + n);
  }
  ok(leaked.length === 0, "a link to a held-back guide or gear part lands on the Learn tab, with no guide or gear on it", leaked);
  const cold = await ctx.newPage();
  await cold.clock.setFixedTime(NOW);
  await cold.goto(`http://127.0.0.1:${PORT}/rigs/#/learn/guides/salmon/salmon-species`, { waitUntil: "load" });
  await cold.waitForFunction(() => location.hash === "#/learn" && document.querySelector("[data-learn-tiles] [data-sec-tile]"));
  ok(await cold.evaluate((q) => document.querySelectorAll(q).length, GONE) === 0 && await cold.locator('[data-tab="learn"][aria-selected="true"]').count() === 1,
    "opened from cold, a held-back guide's link lands on the Learn tab too");
  await cold.close();
  const abouts = [];
  for (const id of await page.evaluate(() => Object.keys(RIG.library.fish))) {
    await go("#/" + id, '[data-view="species"]');
    await page.waitForTimeout(60);
    const a = await page.evaluate(() => ({ n: document.querySelectorAll("[data-about]").length, said: /About the fish/.test(document.querySelector('[data-view="species"]').textContent) }));
    if (a.n || a.said) abouts.push(id);
  }
  ok(abouts.length === 0, "no fish's page shows About the fish while it is held back", abouts);

  // ---- the knots -------------------------------------------------------------
  await go("#/learn/knots", '[data-lib="knots"] [data-knot-first] .row');
  const kl = await page.evaluate(() => ({
    first: [...document.querySelectorAll("[data-knot-first] .row")].map((r) => r.dataset.knot),
    groups: [...document.querySelectorAll("[data-knot-group]")].map((g) => g.dataset.knotGroup),
    rows: document.querySelectorAll("[data-knot-group] .row").length,
    heads: [...document.querySelectorAll("[data-knot-group] .sect")].map((h) => h.textContent.replace(/\d+/, "").trim())
  }));
  ok(kl.first.join() === "arbor-knot,double-uni,palomar,dropper-loop", "the knot list leads with the four for this week", kl.first);
  const again = await page.evaluate(() => [...document.querySelectorAll("[data-knot-group] .row")].map((r) => r.dataset.knot).filter((id) => ["arbor-knot", "double-uni", "palomar", "dropper-loop"].includes(id)));
  ok(kl.groups.join() === "line,hook,loop,rope" && kl.first.length + kl.rows === 33 && again.length === 0,
    "then every other knot, grouped by what it joins, none of the four twice and no group of one (the arbor knot is the only reel knot)", kl);
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
  const duv = await page.evaluate(() => ({ label: document.querySelector('[data-card="lib-knot-double-uni"] .vid b').textContent, steps: [...document.querySelectorAll('[data-card="lib-knot-double-uni"] .kstrip li')].map((li) => li.textContent) }));
  ok(duv.label === "Double uni" && /8 times/.test(duv.steps[1]) && /5 times/.test(duv.steps[3]), "its video is labelled with the card's name, not YouTube's title, and its steps give the braid 8 wraps and the leader 5", duv);

  // ---- the casts -------------------------------------------------------------
  await go("#/learn/casting", '[data-lib="casting"] .row');
  const cl = await page.evaluate(() => ({ first: document.querySelector("[data-cast-group] .row").dataset.cast, line: document.querySelector("[data-cast-group] .row").textContent,
    n: document.querySelectorAll("[data-cast-group] .row").length, groups: [...document.querySelectorAll("[data-cast-group]")].map((g) => g.dataset.castGroup) }));
  ok(cl.first === "pendulum-cast" && /pier swing/i.test(cl.line) && cl.n === 13 && cl.groups.join() === "spin,fly", "Casting: all 13 cards (Pitch and flip is Flipping), the pendulum cast first, called the pier swing", cl);
  ok(await sceneKind() === "pier" && await crosses("[data-cast-group]"), "under the pier, the first list crossing the waterline");
  const cids = await page.evaluate(() => RIG.library.casts.map((c) => c.id));
  const cbad = [];
  for (const id of cids) {
    await go("#/learn/casting/" + id, '[data-view="card"] .card');
    const c = await page.evaluate(() => { const card = document.querySelector('[data-view="card"] .card');
      return { strip: card.querySelectorAll(".kstrip li").length, fails: !!card.querySelector("[data-fails]"), vid: (card.querySelector(".vid") || {}).dataset?.video || "" }; });
    if (!(c.strip >= 4 && c.fails && FIX[c.vid])) cbad.push(id + " " + JSON.stringify(c));
  }
  ok(cbad.length === 0, "each of the 13 cast cards renders its steps, where it fails and its checked video", cbad.slice(0, 3));

  // ---- guides and gear, switched on --------------------------------------------
  // Held back, not gone: switched on, they still render.
  await setReady(ALL);
  await go("#/learn/guides", "[data-guide-tiles] [data-guide-tile]");
  await page.waitForSelector('[data-guide-tile="unhooking"] .pic[data-plate]');
  const gt = await page.evaluate(() => [...document.querySelectorAll("[data-guide-tile]")].map((t) => {
    const p = t.querySelector(".pic"), svg = p.querySelector("svg");
    return { id: t.dataset.guideTile, shapes: p.querySelectorAll("svg *").length, plate: p.dataset.plate || "", kind: p.dataset.viewKind || "",
      look: svg ? svg.innerHTML.replace(/vw\d+/g, "").length + ":" + [...svg.querySelectorAll("path")].slice(4, 7).map((x) => (x.getAttribute("d") || "").slice(0, 40)).join("|") : "" };
  }));
  ok(gt.length === 6 && gt.every((t) => t.shapes >= 8), "Guides: six tiles, each with its picture", gt.map((t) => t.id + " " + t.shapes));
  ok(new Set(gt.map((t) => t.look)).size === 6 && gt.find((t) => t.id === "unhooking").plate === "hook", "and no two the same picture: unhooking is a hook, the rivers and lakes each their own shore", gt.map((t) => t.id + " " + (t.plate || t.kind)));

  await go("#/learn/guides/salmon", '[data-guide="salmon"] [data-gsec]');
  const gs = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-guide] .row[data-gsec]').length, rule: document.querySelectorAll('[data-guide] .rule[data-gsec="regulations"]').length }));
  ok(gs.rows === 9 && gs.rule === 1, "a guide's sections are headlines; its rules are a rule row with the red edge", gs);
  await go("#/learn/guides/salmon/regulations", "[data-rules-pointer]");
  const rp = await page.evaluate(() => ({ links: [...document.querySelectorAll("[data-rules-pointer] a")].map((a) => a.getAttribute("href")), text: document.querySelector('[data-view="card"] .card').textContent }));
  ok(rp.links.includes("#/trips") && rp.links.some((h) => /wdfw\.wa\.gov/.test(h)) && !/\$\d|daily limit|catch record/i.test(rp.text),
    "the salmon guide's rules open on two chips, Trips and WDFW emergency rules, never CastAI's rules", rp);
  const pager = await page.evaluate(() => ({ prev: document.querySelector(".pn .prev b")?.textContent || "", next: !!document.querySelector(".pn .next b") }));
  ok(!pager.next && /safety|checklist|calendar|catch/i.test(pager.prev), "the pager puts Rules last, as the list does", pager);
  await go("#/learn/guides/salmon/salmon-species", '[data-view="card"] .gitem');
  const sec = await page.evaluate(() => ({ items: document.querySelectorAll(".gitem").length, open: document.querySelectorAll(".gitem[open]").length,
    notes: document.querySelectorAll('[data-view="card"] .box.law, [data-view="card"] [data-rules-pointer]').length }));
  ok(sec.items === 6 && sec.open === 0 && sec.notes === 0, "one section per tap: its parts as headlines, all closed, and no rules note repeated in it", sec);
  await page.click(".gitem:nth-child(2) > summary");
  const part = await page.evaluate(() => { const g = document.querySelector(".gitem[open] .gbody"); return { first: g.firstElementChild.tagName, more: !!g.querySelector(".gmore:not([open])"), shown: g.innerText.length }; });
  ok(await page.locator(".gitem[open]").count() === 1 && part.first === "UL" && part.more, "a tap opens that part in place, on its points, with CastAI's paragraph behind More", part);
  await page.click(".gitem[open] .gmore > summary");
  ok(await page.locator(".gitem[open] .gmore[open] p").count() === 1, "and More shows the paragraph");
  await go("#/learn/gear", '[data-lib="gear"] [data-gsec]');
  const gr = await page.evaluate(() => ({ parts: [...document.querySelectorAll("[data-gear]")].map((g) => g.dataset.gear), rows: document.querySelectorAll("[data-gear] [data-gsec]").length }));
  ok(gr.parts.join() === "tackle,budget" && gr.rows === 16, "Gear: tackle and gear on a budget, as headlines", gr);
  await go("#/learn/gear/budget/budget-50", '[data-view="card"] .gitem');
  ok(/starter kit/i.test(await page.textContent(".hero h1")), "a gear section opens");

  // ---- a fish's page (switched on), a rig's knot, a trip ---------------------------
  await go("#/coho/green-river", '[data-about="coho-salmon"]');
  const ab = await page.evaluate(() => { const a = document.querySelector("[data-about]"); return { text: a.textContent, lures: a.querySelectorAll(".lures .tag").length }; });
  ok(/jump when hooked/i.test(ab.text) && ab.lures >= 3 && /Did you know\?/.test(ab.text) && !/Silvers/.test(ab.text) && /by smell/.test(ab.text),
    "a fish's page gains what the fish is, in the Rig Card's words, where it lives, lures and a checked fact", ab);
  await setReady(READY);
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
  const openPart = async () => { await page.click(".gitem:nth-child(2) > summary"); await page.click(".gitem[open] .gmore > summary"); await page.waitForSelector(".gitem[open] .gmore[open] p"); };
  // (the guide screens with the switch on, the rest as it is set)
  const SCREENS = [["a knot card", "#/learn/knots/double-uni", '[data-card="lib-knot-double-uni"]'], ["a cast card", "#/learn/casting/pendulum-cast", '[data-card="lib-cast-pendulum-cast"]'],
    ["a guide section", "#/learn/guides/salmon/salmon-species", '[data-view="card"] .gitem', null, true],
    ["a guide part opened, its More open", "#/learn/guides/salmon/salmon-species", '[data-view="card"] .gitem', openPart, true],
    ["the rules page", "#/learn/guides/salmon/regulations", "[data-rules-pointer] .chip", null, true], ["the Learn tab", "#/learn", "[data-learn-first] .row"]];
  for (const [name, hash, sel, then, on] of SCREENS) {
    const worst = [];
    await setReady(on ? ALL : READY);
    for (const id of SKIES) {
      await sky(id, hash);
      await page.waitForSelector(sel);
      if (then) await then();
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
