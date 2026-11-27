// Each spot's own picture, in the real app (stage E2: the app knows the spot).
// Run: node tests/rigs-spots-app.smoke.mjs
//
// What this guards: the page loads rigs/spots-scene.js after trips.js and
// waters.js, and the offline shell keeps it; a run card, the crew trip
// page, a spot page and every Hot Trips row paint the spot's own picture at
// the trip's own hour and today's water (the tide the page already has);
// the routing Coach settled holds on rendered run cards: a salmon trip on
// the Green is the Auburn Narrows and a steelhead trip or the Green's own
// page is Flaming Geyser; Dash Point by kayak is the kayak launch and a
// cutthroat trip the state park beach; Westport crab is Float 20; Bonney
// Lake is a gravel launch with no dock and no pier; Rainier stands in the
// picture only at Fox Island; two rows of the same kind of water (two lakes,
// two piers) have thumbnails of their own; the picture is painted again only
// when the spot, the hour or the water changes, not on every redraw.
// Trips no fixture week lists (pink on the Green or at Dash Point, winter
// steelhead on the Green: their rules are not settled, so the week leaves
// them out) are painted through the page's own paint (RIG.picture.paint)
// into a scene element the same way the page paints its own.
// Fix round 2: every run card's night is lit (no dark slab where a spot
// closes after dark: the towns' glow and its sheen, the moon where it is),
// the Narrows' grove stands under the title's chips, Redondo's lamp heads
// stand clear of them, a one-spot Water tile frames that spot on what it is
// known by, and Rainier's summit at Fox Island stands clear of the tag.
// Nothing here reaches a real server: the forecast and the crew are stubs.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SPRING_DAYS, SPRING_NOW, SEPT_DAYS, SEPT_NOW, DEC_DAYS, DEC_NOW, fake, decodePng } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8817;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 300000);
watchdog.unref?.();

// The offline shell keeps the file (rigs/sw.js), and the page loads it in order.
const sw = readFileSync(join(ROOT, "rigs/sw.js"), "utf8"), html = readFileSync(join(ROOT, "rigs/index.html"), "utf8");
ok(/"\/rigs\/spots-scene\.js"/.test(sw.slice(sw.indexOf("SHELL"), sw.indexOf("EXTRA"))), "the service worker's shell list keeps /rigs/spots-scene.js");
const at = (f) => html.indexOf('<script src="/rigs/' + f + '"></script>');
ok(at("spots-scene.js") > at("trips.js") && at("spots-scene.js") > at("waters.js") && at("trips.js") > 0 && at("waters.js") > 0 && at("spots-scene.js") < html.indexOf("RIG.version"),
  "the page loads spots-scene.js after trips.js and waters.js, before the app's own script");

