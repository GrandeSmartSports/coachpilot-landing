// CastAI's library on the Learn tab, in a browser.
// Run: node tests/rigs-library.smoke.mjs
//
// What this guards: Learn opens on the parts the switch has on (LIB_READY
// in rigs/index.html: Knots, Casting, Guides and Gear) as picture tiles
// across the waterline that fill their rows, with what to learn first; the
// guides, the gear and a fish's About are the Rig Card's own (rigs/guides.js)
// and an old link to one of CastAI's guides lands on the Rig Card's guide,
// never CastAI's words; switched off, a guide has no tile, no chip and no
// page, and its link lands on Learn; the knot list leads with the four for
// this week and groups the rest by what they join; every knot card and every
// cast card renders its steps (or the app's own drawing), the mistake that
// makes it fail and its checked video; the casting list leads with the
// pendulum cast, the pier swing, under the pier; the guides are eight tiles,
// each its own picture; a guide's sections are headlines, its rules a red
// rule row that opens on links to the app's rules cards; a section opens on
// its points, with a few lines behind More and its sources; every link in
// every guide opens a screen in the app; The year in Washington opens on
// this month, and every month lists what the planner lists then; the nine
// fish pages show the Rig Card's About; rows carry their level, not "1
// video", and a video is labelled by its card, not YouTube; a knot named in
// a rig's steps opens its card; a library knot goes into a trip and shows in
// Field mode; and a knot card, a cast card, guide sections, the year, the
// rules page and a fish's About read under all eight skies.
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
  ok(READY.knots && READY.casting && READY.guides && READY.gear && READY.about, "the switch: knots, casts, guides, gear and a fish's About are all on", READY);
  const tiles = await page.evaluate(() => [...document.querySelectorAll("[data-learn-tiles] [data-sec-tile]")].map((t) => ({ id: t.dataset.secTile, nm: t.querySelector(".nm").textContent, meta: t.querySelector(".meta").textContent, shapes: t.querySelectorAll(".pic svg *").length })));
  ok(tiles.map((t) => t.id).join() === ON.join() && tiles.every((t) => t.shapes >= 8 && /\d/.test(t.meta)),
    "the Learn tab shows " + ON.join(" and ") + ", each a picture tile with its count" + (OFF.length ? ", and no tile for " + OFF.join(" or ") : ""), tiles);
  const fill = await page.evaluate(() => {
    const box = document.querySelector("[data-learn-tiles]").getBoundingClientRect(), t = [...document.querySelectorAll("[data-learn-tiles] .ptile")].map((e) => e.getBoundingClientRect());
    const last = t.filter((r) => Math.round(r.top) === Math.round(t[t.length - 1].top));
    return { rows: new Set(t.map((r) => Math.round(r.top))).size, left: Math.round(Math.min(...last.map((r) => r.left)) - box.left), right: Math.round(box.right - Math.max(...last.map((r) => r.right))), tall: t.every((r) => r.height > 60) };
  });
  ok(fill.rows === Math.ceil(ON.length / 2) && Math.abs(fill.left) <= 1 && Math.abs(fill.right) <= 1 && fill.tall, "and they fill their rows: Knots, Casting, Guides and Gear, two by two", fill);
  const gmeta = await page.evaluate(() => ({ guides: document.querySelector('[data-sec-tile="guides"] .meta')?.textContent, gear: document.querySelector('[data-sec-tile="gear"] .meta')?.textContent }));
  ok(/^\d+ guides$/.test(gmeta.guides || "") && /^\d+ parts$/.test(gmeta.gear || ""), "Guides and Gear are back on the Learn tab, each with its count from rigs/guides.js", gmeta);
  ok(await crosses("[data-learn-tiles] .ptile"), "and they cross the waterline");
  ok(await page.textContent(".hero h1") === "Knots, casts and guides", "the Learn title names what is there, guides included", await page.textContent(".hero h1"));
  const first = await page.evaluate(() => [...document.querySelectorAll("[data-learn-first] .row")].map((r) => r.dataset.knot || r.dataset.cast));
  ok(first.join() === "arbor-knot,double-uni,palomar,dropper-loop,pendulum-cast", "Learn these first: arbor, double uni, Palomar, dropper loop, and the pier swing", first);
  ok(/^Learn these first/.test(await page.textContent("[data-learn-first] .sect")), "and the heading says learn, since the pier swing is not tied");
  const lv = await page.evaluate(() => [...document.querySelectorAll("[data-learn-first] .row")].map((r) => ({ lv: (r.querySelector(".badge.lv") || {}).textContent || "", any: [...r.querySelectorAll(".badge")].map((b) => b.textContent).join() })));
  ok(lv.every((r) => /^(Easy|Medium|Tricky|Hard)$/.test(r.lv) && !/video/i.test(r.any)), "each row carries its level as a tinted badge, and no \"1 video\" pill", lv);
  ok(await page.locator("[data-course-tile]").count() === 3, "the app's own courses (Rods, Kayak, Fly) are still there");
  const jump = await page.evaluate(() => [...document.querySelectorAll(".dock .jump [data-sec]")].map((c) => c.dataset.sec));
  ok(jump.slice(0, ON.length).join() === ON.join() && !OFF.some((x) => jump.includes(x)) && jump.includes("rods") && !jump.includes("knots", 1), "the filter row under the dock leads with " + ON.join(" and ") + (OFF.length ? ", no chip for " + OFF.join(" or ") : ""), jump);

  // ---- CastAI's guides are gone: an old link opens the Rig Card's ------------
  // The words CastAI's guides had and the Washington check failed.
  // (a Clouser minnow is a fly, and fine)
  const CASTAI_RE = /Skykomish|Skokomish|Snohomish|minnow|fight dirty|ultimate gamefish|mangrove|striper|go bonkers|Worth every minute/i;
  const CASTAI = { test: (t) => CASTAI_RE.test(String(t).replace(/Clouser minnows?/gi, "")) };
  const OLD = [["#/learn/guides/salmon/salmon-species", "salmon"], ["#/learn/guides/salmon/regulations", "salmon"], ["#/learn/guides/fly/wa-spots", "fly"],
    ["#/learn/guides/water/saltwater-reading", "water"], ["#/learn/gear/budget/budget-50", "gear"], ["#/learn/gear/tackle/live-bait", "gear"]];
  const oldBad = [];
  for (const [h, id] of OLD) {
    await go(h, '[data-lib="guide"][data-guide="' + id + '"]');
    const t = await page.evaluate(() => document.getElementById("app").innerText);
    if (CASTAI.test(t)) oldBad.push(h + ": " + t.replace(/Clouser minnows?/gi, "").match(CASTAI_RE)[0]);
  }
  ok(oldBad.length === 0, "an old link to one of CastAI's guides opens the Rig Card's guide of the same name, and none of CastAI's words", oldBad);
  for (const h of ["#/learn/guides/starting", "#/learn/guides/seasons/monthly"]) {
    await go(h, "[data-guide-tiles] [data-guide-tile]");
  }
  ok(true, "a CastAI guide the Rig Card has no guide for opens the list of guides");
  // Switched off, a guide is gone: no tile, no chip, no page.
  await setReady({ guides: false, gear: false, about: false });
  const HELD = ["#/learn/guides", "#/learn/guides/salmon", "#/learn/guides/salmon/tell", "#/learn/guides/year", "#/learn/gear", "#/learn/gear/kit-river"];
  const GONE = '[data-lib="guides"],[data-lib="guide"],[data-guide-tile],[data-rules-pointer],[data-sec-tile="guides"],[data-sec-tile="gear"],.jump [data-sec="guides"],.jump [data-sec="gear"],[data-about],[data-year]';
  const leaked = [];
  for (const h of HELD) {
    await page.evaluate((x) => { location.hash = "#/crew"; location.hash = x; }, h);
    await page.waitForFunction(() => location.hash === "#/learn" && document.querySelector("[data-learn-tiles] [data-sec-tile]"));
    await page.waitForTimeout(60);
    const n = await page.evaluate((q) => document.querySelectorAll(q).length, GONE);
    if (n || await page.evaluate(() => location.hash) !== "#/learn") leaked.push(h + " " + n);
  }
  await go("#/coho/green-river", '[data-view="species"]');
  if (await page.locator("[data-about]").count()) leaked.push("coho About");
  ok(leaked.length === 0, "switched off, a guide or gear link lands on the Learn tab with no guide on it, and a fish's page has no About", leaked);
  await setReady(READY);
  // On: the nine fish pages show the Rig Card's About; the others none.
  const abouts = [], NINE = ["king", "coho", "pink", "steelhead", "cutthroat", "surfperch", "bass", "perch", "crab"];
  for (const id of await page.evaluate(() => RIG.content.species.map((s) => s.id))) {
    await go("#/" + id, '[data-view="species"]');
    await page.waitForTimeout(60);
    const a = await page.evaluate(() => { const e = document.querySelector("[data-about]");
      return e ? { id: e.dataset.about, tell: e.querySelectorAll("[data-tell] li").length, where: e.querySelectorAll("[data-where] li").length, links: e.querySelectorAll("[data-where] a.glink").length,
        src: e.querySelectorAll("[data-sources] a").length, text: e.innerText } : null; });
    const want = NINE.includes(id);
    if (want !== !!a || (a && !(a.id === id && a.tell && a.where && a.src && !CASTAI.test(a.text) && !/\{/.test(a.text)))) abouts.push(id + " " + JSON.stringify(a).slice(0, 160));
  }
  ok(abouts.length === 0, "the nine fish pages show the Rig Card's About the fish (what it is, how to tell, where the app fishes it, its sources), and chum, squid and clams none", abouts);
  const cold = await ctx.newPage();
  await cold.clock.setFixedTime(NOW);
  await cold.goto(`http://127.0.0.1:${PORT}/rigs/#/learn/guides/salmon/tell`, { waitUntil: "load" });
  await cold.waitForSelector('[data-view="card"] .card .gpts li');
  ok(await cold.locator('[data-tab="learn"][aria-selected="true"]').count() === 1 && /Tell them apart/.test(await cold.textContent(".hero h1")),
    "opened from cold, a guide section loads its words and opens on the Learn tab");
  await cold.close();

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

  // ---- the guides --------------------------------------------------------------
  await go("#/learn/guides", "[data-guide-tiles] [data-guide-tile]");
  await page.waitForSelector('[data-guide-tile="handling"] .pic[data-plate]');
  const gt = await page.evaluate(() => [...document.querySelectorAll("[data-guide-tile]")].map((t) => {
    const p = t.querySelector(".pic"), svg = p.querySelector("svg");
    return { id: t.dataset.guideTile, href: t.getAttribute("href"), shapes: p.querySelectorAll("svg *").length, plate: p.dataset.plate || "", kind: p.dataset.viewKind || "",
      look: svg ? svg.innerHTML.replace(/vw\d+/g, "").length + ":" + [...svg.querySelectorAll("path")].slice(4, 7).map((x) => (x.getAttribute("d") || "").slice(0, 40)).join("|") : "" };
  }));
  ok(gt.map((t) => t.id).join() === "start,water,year,salmon,fly,handling,gear,safety" && gt.every((t) => t.shapes >= 8),
    "Guides: eight tiles, Start here first, each with its picture", gt.map((t) => t.id + " " + t.shapes));
  ok(new Set(gt.map((t) => t.look)).size === 8 && gt.find((t) => t.id === "handling").plate === "hook" && gt.find((t) => t.id === "gear").href === "#/learn/gear",
    "no two the same picture (handling is a hook, gear a jig), and the Gear tile opens Gear", gt.map((t) => t.id + " " + (t.plate || t.kind) + " " + t.href));
  ok(await crosses("[data-guide-tiles] .ptile"), "the tiles cross the waterline");

  await go("#/learn/guides/salmon", '[data-guide="salmon"] [data-gsec]');
  const gs = await page.evaluate(() => ({ rows: [...document.querySelectorAll('[data-guide] .row[data-gsec]')].map((r) => r.dataset.gsec), rule: document.querySelectorAll('[data-guide] .rule[data-gsec="rules"]').length,
    lines: [...document.querySelectorAll('[data-guide] .row[data-gsec] .tx > span')].every((x) => x.textContent.trim().length > 5 && !/\u2026|\.\.\.$/.test(x.textContent)),
    tiles: [...document.querySelectorAll('[data-guide] .row[data-gsec]')].map((r) => r.querySelectorAll(".tile svg *").length) }));
  ok(gs.rows.join() === "five,tell,where,gear,keep" && gs.rule === 1 && gs.lines, "a guide's sections are headlines with a whole line each; its rules are a rule row with the red edge", gs);
  ok(gs.tiles.length === 5 && gs.tiles.every((n) => n >= 6), "each section row has its own picture: a fish, a jig or the river, drawn by the app", gs.tiles);
  ok(await crosses('[data-guide] .float.list') && await sceneKind() === "river", "the salmon guide stands under the river, its list crossing the waterline");
  await go("#/learn/guides/salmon/rules", "[data-rules-pointer]");
  const rp = await page.evaluate(() => ({ links: [...document.querySelectorAll('[data-view="card"] [data-go] a')].map((a) => a.getAttribute("href")), text: document.querySelector('[data-view="card"] .card').innerText }));
  ok(rp.links.length >= 5 && rp.links.every((h) => /^#\//.test(h)) && rp.links.includes("#/coho/green-river/green-river-rules") && !/\d+ (a|per) day|\bminimum\b|\$\d/i.test(rp.text),
    "the salmon rules open on links to the app's own rules cards, and no limit is restated", rp);
  const pager = await page.evaluate(() => ({ prev: document.querySelector(".pn .prev b")?.textContent || "", next: !!document.querySelector(".pn .next b") }));
  ok(!pager.next && /Keeping a salmon/.test(pager.prev), "the pager puts Rules last, as the list does", pager);
  await go("#/learn/guides/salmon/tell", '[data-view="card"] .card .gpts li');
  const sec = await page.evaluate(() => { const c = document.querySelector('[data-view="card"] .card');
    return { first: c.querySelector(".when + *")?.tagName, pts: c.querySelectorAll(".gpts li").length, more: !!c.querySelector(".gmore:not([open])"),
      src: [...c.querySelectorAll("[data-sources] a")].map((a) => a.getAttribute("href")), text: c.innerText }; });
  ok(sec.first === "UL" && sec.pts === 5 && sec.more && /King/.test(sec.text) && /Sockeye/.test(sec.text),
    "a section opens on its points first (the five salmon told apart), with More closed", sec);
  ok(sec.src.some((h) => /eregulations\.com\/washington\/fishing\/salmon-identification/.test(h)) && sec.src.every((h) => /^#\/|^https:\/\/www\.(eregulations\.com|weather\.gov)\//.test(h)),
    "and it names its sources: the pamphlet's page on eRegulations, and the app's own", sec.src);
  await page.click('[data-view="card"] .gmore > summary');
  ok(await page.locator('[data-view="card"] .gmore[open] p').count() >= 1, "More shows the few lines behind it");

  // Every link in every guide opens a screen in the app: the hash it names,
  // no redirect, and not the Water tab standing in for a missing one.
  const links = new Set();
  for (const g of await page.evaluate(() => RIG.guides.guides.map((g) => ({ id: g.id, home: g.home, year: !!g.year, secs: g.sections.map((x) => x.id) })))) {
    const base = g.home || "#/learn/guides/" + g.id;
    for (const h of [base].concat(g.secs.map((x) => base + "/" + x))) {
      await go(h, g.year ? "[data-year]" : h === base ? "[data-guide] [data-gsec]" : '[data-view="card"] .card');
      (await page.evaluate(() => [...document.querySelectorAll("#app [data-glink], #app [data-src]")].map((a) => a.getAttribute("href")).filter((x) => /^#\//.test(x)))).forEach((x) => links.add(x));
    }
  }
  for (const id of ["king", "steelhead", "crab"]) { await go("#/" + id, "[data-about]"); (await page.evaluate(() => [...document.querySelectorAll("[data-about] a.glink, [data-about] [data-src]")].map((a) => a.getAttribute("href")).filter((x) => /^#\//.test(x)))).forEach((x) => links.add(x)); }
  const dead = [];
  for (const h of links) {
    await page.evaluate((x) => { location.hash = "#/crew"; location.hash = x; }, h);
    await page.waitForFunction(() => document.querySelector('#app [data-view]:not([data-view="wait"])') && !document.querySelector("[data-lib-wait]"), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(40);
    const r = await page.evaluate(() => ({ hash: location.hash, view: document.querySelector("#app [data-view]")?.dataset.view || "" }));
    if (r.hash !== h || !r.view || (r.view === "home" && h !== "#/water")) dead.push(h + " -> " + r.hash + " " + r.view);
  }
  ok(links.size >= 60 && dead.length === 0, "every link in every guide and About opens a screen in the app (" + links.size + " screens, each opened)", dead);

  // The year: this month open, every month what the planner lists then.
  await go("#/learn/guides/year", "[data-year] .gmonth");
  const yr = await page.evaluate(() => {
    const ms = [...document.querySelectorAll("[data-year] .gmonth")];
    const want = RIG.guides.year("2026-11-23");
    const days = (iso) => { const y = +iso.slice(0, 4), m = +iso.slice(5, 7), n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => iso + "-" + String(i + 1).padStart(2, "0")); };
    return { n: ms.length, open: ms.filter((m) => m.open).map((m) => m.dataset.month), tag: ms[0]?.querySelector(".tag.hot")?.textContent || "",
      months: ms.map((m, i) => {
        const shown = [...m.querySelectorAll("[data-plan]")].map((a) => a.dataset.plan).sort();
        const planner = [...new Set(days(m.dataset.month).flatMap((d) => RIG.trips.plansOn(d).map((p) => p.id)))].filter((id) => !RIG.trips.plans.find((p) => p.id === id).gen).sort();
        return { m: m.dataset.month, same: shown.join() === planner.join() && shown.join() === want[i].plans.slice().sort().join(), n: shown.length };
      }) };
  });
  ok(yr.n === 12 && yr.open.join() === "2026-11" && /This month/i.test(yr.tag) && yr.months[0].m === "2026-11" && yr.months[11].m === "2027-10",
    "The year in Washington: twelve months from this one, this month open and marked", yr);
  ok(yr.months.every((m) => m.same) && yr.months.reduce((n, m) => n + m.n, 0) > 100, "every month lists exactly the trips the planner lists on its days, Hot Trips' own seasons", yr.months.filter((m) => !m.same));
  ok(await crosses("[data-year]"), "the year's card crosses the waterline");
  await page.click('[data-year] .gmonth[data-month="2027-08"] > summary');
  const aug = await page.evaluate(() => document.querySelector('[data-month="2027-08"]').innerText);
  ok(/Kings from the kayak/.test(aug) && /Not listed/i.test(aug) && /Puyallup/.test(aug), "a month opens in place: August 2027 has kings from the kayak, and says why the Puyallup is not listed", aug.slice(0, 300));

  // Gear: its own home on the Learn tab.
  await go("#/learn/gear", '[data-guide="gear"] [data-gsec]');
  const gr = await page.evaluate(() => ({ rows: [...document.querySelectorAll("[data-guide] [data-gsec]")].map((r) => r.dataset.gsec), back: document.querySelector(".hero [data-up]")?.getAttribute("href"),
    chip: document.querySelector('.jump [aria-current="true"]')?.dataset.sec }));
  ok(gr.rows.length === 8 && gr.rows[0] === "lures" && gr.rows.filter((x) => /^kit-/.test(x)).length === 5 && gr.back === "#/learn" && gr.chip === "gear",
    "Gear: what each lure and rig is for, then five kits from small to big, under the Gear chip", gr);
  await go("#/learn/gear/kit-river", '[data-view="card"] .card .gpts li');
  ok(/Kit 2: the river/.test(await page.textContent(".hero h1")) && /about six dollars/.test(await page.textContent('[data-view="card"] .card')), "a kit opens, and its one price says about and where it comes from");

  // ---- a fish's page (switched on), a rig's knot, a trip ---------------------------
  await go("#/coho/green-river", '[data-about="coho"]');
  const ab = await page.evaluate(() => { const a = document.querySelector("[data-about]"); return { text: a.innerText, lures: a.querySelectorAll(".lures .tag").length, where: [...a.querySelectorAll("[data-where] li")].map((l) => l.innerText) }; });
  ok(/white gum line/i.test(ab.text) && ab.lures >= 3 && !/Did you know|by smell|jump when hooked/i.test(ab.text) && ab.where.some((w) => /The Green, September to November/.test(w)),
    "a fish's page has the Rig Card's About: how to tell it, where the app fishes it with the months from the plans, what takes it", ab);
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
  // (knots, casts, guides, the year, the rules page, a fish's About and the Learn tab)
  const openMore = async () => { await page.click('[data-view="card"] .gmore > summary'); await page.waitForSelector('[data-view="card"] .gmore[open] p'); };
  const SCREENS = [["a knot card", "#/learn/knots/double-uni", '[data-card="lib-knot-double-uni"]'], ["a cast card", "#/learn/casting/pendulum-cast", '[data-card="lib-cast-pendulum-cast"]'],
    ["a guide section", "#/learn/guides/salmon/tell", '[data-view="card"] .gpts li'],
    ["a guide section, its More open", "#/learn/guides/start/five", '[data-view="card"] .gpts li', openMore],
    ["the rules page", "#/learn/guides/salmon/rules", "[data-rules-pointer]"], ["the year", "#/learn/guides/year", "[data-year] .gmonth[open] .mlist li"],
    ["the guides", "#/learn/guides", "[data-guide-tiles] .ptile"], ["a fish's About", "#/coho/green-river", "[data-about] [data-where] li"], ["the Learn tab", "#/learn", "[data-learn-first] .row"]];
  for (const [name, hash, sel, then] of SCREENS) {
    const worst = [];
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
