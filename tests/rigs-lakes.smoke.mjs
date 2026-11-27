// The lakes in the app: what is in a lake, and where a fish is.
// Run: node tests/rigs-lakes.smoke.mjs
//
// What this guards: Lake Tapps' page opens on its tiger muskie (the card
// that crosses the waterline), with the 50 inch rule and the May 5, 2026
// plant, and lists every fish in it with a tag; the other lake spots list
// theirs; the Fish tab gains the lake fish, each drawn in filled shapes, no
// two alike; every lake fish has its page (what it is, its rule, the lakes
// it is in, nearest first, each one tappable); a lake from WDFW's map has a
// page of its own, under its own picture; the Water tab reaches every lake;
// a tag only ever says stocked, in this lake or introduced, never wild or
// native; and every word on these screens can be read under all eight skies.
// Nothing here reaches a real server: the forecast is the fixtures', the
// lakes are the committed rigs/lakes.js.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SKIES, fake, unreadable } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8813;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 600000);
watchdog.unref?.();
const NEW = ["muskie", "smallmouth", "crappie", "bluegill", "pumpkinseed", "bullhead", "catfish", "walleye", "kokanee", "browntrout", "brooktrout", "tigertrout", "goldentrout", "laketrout", "sockeye", "sturgeon"];

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
  // the lakes come after the first screen, by themselves
  await page.waitForFunction(() => window.RIG.lakesData && window.RIG.lakeFish, null, { timeout: 15000 });
  ok(true, "the lakes load after the first screen without being asked");
  const go = async (hash, sel) => {
    await page.evaluate((h) => { location.hash = "#/learn"; location.hash = h; }, hash);
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.waitForTimeout(60);
  };
  const sky = async (id, hash, sel) => {
    await page.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/learn"; location.hash = h; }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForSelector(sel, { timeout: 15000 });
    await page.waitForTimeout(80);
  };
  const crosses = (sel) => page.evaluate((q) => {
    const s = document.getElementById("scene").getBoundingClientRect(), c = document.querySelector(q), b = c && c.getBoundingClientRect();
    return b ? b.top < s.bottom - 24 && b.bottom > s.bottom && b.top > s.top : false;
  }, sel);
  const tags = () => page.evaluate(() => [...document.querySelectorAll("[data-tag]")].map((t) => t.textContent.trim()));
  const TAG = /^(Stocked [A-Z][a-z]{2} \d{1,2}, \d{4}|Stocked \d{4}|In this lake|Introduced)$/;

  // ---- Lake Tapps ------------------------------------------------------------------
  await go("#/spot/lake-tapps", "[data-lake-head] [data-plate] svg");
  const tp = await page.evaluate(() => {
    const h = document.querySelector("[data-lake-head]"), rows = [...document.querySelectorAll("[data-in-here] [data-lake-fish]")].map((r) => r.dataset.lakeFish);
    return { url: location.hash, head: h.dataset.lakeHead, first: document.querySelector('[data-view="spot"] .float') === h, rule: (h.querySelector("[data-head-rule]") || {}).textContent || "",
      plant: (h.querySelector(".plant") || {}).textContent || "", tag: (h.querySelector("[data-tag]") || {}).textContent || "", rows, cards: [...document.querySelectorAll("[data-row-species]")].map((r) => r.dataset.rowSpecies) };
  });
  ok(tp.url === "#/spot/lake-tapps" && tp.head === "muskie" && tp.first, "Lake Tapps opens on its tiger muskie, the first card (it no longer skips to its one card)", tp);
  ok(/50 inches to keep, 1 a day: nearly all are released/.test(tp.rule) && /page 25/.test(tp.rule), "with its rule: 50 inches to keep, 1 a day, from the pamphlet's page 25", tp.rule);
  ok(/1,631 planted May 5, 2026, the 21st plant since 2000/.test(tp.plant) && /Stocked May 5, 2026/.test(tp.tag), "and the May 5, 2026 plant", [tp.plant, tp.tag]);
  ok(tp.rows[0] === "muskie" && ["smallmouth", "crappie", "perch", "bass", "trout"].every((id) => tp.rows.includes(id)), "What's in here: tiger muskie first, then the rest of the lake's fish", tp.rows);
  ok(tp.cards.includes("perch"), "and the lake's cards still follow", tp.cards);
  ok(await crosses("[data-lake-head]"), "the tiger muskie card crosses the waterline");
  const tt = await tags();
  ok(tt.length >= 6 && tt.every((t) => TAG.test(t)), "every tag says stocked (with its date), in this lake, or introduced", tt);
  await page.locator('[data-in-here] [data-lake-fish="muskie"]').click();
  await page.waitForSelector('[data-view="lakefish"][data-fish="muskie"]');
  ok(true, "a fish in the lake opens its fish page");

  // ---- the other lake spots ------------------------------------------------------------
  for (const [spot, must] of [["lake-fenwick", ["bass", "perch", "trout"]], ["american-lake", ["kokanee", "trout", "smallmouth"]]]) {
    await go("#/spot/" + spot, "[data-in-here] [data-lake-fish]");
    const f = await page.evaluate(() => [...document.querySelectorAll("[data-in-here] [data-lake-fish], [data-in-here-old] [data-lake-fish]")].map((r) => r.dataset.lakeFish));
    ok(must.every((id) => f.includes(id)), spot + " lists what is in it", f);
    ok((await tags()).every((t) => TAG.test(t)), spot + ": its tags say only stocked, in this lake or introduced");
  }

  // ---- the Fish tab --------------------------------------------------------------------
  await go("#/fish", '[data-family="lakefish"] .pickcard [data-plate] svg');
  const tiles = await page.evaluate(() => [...document.querySelectorAll('[data-family="lakefish"] .pickcard')].map((t) => {
    const a = t.querySelector("[data-plate]"), svg = a && a.querySelector("svg"), b = svg && svg.getBoundingClientRect();
    return { id: t.dataset.lakefish, plate: a ? a.dataset.plate : "", shapes: svg ? svg.querySelectorAll("path, ellipse, circle").length : 0, fills: svg ? svg.querySelectorAll("linearGradient, radialGradient").length : 0,
      w: b ? Math.round(b.width) : 0, name: (t.querySelector(".nm") || {}).textContent || "", meta: (t.querySelector(".meta") || {}).textContent || "" };
  }));
  ok(JSON.stringify(tiles.map((t) => t.id)) === JSON.stringify(NEW), "the Fish tab gains a Lake fish group: all sixteen, tiger muskie first", tiles.map((t) => t.id));
  ok(tiles.every((t) => t.plate === t.id && t.shapes >= 15 && t.fills >= 1 && t.w >= 120 && t.name), "each drawn in filled shapes, its own drawing, with its name", tiles.filter((t) => !(t.plate === t.id && t.shapes >= 15 && t.fills >= 1)));
  const allPlates = await page.evaluate(() => [...document.querySelectorAll(".pickcard [data-plate]")].map((a) => a.dataset.plate));
  ok(new Set(allPlates).size === allPlates.length, "no two fish on the Fish tab share a drawing", allPlates);
  ok(tiles.every((t) => t.meta), "each says where it is (lakes and the nearest), or its high lakes", tiles.filter((t) => !t.meta).map((t) => t.id));
  ok(await page.locator(".top .jump [data-lakefish]").count() === NEW.length, "every lake fish is one tap away in the strip under Fish");
  await page.locator('[data-family="lakefish"] .pickcard[data-lakefish="walleye"]').click();
  await page.waitForSelector('[data-view="lakefish"][data-fish="walleye"]');
  ok(true, "a lake fish tile opens its page");

  // ---- every lake fish's page ---------------------------------------------------------------
  const pages = [];
  for (const id of NEW.concat(["bass", "perch", "trout", "cutthroat"])) {
    await go("#/fish/" + id, '[data-view="lakefish"] [data-fish-rule]');
    pages.push(await page.evaluate((id) => {
      const v = document.querySelector('[data-view="lakefish"]'), plate = v.querySelector("[data-plate-card] [data-plate] svg");
      const lakes = [...v.querySelectorAll("[data-fish-lakes] [data-lake-row]")].map((r) => ({ id: r.dataset.lakeRow, href: r.getAttribute("href"), km: +((/(\d+) km/.exec(r.textContent) || [])[1] || -1) }));
      return { id, title: v.querySelector(".hero h1").textContent, plate: !!plate, rule: v.querySelector("[data-fish-rule]").textContent, what: !!v.querySelector("[data-plate-card] .hint"),
        whenHow: !!v.querySelector("[data-when-how]"), lakes, old: v.querySelectorAll("[data-fish-old] [data-lake-row]").length, high: !!v.querySelector("[data-high-lakes]"), all: !!v.querySelector("[data-all-lakes]") };
    }, id));
  }
  const bad = pages.filter((p) => !(p.plate && p.title && /pamphlet, page 2[345]/.test(p.rule)));
  ok(!bad.length, "every lake fish has its page: drawn, named, with its rule and its pamphlet page", bad);
  ok(pages.filter((p) => p.id !== "sturgeon" && p.id !== "cutthroat" && NEW.includes(p.id)).every((p) => p.what && p.whenHow), "what it is, and when and how", pages.filter((p) => !(p.what && p.whenHow)).map((p) => p.id));
  ok(pages.every((p) => p.lakes.length || p.high || p.old), "and where it is: the lakes it is in now, its high lakes, or its older records", pages.filter((p) => !p.lakes.length && !p.high && !p.old).map((p) => p.id));
  ok(pages.every((p) => p.lakes.every((l, i) => !i || p.lakes[i - 1].km <= l.km) && p.lakes.every((l) => /^#\/(lake|spot)\//.test(l.href))), "the lakes come nearest first, each one tappable", pages.map((p) => p.id + ":" + p.lakes.map((l) => l.km).join(",")));
  const mp = pages.find((p) => p.id === "muskie");
  ok(mp.lakes[0].id === "lake-tapps-pierce" && mp.lakes[0].href === "#/spot/lake-tapps" && /50 inches to keep/.test(mp.rule), "the tiger muskie page: Lake Tapps nearest, opening the app's own Lake Tapps page", mp);

  // ---- a lake of its own ---------------------------------------------------------------------
  await go("#/fish/muskie", '[data-fish-lakes] [data-lake-row="mayfield-lake-lewis"]');
  await page.locator('[data-fish-lakes] [data-lake-row="mayfield-lake-lewis"]').click();
  await page.waitForSelector('[data-view="lake"][data-lake="mayfield-lake-lewis"] [data-in-here]');
  const may = await page.evaluate(() => {
    const s = document.getElementById("scene"), v = document.querySelector('[data-view="lake"]');
    return { kind: s.getAttribute("data-scene"), kids: s.querySelectorAll("svg *").length, back: v.querySelector(".hero .back").getAttribute("href"), head: (v.querySelector("[data-lake-head]") || {}).dataset,
      facts: v.querySelector("[data-lake-facts]").textContent, fish: [...v.querySelectorAll("[data-lake-fish]")].map((r) => r.dataset.lakeFish) };
  });
  ok(may.kind === "lake" && may.kids > 20, "a lake from WDFW's map stands under a painted lake", may);
  ok(may.back === "#/fish/muskie" && may.head && may.head.lakeHead === "muskie" && may.fish.includes("muskie") && /2,022/.test(may.facts) && /Boat ramp/.test(may.facts),
    "Mayfield Lake: back to the fish it came from, its tiger muskie, what is in it, its acres and its ramp", may);
  ok(await crosses('[data-view="lake"] > .float'), "its first card crosses the waterline");

  // ---- the Water tab reaches every lake ----------------------------------------------------------
  await go("#/water/lake", "[data-more-lakes] [data-lake-row]");
  ok(await page.locator('[data-more-lakes] a[href="#/lakes"]').count() === 1, "the Lake page lists the nearest lakes and a way to all of them");
  await page.locator('[data-more-lakes] a[href="#/lakes"]').click();
  await page.waitForSelector('[data-view="lakes"] [data-lakes-near] [data-lake-row]');
  const n0 = await page.locator("[data-lake-row]").count();
  await page.locator("[data-lakes-all]").click();
  await page.waitForFunction((n) => document.querySelectorAll("[data-lake-row]").length > n, n0);
  const nAll = await page.evaluate(() => [document.querySelectorAll("[data-lake-row]").length, RIG.lakesData.lakes.length]);
  ok(nAll[0] === nAll[1] && nAll[0] > 400, "and every lake in range, nearest first", nAll);

  // ---- the screens can be read under every sky -----------------------------------------------------
  // (Each screen's own words, under its title in the sky; the dock over them
  // is the same on every screen and is measured by tests/rigs-look.smoke.mjs.)
  const SCREENS = [["the Fish tab's lake fish", "#/fish", '[data-family="lakefish"] .pickcard [data-plate] svg', '[data-family="lakefish"]'],
    ["the tiger muskie page", "#/fish/muskie", "[data-fish-rule]", "[data-view]"], ["Lake Tapps", "#/spot/lake-tapps", "[data-lake-head] svg", "[data-view]"],
    ["Mayfield Lake", "#/lake/mayfield-lake-lewis", "[data-in-here]", "[data-view]"], ["the lakes", "#/lakes", "[data-lakes-near]", "[data-view]"],
    ["sturgeon's older records", "#/fish/sturgeon", "[data-fish-old]", "[data-view]"]];
  for (const id of SKIES) {
    for (const [name, hash, sel, within] of SCREENS) {
      await sky(id, hash, sel);
      const r = await unreadable(page, within);
      ok(r.n > 10 && !r.bad.length, name + " can be read under " + id, r.bad.slice(0, 6));
    }
  }
  ok(!errors.length, "no page errors", errors);
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