const T = (iso, plan) => "#/trips/" + encodeURIComponent(iso + "~" + plan);
const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();
  async function week(days, now) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(ctx, days ? { days, now } : {});
    const page = await ctx.newPage();
    await page.clock.setFixedTime(now || NOW);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "#/trips", { waitUntil: "load" });
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    return { ctx, page, errors };
  }
  const sky = async (page, id, hash) => {
    await page.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/learn"; location.hash = h; }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForTimeout(60);
  };
  // What the big picture on screen is: its kind, its spot and stand, and what is in it.
  const scene = (page) => page.evaluate(() => {
    const s = document.getElementById("scene"); let p = {};
    try { p = JSON.parse(s.dataset.paint || "{}"); } catch (e) { /* none */ }
    return { kind: s.getAttribute("data-scene"), spot: s.dataset.spot || "", stand: s.getAttribute("data-stand") || "", now: p.now || null, fish: p.fish || "", how: p.how || "",
      rainier: [...s.querySelectorAll("g.w-mtn[transform]")].length, kayak: s.querySelectorAll(".w-kayak").length, gravel: s.querySelectorAll(".w-gravel").length,
      dock: s.querySelectorAll(".w-dock, .w-decktop").length, pier: s.querySelectorAll(".w-crowd, .w-deckpoolg, .w-rail").length + (p.parts || []).filter((q) => q.t === "pier").length, stood: p.lake ? p.lake.stand : "", kids: s.querySelectorAll("svg *").length, title: (document.querySelector(".hero h1") || {}).textContent || "" };
  });
  const card = async (page, hash) => {
    await sky(page, "overcast", hash);
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    return scene(page);
  };
  // Paint any plan's picture the way the page does, into a scene element of its own.
  const paintOf = (page, spot, fish, iso, planId, kind) => page.evaluate(([spot, fish, iso, planId, kind]) => {
    const el = document.createElement("div"); el.className = "scene"; el.setAttribute("data-scene", kind);
    RIG.water.scene(el, RIG.picture.paint(spot, fish, { iso, from: 8, planId }));
    return { kind: el.getAttribute("data-scene"), stand: el.getAttribute("data-stand") || "", rainier: el.querySelectorAll("g.w-mtn[transform]").length };
  }, [spot, fish, iso, planId, kind]);
  // (fix-2, V1-1) a run card's picture at night, in the band between the
  // chips under its title and its first card: the brightest one pixel in a
  // hundred is at least 105 of 255, and some of it is warm (the towns' glow
  // on the cloud and the water, a lamp) or silver (the moon): a night that
  // is lit, never a dark slab (the approved pier night is 121)
  const nightBand = async (page, hash) => {
    await sky(page, "night", hash);
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    await page.waitForTimeout(120);
    const b = await page.evaluate(() => {
      const hero = document.querySelector('[data-view="hot"] > .hero'); let bottom = 0;
      [].forEach.call(hero.children, (c) => { if (c.offsetHeight) bottom = Math.max(bottom, c.getBoundingClientRect().bottom); });
      let el = hero.nextElementSibling; while (el && !el.offsetHeight) el = el.nextElementSibling;
      return { y0: Math.ceil(bottom), y1: Math.floor(el.getBoundingClientRect().top), spot: document.getElementById("scene").dataset.spot || "" };
    });
    const img = decodePng(await page.screenshot({ clip: { x: 0, y: b.y0, width: 390, height: b.y1 - b.y0 } }));
    const n = img.w * img.h, Y = new Float32Array(n); let lit = 0;
    for (let i = 0; i < n; i++) {
      const o = i * img.bpp, R = img.px[o], G = img.px[o + 1], B = img.px[o + 2], y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      Y[i] = y; if ((R - B > 30 && y > 70) || (y > 110 && Math.abs(R - B) < 25)) lit++;
    }
    Y.sort();
    return { hash: decodeURIComponent(hash.replace("#/trips/", "")), spot: b.spot, p99: Math.round(Y[Math.floor(n * 0.99)]), lit: Math.round((lit / n) * 1000) / 10 };
  };
  const nightAll = async (page, label) => {
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const keys = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-day]")].flatMap((d) => [...d.querySelectorAll("[data-hot]")].map((r) => d.dataset.day + "~" + r.dataset.hot)))]);
    const out = [];
    for (const k of keys) { const [iso, plan] = k.split("~"); out.push(await nightBand(page, T(iso, plan))); }
    const dark = out.filter((c) => c.p99 < 105 || c.lit < 0.3);
    ok(out.length >= 3 && out.every((c) => c.spot) && !dark.length, label + ": every run card's picture is lit at night (brightest 1% at least 105, some warm or silver light over the card)", dark.length ? dark : out.map((c) => [c.spot, c.p99, c.lit]));
    return out;
  };
  const allCards = async (page) => {
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const keys = await page.evaluate(() => [...document.querySelectorAll("[data-day]")].flatMap((d) => [...d.querySelectorAll("[data-hot]")].map((r) => d.dataset.day + "~" + r.dataset.hot)));
    const out = [];
    for (const k of [...new Set(keys)]) { const [iso, plan] = k.split("~"); out.push(Object.assign({ key: k }, await card(page, T(iso, plan)))); }
    return out;
  };

  // ---- a November week --------------------------------------------------------------------
  {
    const { ctx, page, errors } = await week();
    ok(await page.evaluate(() => typeof RIG.spotScene === "function" && typeof RIG.spotNow === "function" && typeof RIG.picture.paint === "function"), "the page has the spot pictures: RIG.spotScene, RIG.spotNow and its own paint");
    const coho = await card(page, T("2026-11-26", "coho-green-river"));
    ok(coho.kind === "river" && coho.spot === "green-river" && coho.stand === "narrows" && coho.kids > 100, "a coho trip on the Green: its run card stands at the Auburn Narrows", coho);
    ok(coho.now && coho.now.date === "2026-11-26T07:31" && coho.fish === "coho", "painted at the trip's own hour (7:31 AM on its day), for its fish", coho.now);
    // (fix-2, V1-6) the grove stands under the chips: no fitted crown climbs
    // over their bottom, and the near trunks (leaning out past the edge) fade out above it
    const grove = await page.evaluate(() => {
      const hero = document.querySelector('[data-view="hot"] > .hero'); let bottom = 0;
      [].forEach.call(hero.children, (c) => { if (c.offsetHeight) bottom = Math.max(bottom, c.getBoundingClientRect().bottom); });
      const g = document.querySelector("#scene .w-grove"); if (!g) return null;
      const svg = g.ownerSVGElement, m = svg.getScreenCTM(), gr = svg.querySelector('linearGradient[id$="f-gcapg"]');
      return { chips: Math.round(bottom), top: Math.round(Math.min(...[...g.querySelectorAll("[data-fit] path")].map((q) => q.getBoundingClientRect().top))), fade: gr ? Math.round(+gr.getAttribute("y1") * m.d + m.f) : null, masked: !!g.querySelector("g[mask] g[transform]") };
    });
    ok(grove && grove.top >= grove.chips && grove.masked && grove.fade >= grove.chips, "the Narrows' grove stands under the title's chips: its crowns below them, its near trunks leaning out and fading out above them", grove);
    const chum = await card(page, T("2026-11-28", "chum-green-river"));
    ok(chum.stand === "narrows" && chum.spot === "green-river", "a chum trip on the Green: the Auburn Narrows", chum);
    const pink = await paintOf(page, "green-river", "pink", "2027-09-10", "pink-green-river", "river"), steel = await paintOf(page, "green-river", "steelhead", "2026-12-12", "steelhead-green-river", "river");
    ok(pink.stand === "narrows" && steel.stand === "geyser", "a pink trip on the Green is the Auburn Narrows, a steelhead trip Flaming Geyser (painted through the page's own paint)", [pink, steel]);
    await sky(page, "overcast", "#/spot/green-river");
    await page.waitForSelector('[data-view="spot"] [data-row-species]');
    const gp = await scene(page);
    ok(gp.kind === "river" && gp.spot === "green-river" && gp.stand === "geyser" && !gp.fish, "the Green's own spot page: Flaming Geyser", gp);
    // (fix-1, function-1) a fish's own page at a spot paints the stand that fish is fished from
    await sky(page, "overcast", "#/cutthroat/dash-point");
    await page.waitForSelector('[data-view] .hero h1');
    const cutP = await scene(page);
    ok(cutP.spot === "dash-point" && cutP.stand === "state" && cutP.kayak === 0, "the cutthroat page at Dash Point: the state park beach, no kayak", cutP);
    await sky(page, "overcast", "#/coho/dash-point");
    await page.waitForSelector('[data-view] .hero h1');
    const cohoP = await scene(page);
    ok(cohoP.stand === "city" && cohoP.kayak >= 1, "the coho page at Dash Point: the kayak launch", cohoP);
    // (fix-1, function-2 and function-7) the list a page is opened from picks the stand: its rows and the spot page
    const rowsOf = async (hash) => { await sky(page, "overcast", hash); await page.waitForSelector('[data-view="water"] .row[data-spot] svg'); return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-view="water"] .row[data-spot]')].map((r) => { const v = r.querySelector(".tile svg"); return [r.dataset.spot, { spot: v.getAttribute("data-paint-spot") || "", stand: v.getAttribute("data-stand") || "", scene: v.getAttribute("data-scene") }]; }))); };
    const pierRows = await rowsOf("#/water/pier");
    ok(pierRows.westport && pierRows.westport.spot === "westport" && pierRows.westport.stand === "float" && pierRows.westport.scene === "pier", "the Pier list: Westport's row is Float 20 (a pier), not the surf beach", pierRows.westport);
    ok(Object.values(pierRows).every((r) => r.spot), "and every row's thumbnail says which spot it paints (data-paint-spot)", pierRows);
    await page.evaluate(() => { location.hash = "#/spot/westport"; });
    await page.waitForSelector('[data-view="spot"] [data-row-species]');
    const wps = await scene(page);
    ok(wps.spot === "westport" && wps.stand === "float" && wps.kind === "pier", "Westport's spot page opened from the Pier list: Float 20", wps);
    const beachRows = await rowsOf("#/water/beach");
    ok(beachRows["dash-point"] && beachRows["dash-point"].stand === "state", "the Beach list: Dash Point's row is the state park beach", beachRows["dash-point"]);
    // (fix-1, look-19) a kind of water with one spot shows that spot's own picture on its home tile
    await sky(page, "overcast", "#/water");
    await page.waitForSelector('[data-view="home"] [data-type-tile]');
    const tiles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-type-tile]")].map((t) => [t.dataset.typeTile, { n: +((t.querySelector(".meta") || {}).textContent || "0").replace(/\D/g, ""), spot: (t.querySelector("svg") || { getAttribute: () => "" }).getAttribute("data-paint-spot") || "" }])));
    ok(Object.values(tiles).filter((t) => t.n === 1).every((t) => t.spot) && tiles.river && tiles.river.spot === "green-river", "a kind of water with one spot paints that spot on its home tile (River: the Green)", tiles);
    // (fix-2, V1-5) and frames it on what that spot is known by: Flaming Geyser's bar and riffle, Lake Fenwick's pier and its big shore tree
    const frames = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-type-tile] svg[data-paint-spot]")].map((v) => [v.getAttribute("data-paint-spot"), v.getAttribute("viewBox")])));
    ok(frames["green-river"] === "0 132 390 150" && frames["lake-fenwick"] === "64 92 326 184", "the River tile frames Flaming Geyser's bar and riffle, the Lake tile Lake Fenwick's pier and shore tree", frames);
    const cut = await card(page, T("2026-11-26", "cutthroat-dash-point"));
    ok(cut.spot === "dash-point" && cut.stand === "state" && cut.kayak === 0, "a cutthroat trip at Dash Point: the state park beach, no kayak", cut);
    const bon = await card(page, T("2026-11-26", "trout-w-l466"));
    ok(bon.kind === "lake" && bon.spot === "w-l466" && bon.stood === "gravel" && bon.gravel >= 1 && bon.dock === 0 && bon.pier === 0 && bon.rainier === 0, "Bonney Lake: a gravel launch, no dock and no pier", bon);
    // The tide the page already has, painted in: a squid evening starts at the high water (the fixture's 12 ft at 5:15 PM).
    const red = await card(page, T("2026-11-24", "squid-redondo"));
    // (fix-2, V1-7) no lamp head is hidden behind a chip or crowds one: each
    // stands 8 px clear of every chip, or shows just under it (its pole
    // ending below the chip, the head in sight), never at its sides or top
    const heads = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[data-view="hot"] > .hero .chips > *')].map((c) => c.getBoundingClientRect());
      return [...document.querySelectorAll("#scene .w-bulb")].map((b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { x: Math.round(x), y: Math.round(y), bad: chips.some((c) => x > c.left - 8 && x < c.right + 8 && y > c.top - 8 && y < c.bottom + 8 && !(y > c.bottom + 1 && x > c.left + 4 && x < c.right - 4)) }; });
    });
    ok(heads.length >= 3 && heads.every((h) => !h.bad), "Redondo: no lamp head is hidden behind the title's chips or crowds one (each clear of them, or in sight just under one)", heads);
    ok(red.spot === "redondo" && red.now && red.now.date === "2026-11-24T17:00" && red.now.tide > 0.9 && red.now.tideM > 3.4, "Redondo squid: the run card's water stands at that evening's high tide", red.now);
    // Not on every redraw: the same card drawn again keeps its painting.
    await page.evaluate(() => { document.getElementById("scene").querySelector("svg").setAttribute("data-mark", "1"); });
    await page.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo") + "/gear"; });
    await page.waitForSelector('[data-view="card"] .card');
    await page.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"); });
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    ok(await page.evaluate(() => !!document.querySelector('#scene svg[data-mark="1"]')), "the picture is not painted again on a redraw of the same trip (same spot, hour and water)");
    await page.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-26~squid-redondo"); });
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    ok(await page.evaluate(() => !document.querySelector('#scene svg[data-mark="1"]')), "and it is painted again for the same spot on another day (another hour and water)");
    // Rainier only at Fox Island: none on any run card this week.
    const cards = await allCards(page);
    ok(cards.length >= 6 && cards.every((c) => c.spot && c.kids > 50), "every run card of the week stands under its own spot's picture", cards.map((c) => [c.key, c.spot]));
    ok(cards.every((c) => c.rainier === 0), "and none of them has Rainier in it (only Fox Island does)", cards.filter((c) => c.rainier).map((c) => c.key));
    // Every Hot Trips row's thumbnail is its own spot's.
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-day] [data-hot]")].map((r) => { const v = r.querySelector(".tile svg"); return { id: r.dataset.hot, spot: v.getAttribute("data-spot") || "", stand: v.getAttribute("data-stand") || "" }; }));
    ok(rows.length >= 10 && rows.every((r) => r.spot), "every Hot Trips row's thumbnail is painted from its own spot", rows.filter((r) => !r.spot));
    ok(rows.filter((r) => /green-river/.test(r.id)).every((r) => r.stand === "narrows") && rows.filter((r) => /dash-point/.test(r.id)).every((r) => r.stand === "state"),
      "and its own stand: the Green's salmon rows at the Narrows, the Dash Point cutthroat row on the state beach", rows.filter((r) => /green|dash/.test(r.id)));
    // (the crew trip page's own picture is checked in tests/rigs-look-crew.smoke.mjs, with the stub crew)
    await nightAll(page, "November");
    ok(!errors.length, "no page errors in the November week", errors);
    await ctx.close();
  }

  // ---- a September week: Dash Point by kayak, Westport crab --------------------------------------
  {
    const { ctx, page, errors } = await week(SEPT_DAYS, SEPT_NOW);
    for (const plan of ["coho-dash-point", "king-dash-point"]) {
      const c = await card(page, T("2027-09-18", plan));
      ok(c.spot === "dash-point" && c.stand === "city" && c.how === "kayak" && c.kayak >= 1, plan + ": the run card stands at the kayak launch, the kayak on the sand", c);
    }
    const pinkDP = await paintOf(page, "dash-point", "pink", "2027-09-10", "pink-dash-point", "sound");
    ok(pinkDP.stand === "city", "a pink trip at Dash Point (by kayak) is the kayak launch too", pinkDP);
    const cutS = await card(page, T("2027-09-18", "cutthroat-dash-point"));
    ok(cutS.stand === "state" && cutS.kayak === 0, "and the cutthroat trip that same day is the state park beach", cutS);
    const crab = await card(page, T("2027-09-18", "crab-westport"));
    ok(crab.spot === "westport" && crab.stand === "float" && crab.kind === "pier", "Westport crab: the run card stands on Float 20", crab);
    const coho = await card(page, T("2027-09-18", "coho-green-river"));
    ok(coho.stand === "narrows", "a September coho trip on the Green: the Auburn Narrows", coho);
    const cards = await allCards(page);
    ok(cards.length >= 4 && cards.every((c) => c.spot && c.rainier === 0), "no run card this week has Rainier", cards.filter((c) => c.rainier || !c.spot).map((c) => c.key));
    await nightAll(page, "September");
    ok(!errors.length, "no page errors in the September week", errors);
    await ctx.close();
  }

  // ---- a spring week: Fox Island, two lakes, two piers ---------------------------------------------
  {
    const { ctx, page, errors } = await week(SPRING_DAYS, SPRING_NOW);
    const cards = await allCards(page);
    const fox = cards.filter((c) => c.spot === "fox-island"), rest = cards.filter((c) => c.spot !== "fox-island");
    ok(fox.length >= 1 && fox.every((c) => c.rainier === 1), "Fox Island's run card has Rainier, big and white across the water (proven there)", fox);
    ok(rest.length >= 4 && rest.every((c) => c.rainier === 0), "and no other run card of the week does", rest.filter((c) => c.rainier).map((c) => c.key));
    // (fix-2, V1-9) Rainier's summit stands clear of the title's tag
    await card(page, "#/trips/" + encodeURIComponent(fox[0].key));
    const summit = await page.evaluate(() => {
      const g = document.querySelector("#scene g.w-mtn[transform]"), m = g.getScreenCTM(), tags = [...document.querySelectorAll('[data-view="hot"] > .hero .chips > *')].map((c) => c.getBoundingClientRect());
      const x = 119 * m.a + m.e, y = 4.6 * m.d + m.f;
      return { x: Math.round(x), y: Math.round(y), clear: tags.every((c) => x < c.left - 4 || x > c.right + 4 || y < c.top - 4 || y > c.bottom + 4) };
    });
    ok(summit.clear, "Fox Island: Rainier's summit stands clear of the chips under the title", summit);
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    // Two rows of the same kind of water have thumbnails of their own (the
    // gradient ids are numbered per drawing, so those are set aside).
    const thumbs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-day] [data-hot]")].map((r) => [r.dataset.hot,
      { kind: r.querySelector(".tile").dataset.mini, spot: r.querySelector(".tile svg").getAttribute("data-spot"), art: r.querySelector(".tile svg").innerHTML.replace(/mn\d+/g, "") }])));
    const pairs = [["trout-fenwick", "trout-american"], ["salmon-fox-island", "crab-westport"]];
    for (const [a, b] of pairs) {
      const A = thumbs[a], B = thumbs[b];
      ok(A && B && A.kind === B.kind && A.spot !== B.spot && A.art !== B.art, "two " + (A && A.kind) + " rows, " + a + " and " + b + ": each thumbnail is its own spot's, not the same picture", A && B ? [A.kind, A.spot, B.kind, B.spot] : [a, b]);
    }
    await nightAll(page, "Spring");
    ok(!errors.length, "no page errors in the spring week", errors);
    await ctx.close();
  }

  // ---- a December week: Tokul and the Cowlitz, lit by the sky after dark ------------------------
  {
    const { ctx, page, errors } = await week(DEC_DAYS, DEC_NOW);
    const out = await nightAll(page, "December");
    ok(out.some((c) => c.spot === "tokul"), "the December week has its Tokul trip (lit at night above)", out.map((c) => c.spot));
    ok(!errors.length, "no page errors in the December week", errors);
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
